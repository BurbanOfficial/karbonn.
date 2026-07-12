require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

const app = express();
const PORT = process.env.PORT || 3000;
const QONTO_BASE_URL = 'https://thirdparty.qonto.com/v2';
const QONTO_AUTH = (process.env.QONTO_API_TOKEN || '').replace(/^Bearer\s+/i, '').replace(/['"]/g, '').replace(/\s/g, '').trim();

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

// Mailgun client (EU endpoint)
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
  url: process.env.MAILGUN_URL || 'https://api.eu.mailgun.net'
});

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.MAILGUN_FROM || 'Karbonn Intranet <postmaster@mg.karbonn.fr>';
  const domain = process.env.MAILGUN_DOMAIN || 'mg.karbonn.fr';
  const data = { from, to, subject };
  if (text) data.text = text;
  if (html) data.html = html;
  console.log(`[EMAIL] Sending email to ${to.join(', ')} from ${from} | subject: ${subject}`);
  const result = await mg.messages.create(domain, data);
  console.log(`[EMAIL] Sent successfully. Mailgun id: ${result.id}`);
  return result;
}

app.use(express.json());

const allowedOriginsCors = cors({
  origin: (origin, callback) => {
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['*'];
    if (!origin || origin === 'null' || allowed.includes('*') || allowed.includes(origin)) callback(null, origin || '*');
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
app.options('/notify/email', cors({ origin: '*', credentials: false }));

// Public endpoint for client space: list sites linked to a client by its clientId
app.get('/api/public/client/:clientId/sites', async (req, res) => {
  console.log('[Public API] Incoming request:', req.method, req.path, '| params:', req.params, '| origin:', req.headers.origin);
  try {
    const { clientId } = req.params;
    console.log('[Public API] Looking up client with clientId:', clientId);
    const clientSnap = await db.collection('clients').where('clientId', '==', clientId).limit(1).get();
    if (clientSnap.empty) {
      console.log('[Public API] Client not found for clientId:', clientId);
      return res.status(404).json({ error: 'Client not found' });
    }
    console.log('[Public API] Client found, doc id:', clientSnap.docs[0].id);

    const clientDoc = clientSnap.docs[0];
    const sitesSnap = await db.collection('sitesWeb').where('clientId', '==', clientDoc.id).get();
    const sites = [];
    for (const doc of sitesSnap.docs) {
      const data = doc.data();
      const historySnap = await db.collection('sitesWeb').doc(doc.id).collection('history').orderBy('createdAt', 'desc').get();
      const history = [];
      historySnap.forEach(h => {
        const item = h.data();
        history.push({
          id: h.id,
          type: item.type,
          content: item.content,
          createdByName: item.createdByName,
          status: item.status || 'pending',
          createdAt: item.createdAt ? item.createdAt.toDate().toISOString() : null,
          updatedAt: item.updatedAt ? item.updatedAt.toDate().toISOString() : null
        });
      });
      sites.push({
        id: doc.id,
        domain: data.domain,
        status: data.status,
        expirationDate: data.expirationDate,
        host: data.host,
        server: data.server,
        creationDate: data.creationDate,
        clientName: data.clientName,
        createdAt: data.createdAt,
        renewals: data.renewals || [],
        lastRenewalAt: data.lastRenewalAt ? (data.lastRenewalAt.toDate ? data.lastRenewalAt.toDate().toISOString() : data.lastRenewalAt) : null,
        history
      });
    }
    console.log('[Public API] Returning', sites.length, 'sites for clientId:', clientId);
    res.json({ sites });
  } catch (err) {
    console.error('[Public API] Error fetching client sites:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for client space: add a note to a site's history
app.post('/api/public/sites/:siteId/notes', async (req, res) => {
  console.log('[Public API] Add note request:', req.method, req.path, '| siteId:', req.params.siteId);
  try {
    const { siteId } = req.params;
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Missing note content' });
    }

    const noteRef = db.collection('sitesWeb').doc(siteId).collection('history').doc();
    const note = {
      type: 'note',
      content: content.trim(),
      createdByName: 'Espace Client',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await noteRef.set(note);

    // Notify managers about the new client note
    try {
      const siteDoc = await db.collection('sitesWeb').doc(siteId).get();
      const siteData = siteDoc.exists ? siteDoc.data() : {};
      const domain = siteData.domain || '—';
      const clientId = siteData.clientId || siteData.clientIdDisplay || '—';
      let clientName = 'Client';
      let clientEmail = '';
      if (siteData.clientId) {
        const clientDoc = await db.collection('clients').doc(siteData.clientId).get();
        if (clientDoc.exists) {
          const c = clientDoc.data();
          clientName = c.prenom && c.nom ? `${c.prenom} ${c.nom}` : c.entreprise || c.raisonSociale || c.nom || c.prenom || 'Client';
          clientEmail = c.email || '';
        }
      }

      const managersSnap = await db.collection('users').where('role', '==', 'Manager').get();
      const managerEmails = [];
      managersSnap.forEach(doc => {
        const u = doc.data();
        if (u.email) managerEmails.push(u.email);
      });

      if (managerEmails.length > 0) {
        const html = buildRenewalEmailHtml({
          title: 'Nouvelle remarque client',
          intro: `Une nouvelle remarque a été ajoutée depuis l'espace client.`,
          lines: [
            `Site web : ${domain}`,
            `Client : ${clientName}`,
            `Identifiant client : ${clientId}`,
            clientEmail ? `Email client : ${clientEmail}` : '',
            `Remarque : « ${content.trim()} »`
          ].filter(Boolean),
          buttonText: 'Accéder à l’intranet',
          buttonHref: 'https://karbonn.fr/intranet'
        });
        const text = `Nouvelle remarque client\n\nSite web : ${domain}\nClient : ${clientName}\nIdentifiant client : ${clientId}${clientEmail ? '\nEmail client : ' + clientEmail : ''}\n\nRemarque : « ${content.trim()} »\n\nhttps://karbonn.fr/intranet`;
        await sendEmail({ to: managerEmails, subject: '[Karbonn] Nouvelle remarque client', text, html });
        console.log('[Public API] Manager notification sent for note on', domain);
      }
    } catch (emailErr) {
      console.error('[Public API] Failed to notify managers about note:', emailErr);
    }

    res.json({
      success: true,
      note: {
        id: noteRef.id,
        type: note.type,
        content: note.content,
        createdByName: note.createdByName,
        status: note.status,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[Public API] Error adding site note:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for client space: list invoices and quotes for the authenticated client
app.get('/api/public/client/:clientId/documents', async (req, res) => {
  console.log('[Public API] Documents request for clientId:', req.params.clientId);
  try {
    const { clientId } = req.params;
    const clientSnap = await db.collection('clients').where('clientId', '==', clientId).limit(1).get();
    if (clientSnap.empty) return res.status(404).json({ error: 'Client not found' });
    const qontoClientId = clientSnap.docs[0].data().qontoClientId;
    if (!qontoClientId) return res.status(404).json({ error: 'Qonto client not linked' });

    const [invoicesData, quotesData] = await Promise.all([
      qontoRequest('/client_invoices?per_page=100&sort_by=created_at:desc').catch(err => { console.error('[Qonto] invoices error:', err.message); return { client_invoices: [] }; }),
      qontoRequest('/quotes?per_page=100&sort_by=created_at:desc').catch(err => { console.error('[Qonto] quotes error:', err.message); return { quotes: [] }; })
    ]);

    const invoices = (invoicesData.client_invoices || [])
      .filter(inv => inv.client?.id === qontoClientId)
      .map(inv => ({
        id: inv.id,
        type: 'invoice',
        number: inv.number,
        status: inv.status,
        total_amount: inv.total_amount?.value,
        currency: inv.total_amount?.currency || 'EUR',
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        paid_at: inv.paid_at,
        created_at: inv.created_at,
        attachment_id: inv.attachment_id,
        invoice_url: inv.invoice_url
      }));

    const quotes = (quotesData.quotes || [])
      .filter(q => q.client?.id === qontoClientId)
      .map(q => ({
        id: q.id,
        type: 'quote',
        number: q.number,
        status: q.status,
        total_amount: q.total_amount?.value,
        currency: q.total_amount?.currency || 'EUR',
        issue_date: q.issue_date,
        expiry_date: q.expiry_date,
        created_at: q.created_at,
        attachment_id: q.attachment_id,
        quote_url: q.quote_url
      }));

    const documents = [...invoices, ...quotes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    console.log('[Public API] Returning', documents.length, 'documents for clientId:', clientId);
    res.json({ documents, iban: qontoBankIban || '' });
  } catch (err) {
    console.error('[Public API] Error fetching documents:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for client space: download a document attachment through Qonto
app.get('/api/public/client/:clientId/documents/:attachmentId/download', async (req, res) => {
  try {
    const { clientId, attachmentId } = req.params;
    const clientSnap = await db.collection('clients').where('clientId', '==', clientId).limit(1).get();
    if (clientSnap.empty) return res.status(404).json({ error: 'Client not found' });
    if (!clientSnap.docs[0].data().qontoClientId) return res.status(404).json({ error: 'Qonto client not linked' });

    const response = await fetch(`${QONTO_BASE_URL}/attachments/${attachmentId}`, {
      headers: { 'Authorization': QONTO_AUTH, 'Accept': 'application/pdf' }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({ error: 'Document unavailable', detail: text });
    }
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const contentDisposition = response.headers.get('content-disposition') || `attachment; filename="document-${attachmentId}.pdf"`;
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', contentDisposition);
    response.body.pipe(res);
  } catch (err) {
    console.error('[Public API] Error downloading document:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for client space: edit own pending note
app.patch('/api/public/sites/:siteId/notes/:noteId', async (req, res) => {
  console.log('[Public API] Edit note request:', req.method, req.path);
  try {
    const { siteId, noteId } = req.params;
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Missing note content' });
    }

    const noteRef = db.collection('sitesWeb').doc(siteId).collection('history').doc(noteId);
    const noteDoc = await noteRef.get();
    if (!noteDoc.exists) return res.status(404).json({ error: 'Note not found' });
    const noteData = noteDoc.data();
    if (noteData.createdByName !== 'Espace Client') {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (noteData.status && noteData.status !== 'pending') {
      return res.status(403).json({ error: 'Note is not editable' });
    }

    await noteRef.update({ content: content.trim(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true, note: { id: noteId, content: content.trim() } });
  } catch (err) {
    console.error('[Public API] Error editing site note:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint for client space: delete own pending note
app.delete('/api/public/sites/:siteId/notes/:noteId', async (req, res) => {
  console.log('[Public API] Delete note request:', req.method, req.path);
  try {
    const { siteId, noteId } = req.params;
    const noteRef = db.collection('sitesWeb').doc(siteId).collection('history').doc(noteId);
    const noteDoc = await noteRef.get();
    if (!noteDoc.exists) return res.status(404).json({ error: 'Note not found' });
    const noteData = noteDoc.data();
    if (noteData.createdByName !== 'Espace Client') {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (noteData.status && noteData.status !== 'pending') {
      return res.status(403).json({ error: 'Note is not deletable' });
    }

    await noteRef.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('[Public API] Error deleting site note:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe renewal: create a PaymentIntent for domain renewal
const RENEWAL_PRICES = { 1: 1500, 2: 2800, 5: 6000 }; // in euro cents

app.post('/api/public/sites/:siteId/create-payment-intent', async (req, res) => {
  console.log('[Stripe] create-payment-intent for site:', req.params.siteId);
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  try {
    const { siteId } = req.params;
    const { years, amount: requestedAmount } = req.body || {};
    const yearsInt = parseInt(years, 10);
    if (![1, 2, 5].includes(yearsInt)) {
      return res.status(400).json({ error: 'Invalid duration. Choose 1, 2 or 5 years.' });
    }
    const siteDoc = await db.collection('sitesWeb').doc(siteId).get();
    if (!siteDoc.exists) return res.status(404).json({ error: 'Site not found' });

    const amount = (requestedAmount && Number.isInteger(requestedAmount) && requestedAmount >= 100)
      ? requestedAmount
      : RENEWAL_PRICES[yearsInt];
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      metadata: { siteId, years: String(yearsInt) },
      payment_method_options: {
        card: {
          request_three_d_secure: 'any'
        }
      }
    });
    console.log('[Stripe] PaymentIntent created:', paymentIntent.id, '| amount:', amount);
    res.json({ clientSecret: paymentIntent.client_secret, amount, paymentIntentId: paymentIntent.id });
  } catch (err) {
    console.error('[Stripe] Error creating payment intent:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe renewal: confirm after successful payment and record in Firestore
app.post('/api/public/sites/:siteId/confirm-renewal', async (req, res) => {
  console.log('[Stripe] confirm-renewal for site:', req.params.siteId);
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  try {
    const { siteId } = req.params;
    const { paymentIntentId, years, clientName, clientId } = req.body || {};
    if (!paymentIntentId || !years || !clientId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment not completed', status: paymentIntent.status });
    }

    const yearsInt = parseInt(years, 10);
    const amount = paymentIntent.amount;
    const paidAt = new Date().toISOString();
    const renewal = {
      paymentIntentId,
      years: yearsInt,
      amount,
      clientName: clientName || '',
      clientId: clientId || '',
      paidAt
    };

    const siteDoc = await db.collection('sitesWeb').doc(siteId).get();
    const siteData = siteDoc.data() || {};

    const currentExp = siteData.expirationDate ? new Date(siteData.expirationDate) : new Date();
    const baseDate = currentExp > new Date() ? currentExp : new Date();
    baseDate.setFullYear(baseDate.getFullYear() + yearsInt);
    const newExpirationDate = baseDate.toISOString().split('T')[0];

    await db.collection('sitesWeb').doc(siteId).update({
      renewals: admin.firestore.FieldValue.arrayUnion(renewal),
      lastRenewalAt: admin.firestore.FieldValue.serverTimestamp(),
      expirationDate: newExpirationDate,
      status: 'Actif',
      reminderEmailsSent: []
    });
    console.log('[Stripe] Renewal recorded for site:', siteId, '| new expiration:', newExpirationDate);
    res.json({ success: true, renewal: { ...renewal, newExpirationDate } });
  } catch (err) {
    console.error('[Stripe] Error confirming renewal:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Renewal reminder emails ----
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildRenewalEmailHtml({ title, intro, lines, buttonText, buttonHref }) {
  const linesHtml = (lines || []).map(line => `<div>${escapeHtml(line)}<br></div>`).join('');
  const introHtml = intro ? `<div>${escapeHtml(intro)}<br></div>` : '';
  const introSpacer = intro ? '<div><br></div>' : '';
  const buttonHtml = buttonText && buttonHref
    ? `<div style="text-align: center; margin-top: 30px">
        <a target="_blank" style="background: rgb(11, 11, 11); color: rgb(255, 255, 255); padding: 12px 22px; border-radius: 2px; text-decoration: none; font-size: 14px; display: inline-block" href="${escapeHtml(buttonHref)}">
          ${escapeHtml(buttonText)}
        </a>
        <br>
      </div>`
    : '';

  return `<div>
    <table style="padding: 40px 0" width="100%">
      <tbody>
        <tr>
          <td align="center">
            <table style="background: rgb(255, 255, 255); border-radius: 14px; overflow: hidden" width="600">
              <tbody>
                <tr>
                  <td style="background: rgb(255, 255, 255); padding: 0px; text-align: center">
                    <img style="display: block; margin: 0 auto 10px auto; max-width: 140px; max-height: 70px; width: auto; height: auto" alt="Karbonn" src="https://i.imgur.com/61Dv12I.png">
                    <div style="color: rgb(170, 170, 170); font-size: 12px; letter-spacing: 1.5px">
                      <div>KARBONN.<br></div>
                      <div><br></div>
                      <div>Communication Digitale &amp; Développement Web<br></div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px">
                    <h2 style="text-align: center; margin: 0 0 10px 0; color: rgb(17, 17, 17)">
                      <div>${escapeHtml(title)}<br></div>
                    </h2>
                    <div style="text-align: center; color: rgb(68, 68, 68); font-size: 14px; line-height: 1.6">
                      ${introHtml}
                      ${introSpacer}
                      ${linesHtml}
                    </div>
                    ${buttonHtml}
                  </td>
                </tr>
                <tr>
                  <td style="background: rgb(255, 255, 255); text-align: center; padding: 15px; font-size: 11px; color: rgb(119, 119, 119)">
                    © Karbonn. Tous droits réservés.<br>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
    <div><br></div>
  </div>`;
}

async function getClientEmailById(clientId) {
  if (!clientId) return null;
  try {
    const doc = await db.collection('clients').doc(clientId).get();
    if (!doc.exists) return null;
    return doc.data().email || null;
  } catch (err) {
    console.error('[Reminders] Failed to get client email:', err);
    return null;
  }
}

async function getManagerEmails() {
  try {
    const snap = await db.collection('users').where('role', '==', 'Manager').get();
    const emails = [];
    snap.forEach(d => { if (d.data().email) emails.push(d.data().email); });
    // Also support nested role objects
    if (emails.length === 0) {
      const allSnap = await db.collection('users').get();
      allSnap.forEach(d => {
        const role = d.data().role;
        const label = typeof role === 'object' ? role?.label : role;
        if (label === 'Manager' && d.data().email) emails.push(d.data().email);
      });
    }
    return emails;
  } catch (err) {
    console.error('[Reminders] Failed to get manager emails:', err);
    return [];
  }
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const exp = new Date(dateString);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exp.setHours(23, 59, 59, 999);
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
}

function reminderAlreadySent(site, type) {
  const list = site.reminderEmailsSent || [];
  return list.some(r => r.type === type);
}

async function markReminderSent(siteId, type) {
  await db.collection('sitesWeb').doc(siteId).update({
    reminderEmailsSent: admin.firestore.FieldValue.arrayUnion({ type, sentAt: new Date().toISOString() })
  });
}

function isRecentlyRenewed(site, thresholdDays = 90) {
  if (!site.lastRenewalAt || !site.expirationDate) return false;
  const days = daysUntil(site.expirationDate);
  return days !== null && days > thresholdDays;
}

async function sendReminderEmail(site, type, daysLeft) {
  const domain = site.domain || '—';
  const expirationDate = site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—';
  const clientName = site.clientName || 'Client';
  const isManagerEmail = type.startsWith('manager_') || type === 'expired';
  const isExpired = type === 'expired';

  let recipients = [];
  if (isManagerEmail) {
    recipients = await getManagerEmails();
  } else {
    const clientEmail = await getClientEmailById(site.clientId);
    if (clientEmail) recipients = [clientEmail];
  }

  if (recipients.length === 0) {
    console.log('[Reminders] No recipients for', type, '| site:', site.id);
    return;
  }

  let subject, title, intro, lines, buttonText, buttonHref;
  const clientHref = `https://karbonn.fr/espace-client`;
  const intranetHref = `https://karbonn.fr/intranet`;

  if (isExpired) {
    subject = `[Karbonn] Domaine expiré – ${domain}`;
    title = 'Domaine expiré';
    intro = `${clientName}, votre nom de domaine ${domain} a expiré.`;
    lines = [`Domaine : ${domain}`, `Date d'expiration : ${expirationDate}`, 'Renouvelez-le rapidement pour éviter la perte du domaine.'];
    buttonText = 'Voir le site';
    buttonHref = isManagerEmail ? intranetHref : clientHref;
  } else if (isManagerEmail) {
    subject = `[Karbonn] Relance renouvellement – ${domain}`;
    title = 'Relance renouvellement';
    intro = `Le domaine ${domain} de ${clientName} expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`;
    lines = [`Domaine : ${domain}`, `Client : ${clientName}`, `Date d'expiration : ${expirationDate}`];
    buttonText = 'Voir le site';
    buttonHref = intranetHref;
  } else {
    subject = `[Karbonn] Votre domaine expire bientôt – ${domain}`;
    title = 'Votre domaine expire bientôt';
    intro = `${clientName}, renouvelez votre nom de domaine ${domain} avant qu'il ne soit trop tard.`;
    lines = [`Domaine : ${domain}`, `Date d'expiration : ${expirationDate}`, `Il reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`];
    buttonText = 'Renouveler mon domaine';
    buttonHref = clientHref;
  }

  const html = buildRenewalEmailHtml({ title, intro, lines, buttonText, buttonHref });
  const text = `${title}\n\n${intro}\n\n${lines.join('\n')}\n\n${buttonHref}`;

  try {
    await sendEmail({ to: recipients, subject, text, html });
    console.log('[Reminders] Email sent:', type, '| recipients:', recipients.length, '| site:', site.id);
    await markReminderSent(site.id, type);
  } catch (err) {
    console.error('[Reminders] Failed to send email:', type, err);
  }
}

async function processRenewalReminders() {
  console.log('[Reminders] Running daily renewal reminder check');
  try {
    const snap = await db.collection('sitesWeb').get();
    const managerEmails = await getManagerEmails();

    for (const doc of snap.docs) {
      const site = { id: doc.id, ...doc.data() };
      const daysLeft = daysUntil(site.expirationDate);
      if (daysLeft === null) continue;

      const status = site.status || 'En attente';
      const expired = status === 'Expiré' || daysLeft < 0;

      if (expired) {
        if (!reminderAlreadySent(site, 'expired')) {
          await sendReminderEmail(site, 'expired', 0);
          if (managerEmails.length) await sendReminderEmail(site, 'expired_manager', 0);
        }
        continue;
      }

      // If recently renewed far enough, skip all reminders
      if (isRecentlyRenewed(site, 90)) continue;

      const thresholds = [
        { days: 90, clientType: 'client_90' },
        { days: 30, clientType: 'client_30' },
        { days: 10, clientType: 'client_10' },
        { days: 7,  clientType: 'client_7', managerType: 'manager_7' },
        { days: 1,  clientType: 'client_1', managerType: 'manager_1' }
      ];

      for (const t of thresholds) {
        if (daysLeft <= t.days && daysLeft > t.days - 1) {
          // Client email
          if (!reminderAlreadySent(site, t.clientType)) {
            await sendReminderEmail(site, t.clientType, daysLeft);
          }
          // Manager escalation (J-7, J-1)
          if (t.managerType && !reminderAlreadySent(site, t.managerType)) {
            await sendReminderEmail(site, t.managerType, daysLeft);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Reminders] Error in processRenewalReminders:', err);
  }
}

// Notification endpoint: authenticated, any role
app.post('/notify/email', cors({ origin: true, credentials: true }), verifyAuth, async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    console.log(`[EMAIL REQUEST] from ${req.user?.email || req.user?.uid} | to: ${(to || []).join(', ')} | subject: ${subject}`);
    if (!to || !Array.isArray(to) || to.length === 0) return res.status(400).json({ error: 'Missing recipients' });
    if (!subject) return res.status(400).json({ error: 'Missing subject' });
    if (!text && !html) return res.status(400).json({ error: 'Missing body' });
    if (!process.env.MAILGUN_API_KEY) {
      console.error('[EMAIL REQUEST] Missing MAILGUN_API_KEY environment variable');
      return res.status(500).json({ error: 'Mailgun not configured' });
    }
    const result = await sendEmail({ to, subject, text, html });
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error('[EMAIL REQUEST] Mailgun error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res, next) => {
  if (req.path === '/chat') return next();
  if (req.method === 'OPTIONS') return next();
  verifyAuth(req, res, next);
}, (req, res, next) => {
  if (req.path === '/chat') return next();
  requireManager(req, res, next);
});

// Delete a Firebase Auth user (manager only, handled by /api middleware)
app.delete('/api/users/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'Missing uid' });
    await admin.auth().deleteUser(uid);
    console.log(`[AUTH] Deleted Firebase Auth user: ${uid}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] Error deleting user:', err);
    res.status(500).json({ error: err.message });
  }
});

async function qontoRequest(path, options = {}) {
  const response = await fetch(`${QONTO_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': QONTO_AUTH,
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
    const qontoClientId = qontoData?.client?.id || null;

    const docRef = await db.collection('clients').add({
      ...client,
      qontoClientId,
      qontoSyncStatus: qontoClientId ? 'synced' : 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid,
    });

    // Send welcome email with client ID
    if (client.email) {
      try {
        const clientName = client.prenom && client.nom ? `${client.prenom} ${client.nom}` : client.entreprise || client.raisonSociale || client.nom || client.prenom || client.email.split('@')[0] || 'Client';
        const clientId = client.clientId || '—';
        const subject = '[Karbonn] Votre espace client est créé';
        const html = buildRenewalEmailHtml({
          title: 'Bienvenue chez Karbonn',
          intro: `${clientName}, votre espace client Karbonn vient d'être créé. Retrouvez ci-dessous votre identifiant personnel.`,
          lines: [`Identifiant client : ${clientId}`, 'Conservez-le précieusement.', 'En cas de perte, contactez Karbonn.'],
          buttonText: 'Accéder à mon espace client',
          buttonHref: 'https://karbonn.fr/espace-client'
        });
        const text = `${clientName}, votre espace client Karbonn vient d'être créé.\n\nIdentifiant client : ${clientId}\nConservez-le précieusement.\nEn cas de perte, contactez Karbonn.\n\nhttps://karbonn.fr/espace-client`;
        await sendEmail({ to: [client.email], subject, text, html });
        console.log('[Clients] Welcome email sent to:', client.email);
      } catch (emailErr) {
        console.error('[Clients] Failed to send welcome email:', emailErr);
      }
    }

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
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  console.log(`[Stripe] Mode: ${stripeKey.startsWith('sk_live') ? 'LIVE' : stripeKey.startsWith('sk_test') ? 'TEST' : 'NOT CONFIGURED'}`);
  const [qLogin] = QONTO_AUTH.split(':');
  console.log(`[Qonto] Auth token login part: "${qLogin || 'MISSING'}" | key length: ${(QONTO_AUTH.split(':')[1] || '').length}`);
  loadQontoBankAccount();
  const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  setInterval(() => fetch(`${SELF_URL}/health`).catch(() => {}), 30 * 1000);

  // Daily renewal reminder check
  setTimeout(() => { processRenewalReminders(); }, 60 * 1000);
  setInterval(() => { processRenewalReminders(); }, 24 * 60 * 60 * 1000);
});
