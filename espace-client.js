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
let sitesPollingInterval = null;

const SITE_STATUSES = ['Actif','Suspendu','En maintenance','Expiré','En attente'];

function getSiteStatusClass(status) {
  const key = (status || 'En attente').toLowerCase().replace(/\s+/g, '-');
  return `site-status-${key}`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

async function refreshSiteHistory(site) {
  if (!currentClient || !currentClient.id) return;
  console.log('[Client] Refreshing site history for site:', site.id);
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/sites`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    console.log('[Client] Public API returned', (data.sites || []).length, 'sites');
    const refreshed = (data.sites || []).find(s => s.id === site.id);
    if (refreshed && refreshed.history) {
      console.log('[Client] Refreshed history:', refreshed.history.map(h => ({ id: h.id, status: h.status, content: h.content?.slice(0, 30) })));
      site.history = refreshed.history;
    } else {
      console.warn('[Client] Site not found or no history in API response:', site.id);
    }
  } catch (err) {
    console.warn('[Client] Failed to refresh site history:', err);
  }
}

async function openSiteDetail(site) {
  await refreshSiteHistory(site);

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

  renderClientNotes(site, clientNotes);
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
      renderClientNotes(site, clientNotes);
    }
  } catch (err) {
    console.warn('[Client] Failed to submit note:', err);
    message.textContent = 'Erreur lors de l\'envoi de la note.';
    message.style.color = '#dc2626';
  }
}

function getNoteStatusBadge(status) {
  const map = {
    pending: { label: 'En attente d\'approbation', class: 'note-status-pending' },
    accepted: { label: 'Acceptée', class: 'note-status-accepted' },
    rejected: { label: 'Refusée', class: 'note-status-rejected' }
  };
  return map[status] || map.pending;
}

function renderClientNotes(site, notes) {
  console.log('[Client] renderClientNotes called with', notes.length, 'notes. Statuses:', notes.map(n => n.status));
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
      const status = getNoteStatusBadge(item.status);
      const isPending = !item.status || item.status === 'pending';
      return `
        <div class="note-card client-note" data-note-id="${item.id}">
          <div class="note-card-header">
            <div class="note-card-author"><i class="fa-solid fa-user"></i> Vous</div>
            <div class="note-card-meta">
              <span class="note-status-badge ${status.class}">${status.label}</span>
              <span class="note-card-date"><i class="fa-regular fa-clock"></i> ${date}${time ? ' · ' + time : ''}</span>
            </div>
          </div>
          <div class="note-card-content">${escapeHtml(item.content || '—')}</div>
          <div class="note-edit-area" style="display:none;">
            <textarea class="note-edit-textarea" rows="3"></textarea>
            <div class="note-edit-actions">
              <button class="note-save-btn"><i class="fa-solid fa-check"></i> Enregistrer</button>
              <button class="note-cancel-btn"><i class="fa-solid fa-xmark"></i> Annuler</button>
            </div>
          </div>
          ${isPending ? `
          <div class="note-card-actions">
            <button class="note-action-edit"><i class="fa-solid fa-pencil"></i> Modifier</button>
            <button class="note-action-delete"><i class="fa-solid fa-trash"></i> Supprimer</button>
          </div>` : ''}
        </div>
      `;
    }).join('')}
  </div>`;

  container.querySelectorAll('.note-card').forEach(card => {
    const noteId = card.dataset.noteId;
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const editBtn = card.querySelector('.note-action-edit');
    const deleteBtn = card.querySelector('.note-action-delete');
    const saveBtn = card.querySelector('.note-save-btn');
    const cancelBtn = card.querySelector('.note-cancel-btn');
    const contentEl = card.querySelector('.note-card-content');
    const editArea = card.querySelector('.note-edit-area');
    const textarea = card.querySelector('.note-edit-textarea');

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        textarea.value = note.content || '';
        contentEl.style.display = 'none';
        editArea.style.display = '';
        editBtn.style.display = 'none';
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        contentEl.style.display = '';
        editArea.style.display = 'none';
        if (editBtn) editBtn.style.display = '';
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveSiteNoteEdit(site, note, textarea.value.trim(), card);
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (window.confirm('Supprimer cette remarque ?')) {
          await deleteSiteNote(site, note, card);
        }
      });
    }
  });
}

async function saveSiteNoteEdit(site, note, newContent, cardEl) {
  if (!newContent) return;
  const message = document.getElementById('site-note-message');
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent })
    });
    if (!res.ok) throw new Error(await res.text());
    note.content = newContent;
    cardEl.querySelector('.note-card-content').textContent = newContent;
    cardEl.querySelector('.note-card-content').style.display = '';
    cardEl.querySelector('.note-edit-area').style.display = 'none';
    const editBtn = cardEl.querySelector('.note-action-edit');
    if (editBtn) editBtn.style.display = '';
    if (message) { message.textContent = 'Remarque mise à jour.'; message.style.color = '#059669'; }
  } catch (err) {
    console.warn('[Client] Failed to edit note:', err);
    if (message) { message.textContent = 'Erreur lors de la modification.'; message.style.color = '#dc2626'; }
  }
}

async function deleteSiteNote(site, note, cardEl) {
  const message = document.getElementById('site-note-message');
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/notes/${note.id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(await res.text());
    site.history = (site.history || []).filter(n => n.id !== note.id);
    renderClientNotes(site.history.filter(i => i.type === 'note' && i.createdByName === 'Espace Client'));
    if (message) { message.textContent = 'Remarque supprimée.'; message.style.color = '#059669'; }
  } catch (err) {
    console.warn('[Client] Failed to delete note:', err);
    if (message) { message.textContent = 'Erreur lors de la suppression.'; message.style.color = '#dc2626'; }
  }
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

const EXTENSION_PRICES_HT = {
  '.com': 13.49,
  '.fr':   7.79
};
const DEFAULT_PRICE_HT = 10.00;
const TVA_RATE = 0.20;
const STRIPE_RATE = 0.015;
const STRIPE_FIXED = 0.25;

function addStripeFeesToPrice(amountTTC) {
  return Math.ceil((amountTTC + STRIPE_FIXED) / (1 - STRIPE_RATE));
}

function getRenewalPlans(domain) {
  const ext = getDomainExtension(domain).toLowerCase();
  const htPerYear = EXTENSION_PRICES_HT[ext] !== undefined ? EXTENSION_PRICES_HT[ext] : DEFAULT_PRICE_HT;
  return [1, 2, 5].map(years => {
    const ttc = Math.round(htPerYear * years * (1 + TVA_RATE) * 100) / 100;
    const total = addStripeFeesToPrice(ttc);
    const cents = total * 100;
    return { years, label: years === 1 ? '1 an' : `${years} ans`, price: total, cents, ttcDomain: ttc };
  });
}

function getStripePublicKey() {
  const el = document.getElementById('stripe-pub-key');
  return el ? (el.dataset.key || '') : '';
}

function shouldShowRenewalForm(site) {
  if (!site.lastRenewalAt) return true;
  if (!site.expirationDate) return true;
  const exp = new Date(site.expirationDate);
  const now = new Date();
  const daysUntilExp = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  return daysUntilExp <= 90;
}

function openRenewal(site) {
  const domain = site.domain || '—';
  const status = getEffectiveSiteStatus(site);
  const statusClass = getSiteStatusClass(status);
  const expiration = site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—';
  const extension = getDomainExtension(domain);

  renewalTitle.textContent = 'Renouveler ' + domain;

  const leftHtml = `
    <div class="renewal-header">
      <i class="fa-solid fa-globe"></i>
      <div>
        <div class="renewal-domain">${domain}</div>
        <div style="margin-top:6px;"><span class="site-status-badge ${statusClass}">${status}</span></div>
      </div>
    </div>
    <div class="renewal-info-grid">
      <div class="renewal-info-item">
        <div class="label">DATE D'EXPIRATION</div>
        <div class="value">${expiration}</div>
      </div>
      <div class="renewal-info-item">
        <div class="label">EXTENSION</div>
        <div class="value">${extension}</div>
      </div>
    </div>
    <div class="renewal-warning">
      Ne perdez pas votre nom de domaine, renouvelez-le avant son expiration pour éviter toute interruption de service.
    </div>
    <div class="renewal-card">
      <p class="renewal-why-title">Pourquoi renouveler maintenant ?</p>
      <div class="renewal-why-grid">
        <div class="renewal-why-item">
          <div class="renewal-why-icon" style="background:rgba(239,68,68,0.1);color:#ef4444;">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <p class="renewal-why-label">Évitez la perte de votre domaine</p>
            <p class="renewal-why-desc">Un domaine expiré peut être racheté par n'importe qui en quelques heures.</p>
          </div>
        </div>
        <div class="renewal-why-item">
          <div class="renewal-why-icon" style="background:rgba(99,102,241,0.1);color:#6366f1;">
            <i class="fa-solid fa-server"></i>
          </div>
          <div>
            <p class="renewal-why-label">Continuité de vos services</p>
            <p class="renewal-why-desc">Site Web, emails et services restent actifs sans la moindre interruption.</p>
          </div>
        </div>
        <div class="renewal-why-item">
          <div class="renewal-why-icon" style="background:rgba(16,185,129,0.1);color:#10b981;">
            <i class="fa-solid fa-headset"></i>
          </div>
          <div>
            <p class="renewal-why-label">Support Karbonn.</p>
            <p class="renewal-why-desc">Notre équipe reste à votre disposition à chaque étape.</p>
          </div>
        </div>
      </div>
    </div>`;

  const showForm = shouldShowRenewalForm(site);
  const plans = getRenewalPlans(domain);
  const firstPlan = plans[0];
  let rightHtml;
  if (!showForm) {
    const daysUntilExp = site.expirationDate
      ? Math.ceil((new Date(site.expirationDate) - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    const daysUntilRenewal = daysUntilExp !== null ? Math.max(0, daysUntilExp - 90) : null;
    let renewalMsg = daysUntilRenewal !== null
      ? `Renouvellement possible dans <strong>${daysUntilRenewal} jour${daysUntilRenewal !== 1 ? 's' : ''}</strong>.`
      : `Le formulaire de renouvellement sera réactivé 90 jours avant l'expiration.`;
    let lastRenewalMsg = '';
    if (site.lastRenewalAt) {
      const renewDate = new Date(site.lastRenewalAt);
      const daysAgo = Math.floor((Date.now() - renewDate) / (1000 * 60 * 60 * 24));
      const renewDateStr = renewDate.toLocaleDateString('fr-FR');
      lastRenewalMsg = `<p style="margin-top:10px;">Dernier renouvellement le <strong>${renewDateStr}</strong> — il y a <strong>${daysAgo} jour${daysAgo !== 1 ? 's' : ''}</strong>.</p>`;
    }
    rightHtml = `
      <div class="renewal-already-box">
        <div class="already-icon"><i class="fa-solid fa-circle-check"></i></div>
        <h3>Domaine actif</h3>
        <p>${renewalMsg}</p>
        ${lastRenewalMsg}
      </div>`;
  } else {
    rightHtml = `
      <h2><i class="fa-solid fa-rotate"></i> Renouveler ce domaine</h2>
      <div class="renewal-plans">
        ${plans.map((p, i) => `
          <button class="renewal-plan-btn${i === 0 ? ' selected' : ''}" data-years="${p.years}" data-cents="${p.cents}" data-price="${p.price}">
            <span class="plan-years">${p.label}</span>
            <span class="plan-price">${p.price.toFixed(2)} €</span>
            <span class="plan-breakdown">dont ${p.ttcDomain.toFixed(2)} € TTC</span>
          </button>`).join('')}
      </div>
      <div class="renewal-price-note"><i class="fa-solid fa-circle-info"></i> Prix TTC + frais de traitement Stripe inclus</div>
      <div id="renewal-stripe-element" class="renewal-stripe-element">
        <div class="renewal-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement du formulaire...</div>
      </div>
      <button id="renewal-pay-btn" class="renewal-pay-btn" disabled>
        <i class="fa-solid fa-lock"></i> Payer ${firstPlan.price.toFixed(2)} €
      </button>
      <div id="renewal-pay-error" class="renewal-pay-error"></div>`;
  }

  renewalContent.innerHTML = `
    <div class="renewal-layout">
      <div class="renewal-left">${leftHtml}</div>
      <div class="renewal-right">${rightHtml}</div>
    </div>`;

  if (showForm) {
    initStripePaymentElement(site);
  }

  showSection('section-renouveler');
}

let stripeInstance = null;
let stripeElements = null;
let currentPaymentElement = null;
let currentRenewalYears = 1;
let currentPaymentIntentId = null;

async function initStripePaymentElement(site) {
  const pubKey = getStripePublicKey();
  if (!pubKey || !pubKey.startsWith('pk_')) {
    document.getElementById('renewal-stripe-element').innerHTML =
      '<p style="color:#dc2626;font-size:0.85rem;">Clé Stripe non configurée.</p>';
    return;
  }
  if (!stripeInstance) stripeInstance = Stripe(pubKey);

  const plans = getRenewalPlans(site.domain || '');
  currentRenewalYears = 1;
  await loadPaymentElement(site, 1, plans[0].cents);

  document.querySelectorAll('.renewal-plan-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.renewal-plan-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentRenewalYears = parseInt(btn.dataset.years, 10);
      const price = parseFloat(btn.dataset.price);
      const cents = parseInt(btn.dataset.cents, 10);
      const payBtn = document.getElementById('renewal-pay-btn');
      if (payBtn) payBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Payer ${price.toFixed(2)} €`;
      await loadPaymentElement(site, currentRenewalYears, cents);
    });
  });

  const payBtn = document.getElementById('renewal-pay-btn');
  if (payBtn) {
    payBtn.addEventListener('click', async () => {
      await submitRenewalPayment(site);
    });
  }
}

async function loadPaymentElement(site, years, cents) {
  const container = document.getElementById('renewal-stripe-element');
  if (!container) return;
  container.innerHTML = '<div class="renewal-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement...</div>';
  const payBtn = document.getElementById('renewal-pay-btn');
  if (payBtn) payBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ years, amount: cents })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    currentPaymentIntentId = data.paymentIntentId;

    stripeElements = stripeInstance.elements({ clientSecret: data.clientSecret, appearance: { theme: 'stripe' } });
    currentPaymentElement = stripeElements.create('payment');
    container.innerHTML = '';
    currentPaymentElement.mount(container);
    currentPaymentElement.on('ready', () => {
      if (payBtn) {
        payBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Payer ${data.amount / 100} €`;
        payBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error('[Stripe] loadPaymentElement error:', err);
    container.innerHTML = `<p style="color:#dc2626;font-size:0.85rem;">Erreur : ${err.message}</p>`;
  }
}

async function submitRenewalPayment(site) {
  const payBtn = document.getElementById('renewal-pay-btn');
  const errEl = document.getElementById('renewal-pay-error');
  if (!stripeInstance || !stripeElements) return;

  payBtn.disabled = true;
  payBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Traitement...';
  if (errEl) errEl.style.display = 'none';

  const { error } = await stripeInstance.confirmPayment({
    elements: stripeElements,
    confirmParams: { return_url: window.location.href },
    redirect: 'if_required'
  });

  if (error) {
    console.error('[Stripe] confirmPayment error:', error);
    if (errEl) { errEl.textContent = error.message; errEl.style.display = ''; }
    payBtn.disabled = false;
    payBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Réessayer`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/confirm-renewal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId: currentPaymentIntentId,
        years: currentRenewalYears,
        clientName: currentClient ? (currentClient.name || '') : '',
        clientId: currentClient ? (currentClient.id || '') : ''
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    const renewDate = new Date(data.renewal.paidAt);
    const renewDateStr = renewDate.toLocaleDateString('fr-FR');
    site.lastRenewalAt = data.renewal.paidAt;

    if (data.renewal.newExpirationDate) {
      site.expirationDate = data.renewal.newExpirationDate;
      site.status = 'Actif';
      const newExpStr = new Date(data.renewal.newExpirationDate).toLocaleDateString('fr-FR');
      const expValEl = renewalContent.querySelector('.renewal-info-item .value');
      if (expValEl) expValEl.textContent = newExpStr;
      const statusBadgeEl = renewalContent.querySelector('.site-status-badge');
      if (statusBadgeEl) {
        statusBadgeEl.textContent = 'Actif';
        statusBadgeEl.className = `site-status-badge ${getSiteStatusClass('Actif')}`;
      }
    }

    const newExpDisplay = data.renewal.newExpirationDate
      ? new Date(data.renewal.newExpirationDate).toLocaleDateString('fr-FR')
      : '—';

    const rightEl = renewalContent.querySelector('.renewal-right');
    if (rightEl) {
      rightEl.innerHTML = `
        <div class="renewal-success-box">
          <div class="success-icon"><i class="fa-solid fa-circle-check"></i></div>
          <h3>Paiement réussi !</h3>
          <p>Votre domaine <strong>${site.domain}</strong> a été renouvelé pour <strong>${currentRenewalYears} an${currentRenewalYears > 1 ? 's' : ''}</strong>.</p>
          <p style="margin-top:8px;">Renouvelé le <strong>${renewDateStr}</strong>.</p>
          <p style="margin-top:4px;">Nouvelle date d'expiration : <strong>${newExpDisplay}</strong>.</p>
        </div>`;
    }

    await loadSites();
  } catch (err) {
    console.error('[Stripe] confirm-renewal error:', err);
    if (errEl) { errEl.textContent = 'Paiement reçu mais erreur d\'enregistrement : ' + err.message; errEl.style.display = ''; }
    payBtn.disabled = false;
    payBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Réessayer';
  }
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

async function loadSites() {
  if (!currentClient) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.clientId}/sites`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderDomaines(data.sites || []);
  } catch (err) {
    console.warn('[Client] Failed to load sites:', err);
  }
}

async function showApp(client) {
  loginScreen.classList.add('hidden');
  appContent.classList.remove('hidden');

  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client';
  if (clientNameEl) clientNameEl.textContent = name;
  if (clientBadgeEl) clientBadgeEl.textContent = client.clientId;

  await loadSites();

  if (sitesPollingInterval) clearInterval(sitesPollingInterval);
  sitesPollingInterval = setInterval(() => { loadSites(); }, 30000);
}

function logout() {
  if (sitesPollingInterval) { clearInterval(sitesPollingInterval); sitesPollingInterval = null; }
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
