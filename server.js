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

// Parse JSON for all routes except Stripe webhook (needs raw body for signature verification)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') return next();
  express.json()(req, res, next);
});

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
      // Fetch services for this site
      const servicesSnap = await db.collection('sitesWeb').doc(doc.id).collection('services').orderBy('createdAt', 'desc').get();
      const services = [];
      servicesSnap.forEach(s => {
        const svc = s.data();
        services.push({
          id: s.id,
          description: svc.description || '',
          priceMonthly: svc.priceMonthly || 0,
          startDate: svc.startDate || null,
          endDate: svc.endDate || null,
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
        history,
        services
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

// ---- Stripe Billing ----
const DOMAIN_PRICES_ANNUAL_CENTS = {
  '.com': 1619,  // 13.49€ HT × 1.20 TVA = 16.19€ TTC
  '.fr':  935,   // 7.79€ HT × 1.20 TVA = 9.35€ TTC
};
const DEFAULT_DOMAIN_ANNUAL_CENTS = 1200; // 10€ HT × 1.20 = 12€ TTC

function getDomainAnnualPriceCents(domain) {
  if (!domain) return DEFAULT_DOMAIN_ANNUAL_CENTS;
  const parts = domain.split('.');
  const ext = parts.length >= 2 ? '.' + parts[parts.length - 1].toLowerCase() : '';
  return DOMAIN_PRICES_ANNUAL_CENTS[ext] || DEFAULT_DOMAIN_ANNUAL_CENTS;
}

// Ensure a Stripe Customer exists for a client
async function ensureStripeCustomer(clientDocId) {
  const clientDoc = await db.collection('clients').doc(clientDocId).get();
  if (!clientDoc.exists) throw new Error('Client not found');
  const client = clientDoc.data();

  if (client.stripeCustomerId) {
    return client.stripeCustomerId;
  }

  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || client.entreprise || client.raisonSociale || 'Client';
  const customerData = { name, metadata: { firestoreClientId: clientDocId } };
  if (client.email) customerData.email = client.email;

  const customer = await stripe.customers.create(customerData);
  await db.collection('clients').doc(clientDocId).update({ stripeCustomerId: customer.id });
  console.log('[Stripe Billing] Created customer:', customer.id, 'for client:', clientDocId);
  return customer.id;
}

// Get or create a Stripe Price for a recurring item
async function getOrCreateStripePrice(name, unitAmountCents, interval) {
  // Search for existing product by name
  const products = await stripe.products.search({ query: `name:"${name}"`, limit: 1 });
  let product;
  if (products.data.length > 0) {
    product = products.data[0];
    // Check if a matching price exists
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
    const match = prices.data.find(p =>
      p.unit_amount === unitAmountCents && p.recurring?.interval === interval && p.currency === 'eur'
    );
    if (match) return match.id;
  } else {
    product = await stripe.products.create({ name });
  }
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmountCents,
    currency: 'eur',
    recurring: { interval },
  });
  console.log('[Stripe Billing] Created price:', price.id, '| amount:', unitAmountCents, '| interval:', interval);
  return price.id;
}

// Public: auto-create Stripe customer on client login
app.post('/api/public/client/:clientDocId/ensure-stripe-customer', async (req, res) => {
  try {
    const customerId = await ensureStripeCustomer(req.params.clientDocId);
    res.json({ stripeCustomerId: customerId });
  } catch (err) {
    console.error('[Stripe Billing] ensure-stripe-customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: create a Stripe SetupIntent so the client can add a payment method
app.post('/api/public/client/:clientDocId/create-setup-intent', async (req, res) => {
  try {
    const customerId = await ensureStripeCustomer(req.params.clientDocId);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('[Stripe Billing] create-setup-intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: set a payment method as default for invoices
app.post('/api/public/client/:clientDocId/set-default-payment-method', async (req, res) => {
  try {
    const clientDoc = await db.collection('clients').doc(req.params.clientDocId).get();
    if (!clientDoc.exists) return res.status(404).json({ error: 'Client not found' });
    const stripeCustomerId = clientDoc.data().stripeCustomerId;
    if (!stripeCustomerId) return res.status(400).json({ error: 'No Stripe customer' });

    // Get the latest payment method
    const methods = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card', limit: 1 });
    if (methods.data.length === 0) return res.status(400).json({ error: 'No payment method found' });

    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: methods.data[0].id },
    });
    console.log('[Stripe Billing] Set default PM:', methods.data[0].id, 'for customer:', stripeCustomerId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Stripe Billing] set-default-payment-method error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: check if client has a payment method attached
app.get('/api/public/client/:clientDocId/payment-methods', async (req, res) => {
  try {
    const clientDoc = await db.collection('clients').doc(req.params.clientDocId).get();
    if (!clientDoc.exists) return res.status(404).json({ error: 'Client not found' });
    const stripeCustomerId = clientDoc.data().stripeCustomerId;
    if (!stripeCustomerId) return res.json({ paymentMethods: [] });
    const methods = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: 'card' });
    const result = methods.data.map(pm => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      exp_month: pm.card?.exp_month,
      exp_year: pm.card?.exp_year,
    }));
    res.json({ paymentMethods: result });
  } catch (err) {
    console.error('[Stripe Billing] payment-methods error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: list invoices for a Stripe customer
app.get('/api/public/client/:clientDocId/invoices', async (req, res) => {
  try {
    const clientDoc = await db.collection('clients').doc(req.params.clientDocId).get();
    if (!clientDoc.exists) return res.status(404).json({ error: 'Client not found' });
    const stripeCustomerId = clientDoc.data().stripeCustomerId;
    if (!stripeCustomerId) return res.json({ invoices: [] });
    const invoices = await stripe.invoices.list({ customer: stripeCustomerId, limit: 50 });
    const result = invoices.data.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount_due: inv.amount_due,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      created: inv.created,
      due_date: inv.due_date,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf,
      description: inv.description || (inv.lines?.data?.[0]?.description || ''),
    }));
    res.json({ invoices: result });
  } catch (err) {
    console.error('[Stripe Billing] list invoices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: list active subscriptions for a client
app.get('/api/public/client/:clientDocId/subscriptions', async (req, res) => {
  try {
    const clientDoc = await db.collection('clients').doc(req.params.clientDocId).get();
    if (!clientDoc.exists) return res.status(404).json({ error: 'Client not found' });
    const stripeCustomerId = clientDoc.data().stripeCustomerId;
    if (!stripeCustomerId) return res.json({ subscriptions: [] });
    const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, limit: 20 });
    const result = subs.data.map(sub => ({
      id: sub.id,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      items: sub.items.data.map(item => ({
        id: item.id,
        description: item.price?.product?.name || item.price?.nickname || '',
        amount: item.price?.unit_amount,
        interval: item.price?.recurring?.interval,
      })),
    }));
    res.json({ subscriptions: result });
  } catch (err) {
    console.error('[Stripe Billing] list subscriptions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe Webhook for invoice events
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[Stripe Webhook] Event received:', event.type);

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    await handleInvoicePaymentSucceeded(invoice);
  } else if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    await handleInvoicePaymentFailed(invoice);
  }

  res.json({ received: true });
});

async function handleInvoicePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  console.log('[Stripe Webhook] Payment succeeded for customer:', customerId, '| amount:', invoice.amount_paid);

  try {
    // Find client by stripeCustomerId
    const clientSnap = await db.collection('clients').where('stripeCustomerId', '==', customerId).limit(1).get();
    if (clientSnap.empty) {
      console.warn('[Stripe Webhook] No client found for Stripe customer:', customerId);
      return;
    }
    const clientDoc = clientSnap.docs[0];
    const client = clientDoc.data();
    const clientEmail = client.email;
    const clientName = [client.prenom, client.nom].filter(Boolean).join(' ') || client.entreprise || 'Client';

    if (!clientEmail) {
      console.warn('[Stripe Webhook] No email for client:', clientDoc.id);
      return;
    }

    const amountStr = (invoice.amount_paid / 100).toFixed(2) + ' €';
    const lines = invoice.lines?.data?.map(l => l.description || '—') || [];
    const html = buildRenewalEmailHtml({
      title: 'Paiement effectué',
      intro: `${clientName}, votre prélèvement de ${amountStr} a bien été effectué.`,
      lines: ['Détail :', ...lines, '', `Montant total : ${amountStr}`],
      buttonText: 'Voir mes factures',
      buttonHref: 'https://karbonn.fr/espace-client',
    });
    const text = `Paiement effectué\n\n${clientName}, votre prélèvement de ${amountStr} a bien été effectué.\n\nDétail :\n${lines.join('\n')}\n\nMontant total : ${amountStr}`;

    await sendEmail({ to: [clientEmail], subject: `[Karbonn] Paiement effectué – ${amountStr}`, text, html });
    console.log('[Stripe Webhook] Payment success email sent to:', clientEmail);
  } catch (err) {
    console.error('[Stripe Webhook] Error handling payment succeeded:', err);
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const customerId = invoice.customer;
  console.log('[Stripe Webhook] Payment FAILED for customer:', customerId, '| amount:', invoice.amount_due);

  try {
    const clientSnap = await db.collection('clients').where('stripeCustomerId', '==', customerId).limit(1).get();
    if (clientSnap.empty) {
      console.warn('[Stripe Webhook] No client found for Stripe customer:', customerId);
      return;
    }
    const clientDoc = clientSnap.docs[0];
    const client = clientDoc.data();
    const clientEmail = client.email;
    const clientName = [client.prenom, client.nom].filter(Boolean).join(' ') || client.entreprise || 'Client';
    const amountStr = (invoice.amount_due / 100).toFixed(2) + ' €';
    const lines = invoice.lines?.data?.map(l => l.description || '—') || [];

    // Email to client
    if (clientEmail) {
      const html = buildRenewalEmailHtml({
        title: 'Échec de prélèvement',
        intro: `${clientName}, nous n'avons pas pu effectuer le prélèvement de ${amountStr}.`,
        lines: ['Détail :', ...lines, '', 'Veuillez mettre à jour votre moyen de paiement ou contacter notre équipe.'],
        buttonText: 'Contacter Karbonn',
        buttonHref: 'mailto:hello@karbonn.fr',
      });
      const text = `Échec de prélèvement\n\n${clientName}, nous n'avons pas pu effectuer le prélèvement de ${amountStr}.\n\nDétail :\n${lines.join('\n')}\n\nVeuillez mettre à jour votre moyen de paiement ou contacter notre équipe.`;
      await sendEmail({ to: [clientEmail], subject: `[Karbonn] Échec de prélèvement – ${amountStr}`, text, html });
      console.log('[Stripe Webhook] Payment failed email sent to client:', clientEmail);
    }

    // Email to managers
    const managerEmails = await getManagerEmails();
    if (managerEmails.length > 0) {
      const mgrHtml = buildRenewalEmailHtml({
        title: 'Échec de prélèvement client',
        intro: `Le prélèvement de ${amountStr} pour ${clientName} a échoué.`,
        lines: [`Client : ${clientName}`, clientEmail ? `Email : ${clientEmail}` : '', `Montant : ${amountStr}`, '', 'Détail :', ...lines],
        buttonText: 'Voir dans l\'intranet',
        buttonHref: 'https://karbonn.fr/intranet',
      });
      const mgrText = `Échec de prélèvement\n\nClient : ${clientName}\nMontant : ${amountStr}\n\nDétail :\n${lines.join('\n')}`;
      await sendEmail({ to: managerEmails, subject: `[Karbonn] ⚠ Échec prélèvement – ${clientName}`, text: mgrText, html: mgrHtml });
      console.log('[Stripe Webhook] Payment failed email sent to managers:', managerEmails.length);
    }
  } catch (err) {
    console.error('[Stripe Webhook] Error handling payment failed:', err);
  }
}

// Daily check: create/update subscriptions for sites with upcoming deadlines
async function processBillingSubscriptions() {
  console.log('[Billing] Running daily subscription check');
  try {
    const sitesSnap = await db.collection('sitesWeb').get();
    const now = new Date();

    for (const doc of sitesSnap.docs) {
      const site = { id: doc.id, ...doc.data() };
      if (!site.clientId || !site.expirationDate) continue;

      const exp = new Date(site.expirationDate);
      const daysUntilExp = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

      // Process 10 days before expiration
      if (daysUntilExp > 10 || daysUntilExp < 0) continue;
      if (site.stripeBillingProcessed) continue;

      try {
        const customerId = await ensureStripeCustomer(site.clientId);

        // Check customer has a payment method
        const paymentMethods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
        if (paymentMethods.data.length === 0) {
          console.log('[Billing] Skipping site:', site.id, '- customer has no payment method');
          continue;
        }
        const defaultPm = paymentMethods.data[0].id;

        // Get domain price
        const domainCents = getDomainAnnualPriceCents(site.domain);
        const domainPriceId = await getOrCreateStripePrice(
          `Nom de domaine – ${site.domain || 'domaine'}`,
          domainCents,
          'year'
        );

        // Get active services for this site
        const servicesSnap = await db.collection('sitesWeb').doc(site.id).collection('services').get();
        const subscriptionItems = [{ price: domainPriceId }];

        for (const svcDoc of servicesSnap.docs) {
          const svc = svcDoc.data();
          if (!svc.priceCents || svc.priceCents <= 0) continue;
          // Only include services that are still active (not past their end date)
          if (svc.endDate && new Date(svc.endDate) < now) continue;
          const svcPriceId = await getOrCreateStripePrice(
            svc.description || 'Service',
            svc.priceCents,
            'month'
          );
          subscriptionItems.push({ price: svcPriceId });
        }

        // Create or update subscription
        if (site.stripeSubscriptionId) {
          // Update existing subscription items
          const sub = await stripe.subscriptions.retrieve(site.stripeSubscriptionId);
          // Remove old items and add new ones
          for (const item of sub.items.data) {
            await stripe.subscriptionItems.del(item.id);
          }
          await stripe.subscriptions.update(site.stripeSubscriptionId, {
            items: subscriptionItems,
            default_payment_method: defaultPm,
          });
          console.log('[Billing] Updated subscription:', site.stripeSubscriptionId, 'for site:', site.id);
        } else {
          const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: subscriptionItems,
            collection_method: 'charge_automatically',
            default_payment_method: defaultPm,
            metadata: { siteId: site.id, domain: site.domain || '' },
          });
          await db.collection('sitesWeb').doc(site.id).update({
            stripeSubscriptionId: subscription.id,
          });
          console.log('[Billing] Created subscription:', subscription.id, 'for site:', site.id);
        }

        await db.collection('sitesWeb').doc(site.id).update({
          stripeBillingProcessed: true,
        });
      } catch (err) {
        console.error('[Billing] Error processing site:', site.id, err.message);
      }
    }
  } catch (err) {
    console.error('[Billing] Error in processBillingSubscriptions:', err);
  }
}

// ---- Email utilities ----
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
  if (req.path.startsWith('/stripe/webhook')) return next();
  if (req.method === 'OPTIONS') return next();
  verifyAuth(req, res, next);
}, (req, res, next) => {
  if (req.path === '/chat') return next();
  if (req.path.startsWith('/stripe/webhook')) return next();
  if (req.path.startsWith('/finances')) return next(); // Finances visible to all authenticated users
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
// FINANCES (Bunq)
// ===========================

const bunq = require('./bunq');

const FINANCE_CATEGORIES = [
  { key: 'hebergement', label: 'Hébergement', keywords: ['ovh', 'infomaniak', 'ionos', 'aws', 'amazon web services', 'google cloud', 'azure', 'hetzner', 'digitalocean', 'o2switch', 'hostinger', 'hebergement', 'hébergement', 'render', 'vercel', 'netlify', 'scaleway'] },
  { key: 'domaine', label: 'Nom de domaine', keywords: ['gandi', 'namecheap', 'godaddy', 'afnic', 'domaine', 'domain'] },
  { key: 'logiciels', label: 'Logiciels', keywords: ['adobe', 'figma', 'canva', 'microsoft', 'jetbrains', 'sketch', 'affinity', 'notion'] },
  { key: 'publicite', label: 'Publicité', keywords: ['google ads', 'meta', 'facebook', 'instagram', 'linkedin', 'tiktok', 'ads'] },
  { key: 'salaires', label: 'Salaires', keywords: ['salaire', 'paie', 'payroll', 'remuneration', 'rémunération'] },
  { key: 'impots', label: 'Impôts', keywords: ['impot', 'impôt', 'urssaf', 'tva', 'dgfip', 'tresor', 'trésor', 'taxe'] },
  { key: 'materiel', label: 'Matériel', keywords: ['apple', 'dell', 'fnac', 'darty', 'boulanger', 'ldlc', 'amazon', 'materiel', 'matériel', 'logitech'] },
  { key: 'abonnements', label: 'Abonnements', keywords: ['abonnement', 'subscription', 'slack', 'github', 'openai', 'anthropic', 'huggingface', 'mailgun', 'stripe', 'netflix', 'spotify', 'google workspace'] },
];

const FINANCE_CATEGORY_LABELS = {
  hebergement: 'Hébergement',
  domaine: 'Nom de domaine',
  logiciels: 'Logiciels',
  publicite: 'Publicité',
  salaires: 'Salaires',
  impots: 'Impôts',
  materiel: 'Matériel',
  abonnements: 'Abonnements',
  clients: 'Clients',
  divers: 'Divers',
};

function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function categorizeTransaction(tx, clients) {
  const text = normalizeText(`${tx.label} ${tx.counterparty}`);
  if (tx.amount > 0) {
    const client = clients.find(c => {
      const names = [c.fullName, c.entreprise].filter(Boolean).map(normalizeText);
      return names.some(n => n.length > 2 && text.includes(n));
    });
    return { category: 'clients', clientId: client?.id || null, clientName: client?.fullName || null };
  }
  for (const cat of FINANCE_CATEGORIES) {
    if (cat.keywords.some(k => text.includes(normalizeText(k)))) return { category: cat.key, clientId: null, clientName: null };
  }
  return { category: 'divers', clientId: null, clientName: null };
}

async function loadBunqStore() {
  const doc = await db.collection('financesConfig').doc('bunq').get();
  return doc.exists ? doc.data() : {};
}

async function saveBunqStore(store) {
  await db.collection('financesConfig').doc('bunq').set(store, { merge: true });
}

function bunqPaymentToTransaction(payment, accountId) {
  const counterparty = payment.counterparty_alias?.display_name || payment.counterparty_alias?.label_user?.display_name || '';
  return {
    bunqId: `${accountId}-${payment.id}`,
    accountId,
    date: payment.created || null,
    amount: parseFloat(payment.amount?.value || '0'),
    currency: payment.amount?.currency || 'EUR',
    label: payment.description || payment.merchant_reference || '',
    counterparty,
    paymentMethod: payment.type || '',
    source: 'bunq',
  };
}

// Sync transactions from Bunq into Firestore (respects manual corrections)
// Internal sync function (called by auto-sync interval and endpoint)
let _bunqSyncRunning = false;
async function syncBunqTransactions() {
  if (!bunq.isConfigured()) { console.warn('[Finances] Sync skipped: Bunq not configured'); return { error: 'Bunq not configured' }; }
  if (_bunqSyncRunning) { console.log('[Finances] Sync skipped: already running'); return { skipped: true }; }
  _bunqSyncRunning = true;
  console.log('[Finances] ═══ Starting Bunq sync ═══');
  const syncStart = Date.now();
  try {
    const store = await loadBunqStore();
    console.log('[Finances] Store loaded — installationToken:', !!store.installationToken, '| sessionToken:', !!store.sessionToken, '| userId:', store.userId || 'none');
    const persist = async s => saveBunqStore(s);

    const clientsSnap = await db.collection('clients').get();
    const clients = clientsSnap.docs.map(d => ({
      id: d.id,
      fullName: [d.data().prenom, d.data().nom].filter(Boolean).join(' '),
      entreprise: d.data().entreprise || '',
    }));

    const accounts = await bunq.getMonetaryAccounts(store, persist);
    let imported = 0, updated = 0;

    for (const account of accounts) {
      const payments = await bunq.getPayments(store, account.id);
      for (const payment of payments) {
        const tx = bunqPaymentToTransaction(payment, account.id);
        const docRef = db.collection('financesTransactions').doc(tx.bunqId);
        const existing = await docRef.get();
        if (existing.exists) {
          const prev = existing.data();
          const patch = { ...tx, updatedAt: new Date().toISOString() };
          if (!prev.manualCategory) {
            const auto = categorizeTransaction(tx, clients);
            patch.category = auto.category;
            if (!prev.manualClient) { patch.clientId = auto.clientId; patch.clientName = auto.clientName; }
          }
          await docRef.set(patch, { merge: true });
          updated++;
        } else {
          const auto = categorizeTransaction(tx, clients);
          await docRef.set({
            ...tx,
            category: auto.category,
            clientId: auto.clientId,
            clientName: auto.clientName,
            projectId: null,
            projectName: null,
            manualCategory: false,
            manualClient: false,
            createdAt: new Date().toISOString(),
          });
          imported++;
        }
      }
    }

    const balance = accounts.reduce((sum, a) => sum + a.balance, 0);
    await saveBunqStore({ ...store, balance, balanceCurrency: accounts[0]?.currency || 'EUR', balanceUpdatedAt: new Date().toISOString() });
    const elapsed = ((Date.now() - syncStart) / 1000).toFixed(1);
    console.log(`[Finances] ═══ Sync complete in ${elapsed}s: ${imported} imported, ${updated} updated, balance ${balance} EUR ═══`);
    return { success: true, imported, updated, balance, accounts: accounts.length };
  } catch (err) {
    const elapsed = ((Date.now() - syncStart) / 1000).toFixed(1);
    console.error(`[Finances] ═══ Sync FAILED after ${elapsed}s: ${err.message} ═══`, JSON.stringify(err.data || {}));
    throw err;
  } finally {
    _bunqSyncRunning = false;
  }
}

app.post('/api/finances/sync', async (req, res) => {
  if (!bunq.isConfigured()) return res.status(503).json({ error: 'Bunq not configured (BUNQ_API_KEY / BUNQ_PRIVATE_KEY missing)' });
  try {
    const result = await syncBunqTransactions();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

async function getAllFinanceTransactions() {
  const snap = await db.collection('financesTransactions').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function monthKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Dashboard aggregation
app.get('/api/finances/dashboard', async (req, res) => {
  try {
    const [transactions, storeDoc, invoicesData, sitesSnap] = await Promise.all([
      getAllFinanceTransactions(),
      db.collection('financesConfig').doc('bunq').get(),
      qontoRequest('/client_invoices?per_page=100&sort_by=created_at:desc').catch(() => ({ client_invoices: [] })),
      db.collection('sitesWeb').get().catch(() => ({ docs: [] })),
    ]);

    const store = storeDoc.exists ? storeDoc.data() : {};
    const balance = store.balance ?? null;

    const now = new Date();
    const currentMonthKey = monthKey(now.toISOString());
    let revenusMois = 0, depensesMois = 0;
    transactions.forEach(t => {
      const key = monthKey(t.date);
      if (key !== currentMonthKey) return;
      if (t.amount > 0) revenusMois += t.amount;
      else depensesMois += Math.abs(t.amount);
    });

    // Daily buckets (2 days before today + today + 2 days after = 5 days)
    function dayKey(dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d)) return null;
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    const buckets = [];
    for (let i = 2; i >= -2; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      buckets.push({ key: dayKey(d.toISOString()), revenus: 0, depenses: 0 });
    }
    transactions.forEach(t => {
      const key = dayKey(t.date);
      const bucket = buckets.find(b => b.key === key);
      if (!bucket) return;
      if (t.amount > 0) bucket.revenus += t.amount;
      else bucket.depenses += Math.abs(t.amount);
    });

    // Solde evolution: walk backwards from current balance
    let running = balance ?? 0;
    const soldeSeries = [];
    for (let i = buckets.length - 1; i >= 0; i--) {
      soldeSeries.unshift(running);
      running -= (buckets[i].revenus - buckets[i].depenses);
    }

    // Expense breakdown by category (12 months)
    const expenseByCategory = {};
    transactions.forEach(t => {
      if (t.amount >= 0) return;
      const cat = t.category || 'divers';
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + Math.abs(t.amount);
    });

    // Unpaid invoices → trésorerie prévisionnelle
    const invoices = invoicesData.client_invoices || [];
    const unpaidTotal = invoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'canceled')
      .reduce((sum, inv) => sum + parseFloat(inv.total_amount?.value || '0'), 0);

    // Revenu récurrent hébergement : sites actifs × 19,99 €
    const HOSTING_MONTHLY = 19.99;
    const activeSites = sitesSnap.docs.filter(d => {
      const s = d.data();
      if (s.statut === 'Expiré' || s.statut === 'Suspendu') return false;
      if (s.expirationDate) {
        const exp = s.expirationDate.toDate ? s.expirationDate.toDate() : new Date(s.expirationDate);
        if (exp < now) return false;
      }
      return true;
    }).length;

    res.json({
      solde: balance,
      soldeUpdatedAt: store.balanceUpdatedAt || null,
      revenusMois,
      depensesMois,
      beneficeMois: revenusMois - depensesMois,
      tresorerie: (balance ?? 0) + unpaidTotal,
      revenuRecurrent: activeSites * HOSTING_MONTHLY,
      activeSites,
      unpaidInvoicesTotal: unpaidTotal,
      days: buckets.map(b => b.key),
      revenusSeries: buckets.map(b => Math.round(b.revenus * 100) / 100),
      depensesSeries: buckets.map(b => Math.round(b.depenses * 100) / 100),
      beneficeSeries: buckets.map(b => Math.round((b.revenus - b.depenses) * 100) / 100),
      soldeSeries: soldeSeries.map(v => Math.round(v * 100) / 100),
      expenseByCategory: Object.entries(expenseByCategory).map(([key, value]) => ({
        key, label: FINANCE_CATEGORY_LABELS[key] || key, value: Math.round(value * 100) / 100,
      })),
      transactionsCount: transactions.length,
    });
  } catch (err) {
    console.error('[Finances] Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List transactions with search/filters
app.get('/api/finances/transactions', async (req, res) => {
  try {
    let transactions = await getAllFinanceTransactions();
    const { search, category, type, from, to } = req.query;
    if (category) transactions = transactions.filter(t => t.category === category);
    if (type === 'revenu') transactions = transactions.filter(t => t.amount > 0);
    if (type === 'depense') transactions = transactions.filter(t => t.amount < 0);
    if (from) transactions = transactions.filter(t => new Date(t.date) >= new Date(from));
    if (to) transactions = transactions.filter(t => new Date(t.date) <= new Date(to + 'T23:59:59'));
    if (search) {
      const q = normalizeText(search);
      transactions = transactions.filter(t =>
        normalizeText(`${t.label} ${t.counterparty} ${t.clientName || ''} ${t.projectName || ''}`).includes(q));
    }
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ transactions: transactions.slice(0, 500), categories: FINANCE_CATEGORY_LABELS });
  } catch (err) {
    console.error('[Finances] Transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Manual correction (category, client, project)
app.patch('/api/finances/transactions/:id', async (req, res) => {
  try {
    const { category, clientId, clientName, projectId, projectName } = req.body || {};
    const patch = { updatedAt: new Date().toISOString() };
    if (category) { patch.category = category; patch.manualCategory = true; }
    if (clientId !== undefined) { patch.clientId = clientId || null; patch.clientName = clientName || null; patch.manualClient = true; }
    if (projectId !== undefined) { patch.projectId = projectId || null; patch.projectName = projectName || null; }
    await db.collection('financesTransactions').doc(req.params.id).set(patch, { merge: true });
    res.json({ success: true });
  } catch (err) {
    console.error('[Finances] Correction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bank reconciliation: Qonto invoices vs Bunq transactions
app.get('/api/finances/reconciliation', async (req, res) => {
  try {
    const [invoicesData, transactions] = await Promise.all([
      qontoRequest('/client_invoices?per_page=100&sort_by=created_at:desc'),
      getAllFinanceTransactions(),
    ]);
    const invoices = (invoicesData.client_invoices || []).filter(inv => inv.status !== 'canceled');
    const incoming = transactions.filter(t => t.amount > 0);

    const result = invoices.map(inv => {
      const amount = parseFloat(inv.total_amount?.value || '0');
      const issueDate = inv.issue_date ? new Date(inv.issue_date) : null;
      const match = incoming.find(t => {
        if (Math.abs(t.amount - amount) > 0.01) return false;
        const txDate = new Date(t.date);
        if (issueDate && txDate < new Date(issueDate.getTime() - 3 * 24 * 60 * 60 * 1000)) return false;
        return true;
      });
      return {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        client: inv.client?.name || '',
        total_amount: amount,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        reconciled: Boolean(match),
        matchedTransaction: match ? { id: match.id, date: match.date, amount: match.amount, label: match.label, counterparty: match.counterparty } : null,
      };
    });
    res.json({ invoices: result });
  } catch (err) {
    console.error('[Finances] Reconciliation error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Category totals + rules (for the Catégories sub-section)
app.get('/api/finances/categories', async (req, res) => {
  try {
    const transactions = await getAllFinanceTransactions();
    const totals = {};
    const counts = {};
    transactions.forEach(t => {
      const cat = t.category || 'divers';
      totals[cat] = (totals[cat] || 0) + t.amount;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    const categories = Object.entries(FINANCE_CATEGORY_LABELS).map(([key, label]) => ({
      key,
      label,
      total: Math.round((totals[key] || 0) * 100) / 100,
      count: counts[key] || 0,
      keywords: (FINANCE_CATEGORIES.find(c => c.key === key) || {}).keywords || [],
    }));
    res.json({ categories });
  } catch (err) {
    console.error('[Finances] Categories error:', err);
    res.status(500).json({ error: err.message });
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

  // Daily Stripe Billing subscription check (J-10 before expiration)
  setTimeout(() => { processBillingSubscriptions(); }, 60 * 1000);
  setInterval(() => { processBillingSubscriptions(); }, 24 * 60 * 60 * 1000);

  // Auto-sync Bunq transactions every 5 minutes
  if (bunq.isConfigured()) {
    console.log('[Finances] Bunq auto-sync enabled (every 5 min)');
    // Clear old install token (signature format was fixed) then start sync
    db.collection('financesConfig').doc('bunq').get().then(doc => {
      if (doc.exists && doc.data().installationToken && !doc.data()._sigV2) {
        console.log('[Finances] Clearing old Bunq tokens (signature format updated)');
        return db.collection('financesConfig').doc('bunq').set({ _sigV2: true }, { merge: true })
          .then(() => db.collection('financesConfig').doc('bunq').update({ installationToken: null, sessionToken: null, userId: null }));
      }
    }).catch(e => console.warn('[Finances] Token migration error:', e.message));
    setTimeout(() => { syncBunqTransactions().catch(e => console.error('[Finances] Auto-sync error:', e.message)); }, 20 * 1000);
    setInterval(() => { syncBunqTransactions().catch(e => console.error('[Finances] Auto-sync error:', e.message)); }, 5 * 60 * 1000);
  }
});
