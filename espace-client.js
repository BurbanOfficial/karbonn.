const API_BASE_URL = 'https://karbonn-x-abby.onrender.com';

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const loginForm = document.getElementById('login-form');
const loginIdInput = document.getElementById('login-id');
const loginError = document.getElementById('login-error');
const clientNameEl = document.getElementById('client-name');
const clientBadgeEl = document.getElementById('client-badge');

let currentClient = null;
let clientSites = [];

const SITE_STATUSES = ['Actif','Suspendu','En maintenance','Expiré','En attente'];

function getSiteStatusClass(status) {
  const key = (status || 'En attente').toLowerCase().replace(/\s+/g, '-');
  return `site-status-${key}`;
}

function getEffectiveSiteStatus(site) {
  if (!site) return 'En attente';
  if (site.status === 'Actif' && site.expirationDate) {
    const exp = new Date(site.expirationDate);
    const now = new Date();
    now.setHours(0,0,0,0);
    exp.setHours(23,59,59,999);
    if (exp < now) return 'Expiré';
    const daysUntil = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 30) return 'Bientôt expiré';
  }
  return site.status || 'En attente';
}

function getDomainExtension(domain) {
  if (!domain) return '—';
  const parts = domain.split('.');
  if (parts.length < 2) return '—';
  return '.' + parts[parts.length - 1];
}

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
const siteDetailSection = document.getElementById('section-site-detail');
const siteDetailTitle = document.getElementById('site-detail-title');
const siteDetailContent = document.getElementById('site-detail-content');
const siteDetailBack = document.getElementById('site-detail-back');
const renewalSection = document.getElementById('section-renouveler');
const renewalTitle = document.getElementById('renewal-title');
const renewalContent = document.getElementById('renewal-content');
const renewalBack = document.getElementById('renewal-back');

function showSection(sectionId) {
  sections.forEach(s => s.classList.remove('active'));
  const target = document.getElementById(sectionId);
  if (target) target.classList.add('active');
}

function goBackToDomains() {
  navItems.forEach(i => i.classList.remove('active'));
  const domainesNav = Array.from(navItems).find(i => i.dataset.label === 'Mes domaines');
  if (domainesNav) domainesNav.classList.add('active');
  showSection('section-domaines');
}

if (siteDetailBack) siteDetailBack.addEventListener('click', goBackToDomains);
if (renewalBack) renewalBack.addEventListener('click', goBackToDomains);

function openSiteDetail(site) {
  const domain = site.domain || '—';
  const status = getEffectiveSiteStatus(site);
  const statusClass = getSiteStatusClass(status);
  siteDetailTitle.textContent = domain;

  const fields = [
    { label: 'Nom de domaine', icon: 'fa-globe', value: domain },
    { label: 'Statut', icon: 'fa-signal', value: `<span class="site-status-badge ${statusClass}">${status}</span>` },
    { label: "Date d'expiration", icon: 'fa-calendar-xmark', value: site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—' },
    { label: 'Date de création', icon: 'fa-calendar-plus', value: site.creationDate ? new Date(site.creationDate).toLocaleDateString('fr-FR') : '—' },
    { label: 'Hébergeur', icon: 'fa-server', value: site.host || '—' },
    { label: 'Serveur', icon: 'fa-network-wired', value: site.server || '—' },
    { label: 'Extension', icon: 'fa-tag', value: getDomainExtension(domain) }
  ];

  const infoCards = fields.map(f => `
    <div class="site-info-card">
      <div class="site-info-card-icon"><i class="fa-solid ${f.icon}"></i></div>
      <div class="site-info-card-content">
        <span class="site-info-card-label">${f.label}</span>
        <span class="site-info-card-value">${f.value}</span>
      </div>
    </div>
  `).join('');

  const allHistory = site.history || [];
  const clientNotes = allHistory.filter(item => item.type === 'note' && item.createdByName === 'Espace Client');
  const teamNotes = allHistory.filter(item => item.type === 'note' && item.createdByName !== 'Espace Client');

  siteDetailContent.innerHTML = `
    <div class="site-detail-grid">
      <div class="detail-panel">
        <h2><i class="fa-solid fa-circle-info"></i> Informations générales</h2>
        <div class="site-info-grid">
          ${infoCards}
        </div>
      </div>
      <div class="detail-panel">
        <h2><i class="fa-regular fa-comment-dots"></i> Vos remarques</h2>
        <form id="site-note-form" class="note-form">
          <label for="site-note-input" class="note-label">Déposer une amélioration ou une remarque</label>
          <div class="note-input-wrapper">
            <textarea id="site-note-input" class="note-textarea" rows="3" placeholder="Décrivez l'amélioration que vous souhaitez ajouter à votre site..."></textarea>
            <button type="submit" class="note-submit"><i class="fa-solid fa-paper-plane"></i> Envoyer</button>
          </div>
          <p id="site-note-message" class="note-message"></p>
        </form>
        <div class="note-divider"></div>
        <div id="site-detail-client-notes" class="note-list-container">Chargement...</div>
      </div>
    </div>
    <div class="detail-panel full-width" style="margin-top:24px;">
      <h2><i class="fa-solid fa-users"></i> Notes de l'équipe Karbonn</h2>
      <div id="site-detail-team-notes" style="color:var(--muted);font-size:0.9rem;">Chargement...</div>
    </div>
  `;

  renderClientNotes(clientNotes);
  renderTeamNotes(teamNotes);

  const noteForm = document.getElementById('site-note-form');
  if (noteForm) {
    noteForm.addEventListener('submit', async e => {
      e.preventDefault();
      await submitSiteNote(site);
    });
  }

  showSection('section-site-detail');
}

async function submitSiteNote(site) {
  const input = document.getElementById('site-note-input');
  const message = document.getElementById('site-note-message');
  if (!input || !message) return;

  const content = input.value.trim();
  if (!content) {
    message.textContent = 'Veuillez saisir une note.';
    message.style.color = '#d97706';
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text);
    }
    const data = await res.json();
    message.textContent = 'Note envoyée avec succès.';
    message.style.color = '#059669';
    input.value = '';
    if (data.note) {
      site.history = [data.note, ...(site.history || [])];
      const clientNotes = site.history.filter(item => item.type === 'note' && item.createdByName === 'Espace Client');
      renderClientNotes(clientNotes);
    }
  } catch (err) {
    console.warn('[Client] Failed to submit note:', err);
    message.textContent = 'Erreur lors de l\'envoi de la note.';
    message.style.color = '#dc2626';
  }
}

function renderClientNotes(notes) {
  const container = document.getElementById('site-detail-client-notes');
  if (!container) return;
  if (!notes.length) {
    container.innerHTML = `
      <div class="note-empty">
        <i class="fa-regular fa-clipboard"></i>
        <p>Aucune remarque pour le moment.</p>
        <span>Déposez votre première suggestion ci-dessus.</span>
      </div>`;
    return;
  }
  container.innerHTML = `<div class="note-list">
    ${notes.map(item => {
      const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : '—';
      const time = item.createdAt ? new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <div class="note-card client-note">
          <div class="note-card-header">
            <div class="note-card-author"><i class="fa-solid fa-user"></i> Vous</div>
            <div class="note-card-date"><i class="fa-regular fa-clock"></i> ${date}${time ? ' · ' + time : ''}</div>
          </div>
          <div class="note-card-content">${item.content || '—'}</div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function renderTeamNotes(notes) {
  const container = document.getElementById('site-detail-team-notes');
  if (!container) return;
  if (!notes.length) {
    container.innerHTML = '<p>Aucune note de l\'équipe pour le moment.</p>';
    return;
  }
  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:16px;">
    ${notes.map(item => {
      const date = item.createdAt ? new Date(item.createdAt).toLocaleString('fr-FR') : '—';
      return `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;">
          <div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px;"><i class="fa-solid fa-user"></i> ${item.createdByName || '—'} · ${date}</div>
          <div style="font-size:0.9rem;color:var(--text);line-height:1.5;">${item.content || '—'}</div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function openRenewal(site) {
  const domain = site.domain || '—';
  const status = getEffectiveSiteStatus(site);
  const statusClass = getSiteStatusClass(status);
  const expiration = site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—';
  const extension = getDomainExtension(domain);

  renewalTitle.textContent = 'Renouveler ' + domain;

  renewalContent.innerHTML = `
    <div class="renewal-header">
      <i class="fa-solid fa-globe"></i>
      <div>
        <div class="renewal-domain">${domain}</div>
        <div style="margin-top:6px;"><span class="site-status-badge ${statusClass}">${status}</span></div>
      </div>
    </div>

    <div class="renewal-info-grid">
      <div class="renewal-info-item">
        <div class="label">Date d'expiration</div>
        <div class="value">${expiration}</div>
      </div>
      <div class="renewal-info-item">
        <div class="label">Extension</div>
        <div class="value">${extension}</div>
      </div>
    </div>

    <div class="renewal-warning">
      Ne perdez pas votre nom de domaine, renouvelez-le avant son expiration pour éviter toute interruption de service.
    </div>

    <div class="renewal-card">
      <h2><i class="fa-solid fa-circle-question"></i> Pourquoi renouveler maintenant ?</h2>
      <div class="renewal-reason">
        <i class="fa-solid fa-shield-halved"></i>
        <p><strong>Éviter la perte de votre domaine :</strong> si votre domaine expire, il peut être racheté par quelqu'un d'autre.</p>
      </div>
      <div class="renewal-reason">
        <i class="fa-solid fa-server"></i>
        <p><strong>Continuité de vos services :</strong> votre site Web, vos emails et tous vos services resteront actifs sans interruption.</p>
      </div>
      <div class="renewal-reason">
        <i class="fa-solid fa-headset"></i>
        <p><strong>Support Karbonn. :</strong> Notre équipe reste à disposition pour vous accompagner.</p>
      </div>
    </div>
  `;

  showSection('section-renouveler');
}

function renderDomaines(sites) {
  if (!domainesListEl) return;
  clientSites = sites || [];
  if (!clientSites.length) {
    domainesListEl.innerHTML = `
      <div class="placeholder">
        <i class="fa-solid fa-globe fa-2x"></i>
        <p>Aucun nom de domaine associé à votre compte.</p>
      </div>`;
    return;
  }
  const statusColors = {
    'site-status-actif': '#10b981',
    'site-status-suspendu': '#f59e0b',
    'site-status-en-maintenance': '#6366f1',
    'site-status-expiré': '#ef4444',
    'site-status-bientôt-expiré': '#f97316',
    'site-status-en-attente': '#64748b'
  };

  domainesListEl.innerHTML = `<div class="domaines-grid">
    ${clientSites.map((site, index) => {
      const domain = typeof site === 'string' ? site : (site.domain || '—');
      const status = getEffectiveSiteStatus(typeof site === 'string' ? { domain: site } : site);
      const statusClass = getSiteStatusClass(status);
      const expiration = site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—';
      const extension = getDomainExtension(domain);
      const statusColor = statusColors[statusClass] || 'var(--primary)';
      return `
        <div class="domaine-card" data-site-index="${index}" style="--status-color: ${statusColor}">
          <div class="domaine-card-header">
            <div class="domaine-card-title">
              <i class="fa-solid fa-globe"></i>
              <span class="domaine-name">${domain}</span>
            </div>
            <span class="site-status-badge ${statusClass}">${status}</span>
          </div>
          <div class="domaine-card-body">
            <div class="domaine-meta">
              <span class="domaine-meta-item"><i class="fa-regular fa-calendar"></i> Expire le ${expiration}</span>
              <span class="domaine-meta-item"><i class="fa-solid fa-tag"></i> Extension ${extension}</span>
            </div>
          </div>
          <div class="domaine-card-footer">
            <button class="btn btn-manage" data-action="manage"><i class="fa-solid fa-sliders"></i> Gérer</button>
            <button class="btn btn-primary" data-action="renew"><i class="fa-solid fa-rotate"></i> Renouveler</button>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;

  domainesListEl.querySelectorAll('.domaine-card').forEach(card => {
    const index = parseInt(card.dataset.siteIndex, 10);
    const site = clientSites[index];
    card.querySelector('[data-action="manage"]').addEventListener('click', e => {
      e.stopPropagation();
      openSiteDetail(site);
    });
    card.querySelector('[data-action="renew"]').addEventListener('click', e => {
      e.stopPropagation();
      openRenewal(site);
    });
  });
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
