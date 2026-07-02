require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const QONTO_BASE_URL = 'https://thirdparty.qonto.com/v2';

let qontoBankIban = process.env.QONTO_IBAN || null;
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
app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['*'];
    if (!origin || allowed.includes('*') || allowed.includes(origin)) callback(null, true);
    else callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));

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

app.options('/api/*', cors());
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  verifyAuth(req, res, next);
}, requireManager);

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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Karbonn API running on port ${PORT}`);
  loadQontoBankAccount();
});
