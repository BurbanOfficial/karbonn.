require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const QONTO_BASE_URL = 'https://thirdparty.qonto.com/v2';

let qontoBankIban = process.env.QONTO_IBAN ? process.env.QONTO_IBAN.replace(/\s/g, '') : null;
async function loadQontoBankAccount() {
  if (qontoBankIban) {
    console.log('Qonto IBAN loaded from env:', qontoBankIban);
    return;
  }
  try {
    const data = await qontoRequest('/bank_accounts?includes[]=iban');
    const main = (data.bank_accounts || []).find(a => a.main) || data.bank_accounts?.[0];
    if (main) qontoBankIban = main.iban;
    console.log('Qonto IBAN loaded:', qontoBankIban);
  } catch (err) {
    console.error('Failed to load Qonto bank account:', err.message);
  }
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  } else {
    admin.initializeApp();
  }
}
initFirebaseAdmin();

const db = admin.firestore();

app.use(express.json());

const allowedOriginsCors = cors({
  origin: (origin, callback) => {
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['*'];
    if (!origin || allowed.includes('*') || allowed.includes(origin)) callback(null, true);
    else callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
});

app.use((req, res, next) => {
  if (req.path === '/api/chat') return next();
  allowedOriginsCors(req, res, next);
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

async function verifyAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '') || null;
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

async function requireManager(req, res, next) {
  try {
    const doc = await db.collection('users').doc(req.user.uid).get();
    if (!doc.exists) return res.status(403).json({ error: 'User profile not found' });
    const role = doc.data().role;
    const label = typeof role === 'object' ? role.label : role;
    if (label !== 'Manager') return res.status(403).json({ error: 'Manager access required' });
    next();
  } catch {
    res.status(500).json({ error: 'Failed to verify role' });
  }
}

const chatCors = cors({ origin: '*', credentials: false });

app.options('/api/chat', chatCors, (req, res) => {
  console.log('[CHAT CORS] OPTIONS preflight hit — origin:', req.headers.origin);
  res.sendStatus(204);
});

app.options('/api/*', allowedOriginsCors);
app.use('/api', (req, res, next) => {
  if (req.path === '/chat') return next();
  if (req.method === 'OPTIONS') return next();
  verifyAuth(req, res, next);
}, (req, res, next) => {
  if (req.path === '/chat') return next();
  requireManager(req, res, next);
});

async function qontoRequest(path, options = {}) {
  const response = await fetch(`${QONTO_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': process.env.QONTO_API_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  if (text) try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) {
    const err = new Error(data?.errors?.[0]?.detail || data?.error || `Qonto API error ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function parseAddress(str) {
  if (!str) return { address: '', city: '', zipCode: '' };
  const parts = str.split(',').map(p => p.trim()).filter(Boolean);
  const address = parts[0] || '';
  let city = '', zipCode = '';
  if (parts.length > 1) {
    const m = parts[parts.length - 1].match(/^(\d{4,5})\s+(.+)$/);
    if (m) { zipCode = m[1]; city = m[2].replace(/\s*\([^)]*\)\s*$/, '').trim(); }
    else city = parts[parts.length - 1];
  }
  return { address, city, zipCode };
}

function buildAddress(client) {
  if (client.rue && client.codePostal && client.ville) {
    return { address: client.rue.trim(), city: client.ville.trim(), zipCode: client.codePostal.trim() };
  }
  return parseAddress(client.adresse || '');
}

function buildQontoPayload(client) {
  const isPro = client.type === 'professionnel';
  const addr = buildAddress(client);
  const payload = {
    kind: isPro ? 'company' : 'individual',
    currency: 'EUR',
    locale: 'FR',
  };
  if (client.email) payload.email = client.email;
  if (addr.address) payload.billing_address = {
    street_address: addr.address,
    city: addr.city || undefined,
    zip_code: addr.zipCode || undefined,
    country_code: 'FR',
  };
  if (isPro) {
    payload.name = client.entreprise || `${client.prenom || ''} ${client.nom || ''}`.trim();
    if (client.prenom) payload.first_name = client.prenom;
    if (client.nom) payload.last_name = client.nom;
    if (client.siret) payload.tax_identification_number = client.siret;
    if (client.tva) payload.vat_number = client.tva;
  } else {
    payload.first_name = client.prenom || '';
    payload.last_name = client.nom || '';
  }
  if (client.telephone) {
    const phone = client.telephone.replace(/\s/g, '');
    payload.phone = { country_code: '+33', number: phone.replace(/^(\+33|0033|0)/, '') };
  }
  return payload;
}

// Create client → Qonto + Firestore
app.post('/api/clients', async (req, res) => {
  const { client } = req.body;
  if (!client) return res.status(400).json({ error: 'Missing client data' });

  try {
    const payload = buildQontoPayload(client);
    const qontoData = await qontoRequest('/clients', { method: 'POST', body: JSON.stringify(payload) });
    const qontoClientId = qontoData?.client?.id;

    const docRef = await db.collection('clients').add({
      ...client,
      qontoClientId: qontoClientId || null,
      qontoSyncStatus: qontoClientId ? 'synced' : 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
    });

    res.json({ success: true, id: docRef.id, qontoClientId });
  } catch (err) {
    console.error('Create client error:', err.message, err.data);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Update client → Qonto + Firestore
app.put('/api/clients/:id', async (req, res) => {
  const { client } = req.body;
  if (!client) return res.status(400).json({ error: 'Missing client data' });

  try {
    const doc = await db.collection('clients').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });

    const existing = doc.data();
    const qontoClientId = existing.qontoClientId;

    if (qontoClientId) {
      const merged = { ...existing, ...client };
      const isPro = merged.type === 'professionnel';
      const addr = buildAddress(merged);
      const patch = {};
      if (merged.email) patch.email = merged.email;
      if (merged.telephone) {
        const phone = merged.telephone.replace(/\s/g, '');
        patch.phone = { country_code: '+33', number: phone.replace(/^(\+33|0033|0)/, '') };
      }
      if (addr.address) patch.billing_address = {
        street_address: addr.address,
        city: addr.city || undefined,
        zip_code: addr.zipCode || undefined,
        country_code: 'FR',
      };
      if (isPro) {
        if (merged.entreprise) patch.name = merged.entreprise;
        if (merged.prenom) patch.first_name = merged.prenom;
        if (merged.nom) patch.last_name = merged.nom;
        if (merged.siret) patch.tax_identification_number = merged.siret;
        if (merged.tva) patch.vat_number = merged.tva;
      } else {
        if (merged.prenom) patch.first_name = merged.prenom;
        if (merged.nom) patch.last_name = merged.nom;
      }
      await qontoRequest(`/clients/${qontoClientId}`, { method: 'PATCH', body: JSON.stringify(patch) });
    }

    await db.collection('clients').doc(req.params.id).update({
      ...client,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, qontoClientId });
  } catch (err) {
    console.error('Update client error:', err.message, err.data);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Delete client → Qonto + Firestore
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const doc = await db.collection('clients').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });

    const { qontoClientId } = doc.data();
    if (qontoClientId) {
      try {
        await qontoRequest(`/clients/${qontoClientId}`, { method: 'DELETE' });
      } catch (e) {
        console.warn('Qonto delete error (non-fatal):', e.message);
      }
    }

    await db.collection('clients').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete client error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get single client
app.get('/api/clients/:id', async (req, res) => {
  try {
    const doc = await db.collection('clients').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Client not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List clients
app.get('/api/clients', async (req, res) => {
  try {
    const snapshot = await db.collection('clients').orderBy('createdAt', 'desc').get();
    const clients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================
// Invoices (Qonto proxy)
// ===========================

app.get('/api/invoices', async (req, res) => {
  try {
    const qs = new URLSearchParams();
    if (req.query['filter[status]']) qs.set('filter[status]', req.query['filter[status]']);
    if (req.query.page) qs.set('page', req.query.page);
    if (req.query.per_page) qs.set('per_page', req.query.per_page);
    const query = qs.toString() ? `?${qs}` : '';
    const data = await qontoRequest(`/client_invoices${query}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const { client_id, description, amount_cents, vat_rate, due_date } = req.body;
    console.log('Create invoice payload received:', JSON.stringify({ client_id, description, amount_cents, vat_rate, due_date, iban: qontoBankIban }));
    const today = new Date().toISOString().split('T')[0];
    const vatDecimal = String(parseFloat(vat_rate) / 100);
    const payload = {
      client_invoice: {
        client_id,
        issue_date: today,
        due_date,
        currency: 'EUR',
        payment_methods: { iban: qontoBankIban },
        items: [{
          title: description,
          quantity: '1',
          unit_price: { value: (amount_cents / 100).toFixed(2), currency: 'EUR' },
          vat_rate: vatDecimal
        }]
      }
    };
    console.log('Qonto payload:', JSON.stringify(payload));
    const data = await qontoRequest('/client_invoices', { method: 'POST', body: JSON.stringify(payload) });
    res.json(data);
  } catch (err) {
    console.error('Qonto error:', JSON.stringify(err.data));
    res.status(err.status || 500).json({ error: err.message, detail: err.data });
  }
});

app.post('/api/invoices/:id/finalize', async (req, res) => {
  try {
    const data = await qontoRequest(`/client_invoices/${req.params.id}/finalize`, { method: 'POST' });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/mark_as_paid', async (req, res) => {
  try {
    const data = await qontoRequest(`/client_invoices/${req.params.id}/mark_as_paid`, {
      method: 'POST',
      body: JSON.stringify(req.body || {}),
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/invoices/:id/mark_as_canceled', async (req, res) => {
  try {
    const data = await qontoRequest(`/client_invoices/${req.params.id}/mark_as_canceled`, { method: 'POST' });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ===========================
// Chatbot IA (public) — doit être AVANT le middleware /api auth
// ===========================

const CHATBOT_SYSTEM_PROMPT = `Tu es Kaï, l'assistant IA commercial de l'agence KARBONN., une agence de communication digitale et de développement web 100% Made in France.

---

## QUI EST KARBONN. ?
KARBONN. est une agence qui transforme les idées en expériences numériques mémorables. Elle est orientée résultats : chaque projet est conçu pour attirer, convaincre et créer une connexion durable avec l'audience du client. L'agence intervient pour des entreprises, associations, indépendants et particuliers.

Valeurs : Créativité, Rigueur, Transparence, Résultat.

Équipe :
- Axel Cormon — Graphiste Designer
- Jules Maximilien — Graphiste Designer
- Rémy Cormon — Développeur Full Stack

Expertises couvertes : Développement Web, Design & Expérience Utilisateur (UI/UX), Communication Digitale, Automatisation & IA, Outils Métiers sur mesure, Hébergement & Infrastructure, Accompagnement.

Instagram : @agence.karbonn

---

## LES 3 FORMULES (noms exacts à utiliser)

### 01 — FONDATION (à partir de 199 €)
Idéal pour : entreprises, associations et indépendants souhaitant lancer ou moderniser leur présence en ligne.
Inclus :
- Site vitrine sur mesure jusqu'à 5 pages
- Design UI/UX personnalisé (template personnalisé)
- Responsive mobile, tablette, ordinateur
- Configuration hébergement et nom de domaine
- Optimisation performances et SEO technique de base
- Formulaire de contact et outils essentiels
- Animations basiques
- Maintenance corrective 30 jours (support 1 mois)
Non inclus : e-commerce, automatisation IA, outils métiers, communication digitale.

### 02 — PERFORMANCE (à partir de 399 €) ⭐ Populaire
Idéal pour : entreprises cherchant à gagner du temps, automatiser leurs processus et générer davantage d'opportunités.
Inclus (tout Fondation +) :
- Développement web avancé, fonctionnalités sur mesure, jusqu'à 10 pages
- Design sur-mesure, animations avancées
- Parcours utilisateur optimisé (UX avancée, responsive multi-support)
- Automatisations IA basiques et automatisations métiers
- Connexion d'outils (CRM, formulaires, emailing, gestion interne)
- Tableau de bord et suivi des performances
- SEO avancé
- Hébergement professionnel et maintenance continue
- Accompagnement stratégique mensuel
- Formation incluse
- E-commerce en option
- Outils métiers en option
- Support 3 mois

### 03 — EXCELLENCE (à partir de 899 €)
Idéal pour : entreprises ambitieuses souhaitant un partenaire numérique gérant l'ensemble de leur écosystème digital.
Inclus (tout Performance +) :
- Pages illimitées
- Design premium sur-mesure, animations sur-mesure, expérience UX fluide totale
- Développement d'outils métiers sur mesure (inclus)
- Mise en place d'écosystèmes numériques complets
- Automatisations IA avancées et agents intelligents
- Infrastructure et hébergement haute performance
- Stratégie de communication digitale complète + accompagnement
- Création supports digitaux, optimisation de la marque
- Analyse comportementale et optimisation continue
- E-commerce inclus
- SEO Premium + stratégie complète
- Priorité sur les demandes et évolutions
- Support 6 mois

---

## HÉBERGEMENT (obligatoire pour tous les clients)
Abonnement mensuel : 19,99 € / mois (jusqu'à résiliation)
Inclus : nom de domaine (.com ou .fr), certificat SSL (HTTPS), maintenance technique, mises à jour de sécurité.

---

## TARIFICATION & SUPPLÉMENTS
- Les prix indiqués sont des prix de départ. Le devis final dépend du projet.
- Chaque page supplémentaire au-delà de la limite de la formule est facturée en supplément.
- Tout service non inclus dans une formule sera ajouté comme supplément.
- Des frais supplémentaires peuvent s'appliquer sur les automatisations IA.
- Des frais d'abonnements à des outils numériques peuvent s'appliquer.
- Les devis sont gratuits.

---

## TON RÔLE ET TES RÈGLES
- Réponds TOUJOURS en français, de façon chaleureuse, directe et professionnelle.
- Sois commercial et persuasif, jamais agressif ni insistant.
- Qualifie le projet du visiteur : demande-lui son secteur, ses objectifs, son budget approximatif, ses délais.
- Oriente toujours vers la formule la plus adaptée en expliquant pourquoi avec des arguments concrets.
- Si le visiteur hésite, mets en avant la valeur ajoutée, le ROI d'un site professionnel en fonction du secteur d'activité et la qualité de l'accompagnement KARBONN.
- Rassure sur la faisabilité : KARBONN. peut gérer des projets de toutes tailles.
- Ne dépasse pas 4-5 phrases par réponse. Reste concis, percutant, utile.
- Termine chaque réponse par un appel à l'action clair : proposer un devis gratuit via hello@karbonn.fr ou le formulaire de contact sur karbonn.fr.
- Ne donne jamais de prix fermes — dis toujours "à partir de" et recommande de demander un devis gratuit.
- Tu ne peux pas envoyer d'e-mail toi-même ni accéder au calendrier. Dirige vers le contact humain.

Contact : hello@karbonn.fr | Site : https://www.karbonn.fr | Instagram : @agence.karbonn`;

app.post('/api/chat', chatCors, async (req, res) => {
  console.log('[CHAT] POST /api/chat hit');
  console.log('[CHAT] Origin:', req.headers.origin);
  console.log('[CHAT] CORS headers sent:', {
    'access-control-allow-origin': res.getHeader('access-control-allow-origin'),
  });

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    console.warn('[CHAT] Bad request: missing or empty messages array');
    return res.status(400).json({ error: 'Missing messages array' });
  }

  if (!process.env.HF_TOKEN) {
    console.error('[CHAT] HF_TOKEN is not set in environment variables!');
    return res.status(503).json({ error: 'Chatbot not configured' });
  }
  console.log('[CHAT] HF_TOKEN present, length:', process.env.HF_TOKEN.length);

  const payload = {
    model: 'Qwen/Qwen2.5-72B-Instruct:fastest',
    messages: [
      { role: 'system', content: CHATBOT_SYSTEM_PROMPT },
      ...messages.map(m => ({ role: m.role, content: String(m.content) })),
    ],
    max_tokens: 400,
    temperature: 0.7,
  };

  console.log('[CHAT] Calling HF API, model:', payload.model, '— messages count:', payload.messages.length);

  try {
    const hfRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[CHAT] HF response status:', hfRes.status);

    const data = await hfRes.json();

    if (!hfRes.ok) {
      console.error('[CHAT] HF error response:', JSON.stringify(data));
      return res.status(hfRes.status).json({ error: data?.error || 'HF API error' });
    }

    const reply = data?.choices?.[0]?.message?.content || '';
    console.log('[CHAT] Reply length:', reply.length);
    res.json({ reply });
  } catch (err) {
    console.error('[CHAT] Fetch to HF failed:', err.message, err.stack);
    res.status(500).json({ error: 'Chatbot unavailable' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Karbonn API running on port ${PORT}`);
  loadQontoBankAccount();
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => fetch(`${SELF_URL}/health`).catch(() => {}), 30 * 1000);
});
