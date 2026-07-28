// Bunq API client — https://doc.bunq.com
// Auth flow: installation (RSA public key) → device-server → session-server.
// Every request is signed with the client RSA private key (X-Bunq-Client-Signature).
const crypto = require('crypto');

const BUNQ_API_KEY = (process.env.BUNQ_API_KEY || '').trim();
const BUNQ_PRIVATE_KEY = (process.env.BUNQ_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const BUNQ_BASE_URL = (process.env.BUNQ_ENV || '').toLowerCase() === 'sandbox'
  ? 'https://public-api.sandbox.bunq.com/v1'
  : 'https://api.bunq.com/v1';

function isConfigured() {
  return Boolean(BUNQ_API_KEY && BUNQ_PRIVATE_KEY.includes('PRIVATE KEY'));
}

function bunqUnwrap(response, type) {
  for (const item of response || []) {
    if (item[type]) return item[type];
  }
  return null;
}

function bunqUnwrapAll(response, type) {
  return (response || []).filter(item => item[type]).map(item => item[type]);
}

async function bunqFetch(method, path, { token = null, body = null } = {}) {
  const headers = {
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Language': 'fr_FR',
    'X-Bunq-Region': 'fr_FR',
  };
  if (token) headers['X-Bunq-Client-Authentication'] = token;

  // Signature string: "METHOD path" + sorted X-Bunq-* headers + blank line + body
  const headerLines = Object.keys(headers)
    .sort()
    .map(k => `${k}: ${headers[k]}`)
    .join('\n');
  const bodyStr = body ? JSON.stringify(body) : '';
  const stringToSign = `${method} ${path}\n${headerLines}\n\n${bodyStr}`;
  headers['X-Bunq-Client-Signature'] = crypto
    .sign('sha256', Buffer.from(stringToSign), BUNQ_PRIVATE_KEY)
    .toString('base64');
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${BUNQ_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? bodyStr : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const description = data?.Error?.[0]?.error_description_translated || response.statusText;
    const err = new Error(`Bunq ${method} ${path} → ${response.status}: ${description}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data.Response;
}

// Full auth flow. Caches tokens in the provided store object (persisted via onTokensChanged).
async function createSession(store, onTokensChanged) {
  let installationToken = store.installationToken || null;

  if (!installationToken) {
    const publicKeyPem = crypto.createPublicKey(BUNQ_PRIVATE_KEY).export({ type: 'spki', format: 'pem' });
    const installation = await bunqFetch('POST', '/installation', { body: { client_public_key: publicKeyPem } });
    installationToken = bunqUnwrap(installation, 'Token')?.token;
    if (!installationToken) throw new Error('Bunq installation failed: no token returned');

    await bunqFetch('POST', '/device-server', {
      token: installationToken,
      body: { description: 'Karbonn Intranet', secret: BUNQ_API_KEY, permitted_ips: ['*'] },
    });
    console.log('[Bunq] Installation + device-server registered');
  }

  const session = await bunqFetch('POST', '/session-server', {
    token: installationToken,
    body: { secret: BUNQ_API_KEY },
  });
  const sessionToken = bunqUnwrap(session, 'Token')?.token;
  const user = bunqUnwrap(session, 'UserPerson') || bunqUnwrap(session, 'UserCompany');
  if (!sessionToken || !user) throw new Error('Bunq session creation failed');

  Object.assign(store, {
    installationToken,
    sessionToken,
    sessionCreatedAt: new Date().toISOString(),
    userId: user.id,
  });
  if (onTokensChanged) await onTokensChanged(store);
  console.log('[Bunq] Session created for user', user.id);
  return store;
}

async function ensureSession(store, onTokensChanged) {
  const ageMs = store.sessionCreatedAt ? Date.now() - new Date(store.sessionCreatedAt).getTime() : Infinity;
  if (store.sessionToken && store.userId && ageMs < 12 * 60 * 60 * 1000) return store;
  try {
    return await createSession(store, onTokensChanged);
  } catch (err) {
    if (store.installationToken) {
      console.warn('[Bunq] Session failed, retrying full installation:', err.message);
      store.installationToken = null;
      return createSession(store, onTokensChanged);
    }
    throw err;
  }
}

// Fetch all monetary accounts with balances
async function getMonetaryAccounts(store, onTokensChanged) {
  await ensureSession(store, onTokensChanged);
  const res = await bunqFetch('GET', `/user/${store.userId}/monetary-account`, { token: store.sessionToken });
  const accounts = [...bunqUnwrapAll(res, 'MonetaryAccountBank'), ...bunqUnwrapAll(res, 'MonetaryAccountSavings')];
  return accounts.map(a => ({
    id: a.id,
    description: a.description || '',
    balance: parseFloat(a.balance?.value || '0'),
    currency: a.balance?.currency || 'EUR',
  }));
}

// Fetch payments for an account (multiple pages)
async function getPayments(store, accountId, { maxPages = 5, count = 200 } = {}) {
  const payments = [];
  let path = `/user/${store.userId}/monetary-account/${accountId}/payment?count=${count}`;
  for (let page = 0; page < maxPages && path; page++) {
    const res = await bunqFetch('GET', path, { token: store.sessionToken });
    const batch = bunqUnwrapAll(res, 'Payment');
    payments.push(...batch);
    if (batch.length < count) break;
    const olderId = Math.min(...batch.map(p => p.id));
    path = `/user/${store.userId}/monetary-account/${accountId}/payment?count=${count}&older_id=${olderId}`;
  }
  return payments;
}

module.exports = { isConfigured, createSession, ensureSession, getMonetaryAccounts, getPayments };
