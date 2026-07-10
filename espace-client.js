const API_BASE_URL = 'https://karbonn-x-abby.onrender.com';

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const loginForm = document.getElementById('login-form');
const loginIdInput = document.getElementById('login-id');
const loginError = document.getElementById('login-error');
const clientNameEl = document.getElementById('client-name');
const clientBadgeEl = document.getElementById('client-badge');

let currentClient = null;

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';

  const rawId = loginIdInput.value.trim().toUpperCase();

  if (!rawId) {
    loginError.textContent = 'Veuillez saisir votre identifiant.';
    return;
  }

  const idPattern = /^KRB-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
  if (!idPattern.test(rawId)) {
    loginError.textContent = 'Format invalide. L\'identifiant doit être au format KRB-000-000.';
    return;
  }

  try {
    const snapshot = await db.collection('clients').where('clientId', '==', rawId).get();

    if (snapshot.empty) {
      loginError.textContent = 'Aucun compte trouvé avec cet identifiant.';
      return;
    }

    const doc = snapshot.docs[0];
    currentClient = { id: doc.id, ...doc.data() };
    showApp(currentClient);
  } catch (err) {
    console.error(err);
    loginError.textContent = 'Erreur lors de la connexion. Veuillez réessayer.';
  }
});

const domainesListEl = document.getElementById('domaines-list');

function renderDomaines(sites) {
  if (!domainesListEl) return;
  if (!sites.length) {
    domainesListEl.innerHTML = `
      <div class="placeholder">
        <i class="fa-solid fa-globe fa-2x"></i>
        <p>Aucun nom de domaine associé à votre compte.</p>
      </div>`;
    return;
  }
  domainesListEl.innerHTML = `<div class="domaines-grid">
    ${sites.map(site => {
      const domain = typeof site === 'string' ? site : (site.domain || '—');
      const status = site.status || '—';
      const expiration = site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—';
      return `
        <div class="domaine-card">
          <i class="fa-solid fa-globe"></i>
          <div>
            <div class="domaine-name">${domain}</div>
            <div style="font-size:0.8rem;color:var(--muted);margin-top:4px;">Statut : ${status}</div>
            <div style="font-size:0.8rem;color:var(--muted);">Expiration : ${expiration}</div>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

async function showApp(client) {
  loginScreen.classList.add('hidden');
  appContent.classList.remove('hidden');

  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client';
  if (clientNameEl) clientNameEl.textContent = name;
  if (clientBadgeEl) clientBadgeEl.textContent = client.clientId;

  const sitesUrl = `${API_BASE_URL}/api/public/client/${client.clientId}/sites`;
  console.log('[Client] Fetching sites from:', sitesUrl);
  try {
    const res = await fetch(sitesUrl);
    console.log('[Client] Sites response status:', res.status, res.statusText);
    if (res.ok) {
      const data = await res.json();
      console.log('[Client] Sites loaded:', data.sites?.length || 0);
      renderDomaines(data.sites || []);
    } else {
      const text = await res.text();
      console.warn('[Client] Sites request failed:', res.status, text);
      renderDomaines(client.sites || []);
    }
  } catch (err) {
    console.warn('[Client] Failed to load sites from API:', err);
    renderDomaines(client.sites || []);
  }
}

function logout() {
  currentClient = null;
  loginScreen.classList.remove('hidden');
  appContent.classList.add('hidden');
  loginIdInput.value = '';
  loginError.textContent = '';
  if (clientNameEl) clientNameEl.textContent = '';
  if (clientBadgeEl) clientBadgeEl.textContent = '';
}

document.getElementById('logout-btn').addEventListener('click', logout);

const navLogout = document.getElementById('nav-logout');
if (navLogout) navLogout.addEventListener('click', e => { e.preventDefault(); logout(); });

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section-page');
const sectionMap = [
  'section-domaines',
  'section-factures',
  'section-support'
];

navItems.forEach((item, index) => {
  item.addEventListener('click', e => {
    e.preventDefault();
    if (item.id === 'nav-logout') return;

    const sectionId = sectionMap[index];
    if (!sectionId) return;

    navItems.forEach(i => i.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    item.classList.add('active');
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');
  });
});

// Auto-format input as user types (KRB-XXX-XXX)
loginIdInput.addEventListener('input', () => {
  let val = loginIdInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

  // Auto-add dashes
  if (val.length === 3 && !val.includes('-')) {
    val = val + '-';
  } else if (val.length === 7 && val.charAt(3) === '-' && val.charAt(6) !== '-') {
    val = val.slice(0, 7) + '-' + val.slice(7);
  }

  loginIdInput.value = val;
});
