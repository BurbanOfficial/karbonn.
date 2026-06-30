require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const ABBY_BASE_URL = process.env.ABBY_API_URL || 'https://api.app-abby.com';

// Initialize Firebase Admin
function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
  } else {
    console.warn('No Firebase credentials provided. Firebase Auth verification will fail.');
    admin.initializeApp();
  }
}
initFirebaseAdmin();

const db = admin.firestore();

// Validate Abby API key
if (!process.env.ABBY_API_KEY) {
  console.error('ABBY_API_KEY is not set');
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['*']; // allow all in dev
    if (!origin || allowed.includes('*') || allowed.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS rejected origin: ${origin}. Allowed: ${allowed.join(', ')}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Verify Firebase Auth token and attach req.user
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Verify user is Manager in Firestore
async function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: 'User profile not found' });
    }

    const role = userDoc.data().role;
    const roleLabel = typeof role === 'object' && role.label ? role.label : role;
    if (roleLabel !== 'Manager') {
      return res.status(403).json({ error: 'Manager access required' });
    }

    next();
  } catch (err) {
    console.error('Manager check failed:', err.message);
    return res.status(500).json({ error: 'Failed to verify role' });
  }
}

// Apply auth + manager to all /api routes, but allow CORS preflight
app.options('/api/*', cors());
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  verifyAuth(req, res, next);
}, requireManager);

// Raw HTTP helper to call Abby API
async function abbyRequest(path, options = {}) {
  const url = `${ABBY_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${process.env.ABBY_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const rawMessage = data?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : (rawMessage || `Abby API error ${response.status}`);
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    console.error(`Abby API ${response.status} on ${path}:`, JSON.stringify(data));
    throw error;
  }

  return data;
}

// Utility: parse French address string
function parseAddress(addressString) {
  if (!addressString) {
    return { address: '', city: '', zipCode: '', country: 'FR' };
  }

  const parts = addressString.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { address: addressString, city: '', zipCode: '', country: 'FR' };
  }

  const address = parts[0] || '';
  let city = '';
  let zipCode = '';

  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    const match = lastPart.match(/^(\d{4,5})\s+(.+)$/);
    if (match) {
      zipCode = match[1];
      city = match[2];
    } else {
      city = lastPart;
    }
  }

  return { address, city, zipCode, country: 'FR' };
}

// Utility: build Abby address
function buildAddress(client) {
  const parsed = parseAddress(client.adresse || '');
  return {
    address: parsed.address,
    complement: '',
    city: parsed.city,
    zipCode: parsed.zipCode,
    state: '',
    country: parsed.country,
  };
}

function buildClientPreferences(client) {
  const validLanguages = ['fr', 'en', 'de', 'it', 'nl', 'pt', 'es'];
  const validPayments = ['transfer', 'direct_debit', 'credit_card', 'cheque', 'universal_employment_service_cheque', 'cash', 'paypal', 'stripe', 'other'];
  const language = validLanguages.includes(client.langue) ? client.langue : 'fr';
  const payment = validPayments.includes(client.paiement) ? client.paiement : 'transfer';
  return {
    language,
    currency: 'EUR',
    paymentMethods: [payment],
  };
}

// Sync a single client to Abby
app.post('/api/sync-client', async (req, res) => {
  const { client } = req.body;
  if (!client || !client.id) {
    return res.status(400).json({ error: 'Missing client data' });
  }

  try {
    const address = buildAddress(client);
    const emails = client.email ? [client.email] : [];
    const preferences = buildClientPreferences(client);

    let abbyCustomerId = null;
    let abbyCustomerType = null;
    let abbyData = null;

    if (client.type === 'professionnel') {
      const orgName = client.entreprise || `${client.prenom} ${client.nom}`.trim() || client.email;
      const orgData = {
        name: orgName,
        commercialName: client.entreprise || '',
        emails,
        siret: client.siret || '',
        vatNumber: '',
        billingAddress: address,
        notes: '',
        preferences,
      };

      abbyData = await abbyRequest('/organization', {
        method: 'POST',
        body: JSON.stringify(orgData),
      });
      abbyCustomerId = abbyData.id;
      abbyCustomerType = 'organization';

      // Create a linked contact (the individual person behind the company)
      const contactData = {
        firstname: client.prenom || '',
        lastname: client.nom || '',
        phone: client.telephone || '',
        emails: client.email ? [client.email] : [],
      };
      try {
        const contactResult = await abbyRequest(`/organization/${abbyCustomerId}/contact`, {
          method: 'POST',
          body: JSON.stringify(contactData),
        });
        // Store the contact ID alongside the org ID
        await db.collection('clients').doc(client.id).update({
          abbyContactId: contactResult.id,
        });
        console.log(`Created Abby contact ${contactResult.id} for org ${abbyCustomerId}`);
      } catch (contactErr) {
        console.warn('Could not create Abby contact for org (non-fatal):', contactErr.message);
      }
    } else {
      const contactData = {
        firstname: client.prenom || '',
        lastname: client.nom || '',
        phone: client.telephone || '',
        jobTitle: '',
        emails,
        notes: '',
        billingAddress: address,
        preferences,
      };

      abbyData = await abbyRequest('/contact', {
        method: 'POST',
        body: JSON.stringify(contactData),
      });
      abbyCustomerId = abbyData.id;
      abbyCustomerType = 'contact';
    }

    await db.collection('clients').doc(client.id).update({
      abbyCustomerId,
      abbyCustomerType,
      abbySyncStatus: 'synced',
      abbySyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, abbyCustomerId, abbyCustomerType });
  } catch (err) {
    console.error('Sync client error:', err.message, err.data);
    res.status(500).json({ error: err.message || 'Failed to sync client to Abby' });
  }
});

// Delete a client from Abby and Firestore
app.delete('/api/client/:id', async (req, res) => {
  try {
    const clientDoc = await db.collection('clients').doc(req.params.id).get();
    if (!clientDoc.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }
    const client = clientDoc.data();

    // Delete from Abby if previously synced
    if (client.abbyCustomerId && client.abbyCustomerType) {
      const endpoint = client.abbyCustomerType === 'organization'
        ? `/organization/${client.abbyCustomerId}`
        : `/contact/${client.abbyCustomerId}`;
      try {
        await abbyRequest(endpoint, { method: 'DELETE' });
      } catch (abbyErr) {
        console.error('Abby delete error:', abbyErr.message);
        // Continue with Firestore deletion even if Abby fails
      }
    }

    await db.collection('clients').doc(req.params.id).delete();

    res.json({ success: true });
  } catch (err) {
    console.error('Delete client error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to delete client' });
  }
});

// Sync all existing clients
app.post('/api/sync-all-clients', async (req, res) => {
  try {
    const snapshot = await db.collection('clients').get();
    const clients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const results = [];
    for (const client of clients) {
      if (client.abbyCustomerId) {
        results.push({ id: client.id, status: 'skipped', reason: 'Already synced' });
        continue;
      }

      try {
        const address = buildAddress(client);
        const emails = client.email ? [client.email] : [];

        let abbyCustomerId = null;
        let abbyCustomerType = null;
        const preferences = buildClientPreferences(client);
        const orgName = client.entreprise || `${client.prenom} ${client.nom}`.trim() || client.email;

        if (client.type === 'professionnel') {
          const abbyData = await abbyRequest('/organization', {
            method: 'POST',
            body: JSON.stringify({
              name: orgName,
              commercialName: client.entreprise || '',
              emails,
              siret: client.siret || '',
              vatNumber: '',
              billingAddress: address,
              notes: '',
              preferences,
            }),
          });
          abbyCustomerId = abbyData.id;
          abbyCustomerType = 'organization';
        } else {
          const abbyData = await abbyRequest('/contact', {
            method: 'POST',
            body: JSON.stringify({
              firstname: client.prenom || '',
              lastname: client.nom || '',
              phone: client.telephone || '',
              jobTitle: '',
              emails,
              notes: '',
              billingAddress: address,
              preferences,
            }),
          });
          abbyCustomerId = abbyData.id;
          abbyCustomerType = 'contact';
        }

        await db.collection('clients').doc(client.id).update({
          abbyCustomerId,
          abbyCustomerType,
          abbySyncStatus: 'synced',
          abbySyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.push({ id: client.id, status: 'synced', abbyCustomerId });
      } catch (err) {
        console.error(`Failed to sync client ${client.id}:`, err.message);
        results.push({ id: client.id, status: 'error', error: err.message });
      }
    }

    res.json({ success: true, total: clients.length, results });
  } catch (err) {
    console.error('Sync all clients error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to sync clients' });
  }
});

// Map numeric quantityUnit to Abby string enum
const QUANTITY_UNIT_MAP = {
  14: 'unit',
  1: 'hour',
  2: 'day',
  3: 'month',
  22: 'fixed_rate',
  23: 'year',
  4: 'gram',
  5: 'kilogram',
  6: 'ton',
  7: 'kilometer',
  8: 'liter',
  9: 'batch',
  10: 'meter',
  11: 'square_meter',
  12: 'cubic_meter',
  13: 'linear_meter',
  15: 'person',
  16: 'word',
  17: 'page',
  18: 'leaflet',
  19: 'paragraph',
  20: 'minute',
  21: 'overnight_stay',
};

// Map numeric type to Abby string enum
const PRODUCT_TYPE_MAP = {
  1: 'service_delivery',
  2: 'sale_of_goods',
  3: 'commercial_or_craft_services',
  4: 'sale_of_manufactured_goods',
  5: 'disbursement',
};

// Helper: build Abby billing lines from frontend lines
function buildAbbyLines(lines) {
  return lines.map(line => ({
    designation: line.designation || '',
    quantity: Number(line.quantity) || 1,
    unitPrice: Math.round(Number(line.unitPrice) * 100), // euros to cents
    quantityUnit: QUANTITY_UNIT_MAP[Number(line.quantityUnit)] || 'unit',
    type: PRODUCT_TYPE_MAP[Number(line.type)] || 'service_delivery',
    vatCode: line.vatCode || 'FR_2000',
    isDeliveryOfGoods: false,
  }));
}

// Create estimate
app.post('/api/create-estimate', async (req, res) => {
  const { clientId, abbyCustomerId, abbyContactId, title, lines, paymentDelay, finalize, estimateType = 'estimate', withElectronicSignature = false } = req.body;
  // For pro clients use the contact ID so Abby links estimate to org via contact
  const effectiveCustomerId = abbyContactId || abbyCustomerId;

  if (!abbyCustomerId || !lines || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Missing customerId or lines' });
  }

  if (clientId) {
    const clientDoc = await db.collection('clients').doc(clientId).get();
    if (clientDoc.exists) {
      const client = clientDoc.data();
      const address = buildAddress(client);
      if (!address.address || !address.city || !address.zipCode) {
        return res.status(400).json({ error: 'Adresse client incomplète. Veuillez renseigner rue, code postal et ville.' });
      }
    }
  }

  // Ensure customer address is up-to-date in Abby before creating the billing
  if (clientId) {
    try {
      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data();
        const address = buildAddress(client);
        const isOrg = client.type === 'professionnel';
        const patchPath = isOrg
          ? `/v2/organization/${encodeURIComponent(abbyCustomerId)}`
          : `/v2/contact/${encodeURIComponent(abbyCustomerId)}`;
        await abbyRequest(patchPath, {
          method: 'PATCH',
          body: JSON.stringify({ billingAddress: address }),
        });
        console.log(`Patched Abby customer address for ${abbyCustomerId}`);
      }
    } catch (patchErr) {
      console.warn('Could not patch Abby customer address (non-fatal):', patchErr.message);
    }
  }

  try {
    console.log(`Creating estimate for customer ${effectiveCustomerId}`);
    const estimate = await abbyRequest(`/v2/billing/estimate/${encodeURIComponent(effectiveCustomerId)}`, {
      method: 'POST',
      body: JSON.stringify({ estimateType }),
    });
    console.log(`Estimate created: ${estimate.id}, updating lines`);

    const abbyLines = buildAbbyLines(lines);
    console.log('Lines payload:', JSON.stringify(abbyLines));
    await abbyRequest(`/v2/billing/${estimate.id}/lines`, {
      method: 'PATCH',
      body: JSON.stringify({ lines: abbyLines }),
    });

    if (finalize) {
      await abbyRequest(`/v2/billing/${estimate.id}/finalize`, { method: 'PATCH' });
      if (withElectronicSignature) {
        try {
          await abbyRequest(`/v2/billing/estimate/${estimate.id}/electronic-signature`, { method: 'POST' });
          console.log(`Electronic signature activated on estimate ${estimate.id}`);
        } catch (sigErr) {
          console.warn('Could not activate electronic signature (non-fatal):', sigErr.message);
        }
      }
    }

    await db.collection('billings').add({
      clientId,
      abbyCustomerId,
      abbyBillingId: estimate.id,
      type: 'estimate',
      title: title || '',
      status: finalize ? 'finalized' : 'draft',
      lines,
      paymentDelay: paymentDelay || 'thirty_days',
      currency: 'EUR',
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, abbyBillingId: estimate.id, number: estimate.number });
  } catch (err) {
    const details = err.data || null;
    console.error('Create estimate error:', err.message, details);
    res.status(500).json({ error: err.message || 'Failed to create estimate', details });
  }
});

// Create invoice
app.post('/api/create-invoice', async (req, res) => {
  const { clientId, abbyCustomerId, title, lines, paymentDelay, finalize } = req.body;

  if (!abbyCustomerId || !lines || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Missing customerId or lines' });
  }

  if (clientId) {
    const clientDoc = await db.collection('clients').doc(clientId).get();
    if (clientDoc.exists) {
      const client = clientDoc.data();
      const address = buildAddress(client);
      if (!address.address || !address.city || !address.zipCode) {
        return res.status(400).json({ error: 'Adresse client incomplète. Veuillez renseigner rue, code postal et ville.' });
      }
    }
  }

  // Ensure customer address is up-to-date in Abby before creating the billing
  if (clientId) {
    try {
      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data();
        const address = buildAddress(client);
        const isOrg = client.type === 'professionnel';
        const patchPath = isOrg
          ? `/v2/organization/${encodeURIComponent(abbyCustomerId)}`
          : `/v2/contact/${encodeURIComponent(abbyCustomerId)}`;
        await abbyRequest(patchPath, {
          method: 'PATCH',
          body: JSON.stringify({ billingAddress: address }),
        });
        console.log(`Patched Abby customer address for ${abbyCustomerId}`);
      }
    } catch (patchErr) {
      console.warn('Could not patch Abby customer address (non-fatal):', patchErr.message);
    }
  }

  try {
    console.log(`Creating invoice for customer ${abbyCustomerId}`);
    const invoice = await abbyRequest(`/v2/billing/invoice/${encodeURIComponent(abbyCustomerId)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    console.log(`Invoice created: ${invoice.id}, updating lines`);

    const abbyLines = buildAbbyLines(lines);
    console.log('Lines payload:', JSON.stringify(abbyLines));
    await abbyRequest(`/v2/billing/${invoice.id}/lines`, {
      method: 'PATCH',
      body: JSON.stringify({ lines: abbyLines }),
    });

    if (finalize) {
      await abbyRequest(`/v2/billing/${invoice.id}/finalize`, { method: 'PATCH' });
    }

    await db.collection('billings').add({
      clientId,
      abbyCustomerId,
      abbyBillingId: invoice.id,
      type: 'invoice',
      title: title || '',
      status: finalize ? 'finalized' : 'draft',
      lines,
      paymentDelay: paymentDelay || 'thirty_days',
      currency: 'EUR',
      createdBy: req.user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, abbyBillingId: invoice.id, number: invoice.number });
  } catch (err) {
    const details = err.data || null;
    console.error('Create invoice error:', err.message, details);
    res.status(500).json({ error: err.message || 'Failed to create invoice', details });
  }
});

// Finalize billing
app.patch('/api/billing/:id/finalize', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/${req.params.id}/finalize`, { method: 'PATCH' });
    await updateBillingStatus(req.params.id, 'finalized');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Finalize error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sign estimate
app.patch('/api/billing/:id/sign', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/estimate/${req.params.id}/sign`, { method: 'PATCH' });
    await updateBillingStatus(req.params.id, 'signed');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Sign error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Unsign estimate
app.patch('/api/billing/:id/unsign', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/estimate/${req.params.id}/unsign`, { method: 'PATCH' });
    await updateBillingStatus(req.params.id, 'finalized');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Unsign error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Refuse estimate
app.patch('/api/billing/:id/refuse', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/estimate/${req.params.id}/refuse`, { method: 'PATCH' });
    await updateBillingStatus(req.params.id, 'refused');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Refuse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Unrefuse estimate
app.patch('/api/billing/:id/unrefuse', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/estimate/${req.params.id}/unrefuse`, { method: 'PATCH' });
    await updateBillingStatus(req.params.id, 'finalized');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Unrefuse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Mark invoice as paid
app.patch('/api/billing/:id/mark-paid', async (req, res) => {
  try {
    // Calculate remaining amount from stored lines
    const snapshot = await db.collection('billings').where('abbyBillingId', '==', req.params.id).limit(1).get();
    let remainingAmount = 0;
    if (!snapshot.empty) {
      const billing = snapshot.docs[0].data();
      const vatRates = { FR_2000: 0.2, FR_1000: 0.1, FR_550: 0.055, FR_00HT: 0 };
      remainingAmount = Math.round((billing.lines || []).reduce((sum, line) => {
        const rate = vatRates[line.vatCode] || 0.2;
        return sum + (line.quantity * line.unitPrice * (1 + rate));
      }, 0) * 100);
    }

    const today = new Date().toISOString().split('T')[0];
    const data = await abbyRequest(`/v2/accounting-billing/invoice/${req.params.id}/reconciliate`, {
      method: 'POST',
      body: JSON.stringify({
        payments: [{
          amount: remainingAmount,
          receivedAt: today,
          method: 'transfer',
        }],
      }),
    });

    await updateBillingStatus(req.params.id, 'paid');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Mark paid error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Mark invoice as unpaid (cancel reconciliation)
app.patch('/api/billing/:id/mark-unpaid', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/accounting-billing/invoice/${req.params.id}/unreconciliate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    await updateBillingStatus(req.params.id, 'finalized');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Mark unpaid error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Download billing PDF (proxy as binary stream)
app.get('/api/billing/:id/download', async (req, res) => {
  try {
    const locale = req.query.locale || 'fr';
    const response = await fetch(`${ABBY_BASE_URL}/v2/billing/${req.params.id}/download?locale=${locale}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.ABBY_API_KEY}`,
      },
    });
    if (!response.ok) throw new Error(`Abby API error ${response.status}`);
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="billing-${req.params.id}.pdf"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sync billing status from Abby
app.post('/api/billing/:id/sync-status', async (req, res) => {
  try {
    const abbyDoc = await abbyRequest(`/v2/billing/${req.params.id}`, { method: 'GET' });
    // Abby state: 1=draft, 2=finalized, 3=signed/paid, 4=refused
    // Also check finalizedAt, signedAt, refusedAt fields
    const ABBY_STATE_MAP = { 1: 'draft', 2: 'finalized', 3: 'finalized', 4: 'refused', 5: 'paid' };
    let status = ABBY_STATE_MAP[abbyDoc.state] || 'draft';
    // Refine using specific timestamps
    if (abbyDoc.signedAt) status = 'signed';
    if (abbyDoc.refusedAt) status = 'refused';
    if (abbyDoc.paidAt) status = 'paid';
    if (abbyDoc.finalizedAt && !abbyDoc.signedAt && !abbyDoc.refusedAt && !abbyDoc.paidAt) status = 'finalized';
    if (!abbyDoc.finalizedAt) status = 'draft';
    await updateBillingStatus(req.params.id, status);
    console.log(`Synced billing ${req.params.id} status: ${status}`);
    res.json({ success: true, status });
  } catch (err) {
    console.error('Sync status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Send billing by email
app.post('/api/billing/:id/send', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/${req.params.id}/send-by-email`, { method: 'POST', body: JSON.stringify({}) });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Send email error:', err.message, err.data);
    res.status(500).json({ error: err.message, details: err.data });
  }
});

// Activate electronic signature on a finalized estimate
app.post('/api/billing/:id/activate-esignature', async (req, res) => {
  try {
    const data = await abbyRequest(`/v2/billing/estimate/${req.params.id}/electronic-signature`, { method: 'POST' });
    res.json({ success: true, data });
  } catch (err) {
    console.error('E-signature error:', err.message, err.data);
    res.status(500).json({ error: err.message, details: err.data });
  }
});

// Get billing status from Firestore
app.get('/api/billing/:id/status', async (req, res) => {
  try {
    const snapshot = await db.collection('billings').where('abbyBillingId', '==', req.params.id).limit(1).get();
    if (snapshot.empty) {
      return res.status(404).json({ error: 'Billing not found' });
    }
    res.json({ success: true, data: snapshot.docs[0].data() });
  } catch (err) {
    console.error('Status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: update billing status in Firestore
async function updateBillingStatus(abbyBillingId, status) {
  try {
    const snapshot = await db.collection('billings').where('abbyBillingId', '==', abbyBillingId).limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
  } catch (err) {
    console.error('Update billing status error:', err.message);
  }
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Karbonn Abby API running on port ${PORT}`);
});
