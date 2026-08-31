const API_BASE_URL = 'https://karbonn-x-abby.onrender.com';

const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const suspendedScreen = document.getElementById('suspended-screen');
const maintenanceScreen = document.getElementById('maintenance-screen');
const loginForm = document.getElementById('login-form');
const loginIdInput = document.getElementById('login-id');
const loginError = document.getElementById('login-error');
const clientNameEl = document.getElementById('client-name');
const clientBadgeEl = document.getElementById('client-badge');
const clientBadgeMobileEl = document.getElementById('client-badge-mobile');
const clientAvatarEl = document.getElementById('client-avatar');

let currentClient = null;
let clientSites = [];
let sitesPollingInterval = null;
let clientSpaceMaintenanceEnabled = false;

// Real-time listener for client-space maintenance mode
if (db && maintenanceScreen) {
  db.collection('settings').doc('maintenance').onSnapshot(doc => {
    const data = doc.exists ? doc.data() : {};
    clientSpaceMaintenanceEnabled = data.clientSpaceEnabled === true;
    if (clientSpaceMaintenanceEnabled) {
      loginScreen.classList.add('hidden');
      appContent.classList.add('hidden');
      if (suspendedScreen) suspendedScreen.classList.add('hidden');
      maintenanceScreen.classList.remove('hidden');
    } else {
      maintenanceScreen.classList.add('hidden');
      if (!currentClient) loginScreen.classList.remove('hidden');
    }
  }, err => console.warn('[Client] Failed to load maintenance settings:', err));
}

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
  const status = site.status || 'En attente';
  if (status === 'Suspendu' || status === 'En maintenance') return status;
  if (site.expirationDate) {
    const exp = new Date(site.expirationDate);
    const now = new Date();
    now.setHours(0,0,0,0);
    exp.setHours(23,59,59,999);
    if (exp < now) return 'Expiré';
    const daysUntil = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 30) return 'Bientôt expiré';
    return 'Actif';
  }
  return status;
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

  if (clientSpaceMaintenanceEnabled) {
    loginScreen.classList.add('hidden');
    if (maintenanceScreen) maintenanceScreen.classList.remove('hidden');
    return;
  }

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
    if (currentClient.blocked) {
      loginScreen.classList.add('hidden');
      suspendedScreen.classList.remove('hidden');
      return;
    }
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
const CARD_FEE_RATE = 0.015;
const BILLING_FEE_RATE = 0.007;
const FIXED_FEE_EUR = 0.25;

function addRenewalProcessingFees(amountTTC) {
  return Math.ceil((amountTTC + FIXED_FEE_EUR) / (1 - CARD_FEE_RATE - BILLING_FEE_RATE));
}

function getRenewalPlans(domain) {
  const ext = getDomainExtension(domain).toLowerCase();
  const htPerYear = EXTENSION_PRICES_HT[ext] !== undefined ? EXTENSION_PRICES_HT[ext] : DEFAULT_PRICE_HT;
  const years = 1;
  const ttc = Math.round(htPerYear * years * (1 + TVA_RATE) * 100) / 100;
  const total = addRenewalProcessingFees(ttc);
  const cents = total * 100;
  return [{ years, label: '1 an (renouvellement annuel)', price: total, cents, ttcDomain: ttc }];
}

function getStripePublicKey() {
  const el = document.getElementById('stripe-pub-key');
  return el ? (el.dataset.key || '') : '';
}

function hasStripeSubscription(site) {
  if (site.stripeSubscriptionStatus === 'active') return true;
  if (site.stripeSubscriptionStatus) return false;
  // Legacy fallback for sites without stored status
  return (site.renewals || []).some(r => r.subscriptionId);
}

async function refreshStripeSubscriptionStatus(site) {
  if (!site || !site.id) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/stripe-subscription-status`);
    if (!res.ok) return;
    const data = await res.json();
    site.stripeSubscriptionStatus = data.status || null;
  } catch (err) {
    console.warn('[Client] Failed to refresh subscription status:', err);
  }
}

function shouldShowRenewalForm(site) {
  if (hasStripeSubscription(site)) return false;
  if (!site.lastRenewalAt) return true;
  if (!site.expirationDate) return true;
  const exp = new Date(site.expirationDate);
  const now = new Date();
  const daysUntilExp = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  return daysUntilExp <= 15;
}

async function openRenewal(site) {
  await refreshStripeSubscriptionStatus(site);

  const domain = site.domain || '—';
  const status = getEffectiveSiteStatus(site);
  const statusClass = getSiteStatusClass(status);
  const expiration = site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—';
  const extension = getDomainExtension(domain);
  const monthlySubscriptionPrice = site.monthlySubscriptionPrice || 0;
  const monthlySubscriptionName = site.monthlySubscriptionName || 'Abonnement mensuel';
  const monthlyLabel = monthlySubscriptionPrice > 0 ? `${monthlySubscriptionName} — ${monthlySubscriptionPrice.toFixed(2)} € / mois` : 'Aucun';

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
      <div class="renewal-info-item">
        <div class="label">ABONNEMENT MENSUEL</div>
        <div class="value">${monthlyLabel}</div>
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
  if (!showForm && site.lastRenewalAt) {
    const renewDate = new Date(site.lastRenewalAt);
    const daysAgo = Math.floor((Date.now() - renewDate) / (1000 * 60 * 60 * 24));
    const renewDateStr = renewDate.toLocaleDateString('fr-FR');
    if (hasStripeSubscription(site)) {
      rightHtml = `
        <div class="renewal-already-box">
          <div class="already-icon"><i class="fa-solid fa-circle-check"></i></div>
          <h3>Renouvellement automatique activé</h3>
          <p>Ce domaine est en renouvellement automatique via Stripe Billing.</p>
          <p>Le prélèvement annuel aura lieu <strong>15 jours avant la date d'expiration</strong>.</p>
          <p style="margin-top:12px;font-size:0.8rem;">Aucune action n'est nécessaire de votre part. Pour modifier vos coordonnées bancaires, contactez <a href="mailto:hello@karbonn.fr">hello@karbonn.fr</a> ou appelez au <a href="tel:+33776691606">+33 7 76 69 16 06</a>.</p>
        </div>`;
    } else {
      rightHtml = `
        <div class="renewal-already-box">
          <div class="already-icon"><i class="fa-solid fa-circle-check"></i></div>
          <h3>Domaine déjà renouvelé</h3>
          <p>Ce domaine a été renouvelé le <strong>${renewDateStr}</strong><br>Il y a <strong>${daysAgo} jour${daysAgo !== 1 ? 's' : ''}</strong>.</p>
          <p style="margin-top:12px;font-size:0.8rem;">Le formulaire de renouvellement sera réactivé 15 jours avant l'expiration.</p>
        </div>`;
    }
  } else {
    rightHtml = `
      <h2><i class="fa-solid fa-rotate"></i> Renouveler ce domaine</h2>
      <div class="renewal-plans">
        ${plans.map((p, i) => `
          <button class="renewal-plan-btn${i === 0 ? ' selected' : ''}" data-years="${p.years}" data-cents="${p.cents}" data-price="${p.price}">
            <span class="plan-years">1 an (renouvellement annuel pour ${escapeHtml(domain)})${monthlySubscriptionPrice > 0 ? ` + abonnement ${escapeHtml(monthlySubscriptionName)} à ${monthlySubscriptionPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/mois` : ''}</span>
            <span class="plan-price">${p.price.toFixed(2)} €</span>
            <span class="plan-breakdown">dont ${p.ttcDomain.toFixed(2)} € TTC</span>
          </button>`).join('')}
      </div>
      <div class="renewal-price-note"><i class="fa-solid fa-circle-info"></i> Prix TTC + frais Stripe inclus. Abonnement annuel renouvelé automatiquement chaque année pour une année.</div>
      <div id="renewal-stripe-element" class="renewal-stripe-element">
        <div class="renewal-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement du formulaire...</div>
      </div>
      <button id="renewal-pay-btn" class="renewal-pay-btn" disabled>
        <i class="fa-solid fa-lock"></i> Payer ${(firstPlan.price + monthlySubscriptionPrice).toFixed(2)} €
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
let currentSubscriptionId = null;

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
    const res = await fetch(`${API_BASE_URL}/api/public/sites/${site.id}/create-renewal-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ years })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    currentSubscriptionId = data.subscriptionId;

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
        subscriptionId: currentSubscriptionId,
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
          <p style="margin-top:8px;">Un abonnement annuel a été créé. Renouvelé le <strong>${renewDateStr}</strong>.</p>
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
  renderDashboard();
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

// ── Mes projets ──
const projetsListEl = document.getElementById('projets-list');

function shortStepLabel(name) {
  return (name || '').replace(/^\d+\s*-\s*/, '');
}

function renderProjetTimeline(projet) {
  const total = projet.steps.length;
  return projet.steps.map((step, index) => {
    const done = index < projet.currentStepIndex;
    const active = index === projet.currentStepIndex;
    const cls = done ? 'done' : (active ? 'active' : '');
    const connector = index < total - 1 ? `<div class="projet-timeline-connector"></div>` : '';
    return `
      <div class="projet-timeline-step ${cls}">
        ${connector}
        <div class="projet-timeline-dot">${done ? '<i class="fa-solid fa-check"></i>' : index + 1}</div>
        <div class="projet-timeline-label">${escapeHtml(shortStepLabel(step.name))}</div>
      </div>`;
  }).join('');
}

function renderProjetCard(projet) {
  const isDelivered = projet.currentStepIndex >= projet.steps.length;
  const statusText = isDelivered
    ? 'Votre projet est terminé et livré 🎉'
    : `Étape en cours : ${shortStepLabel(projet.steps[projet.currentStepIndex]?.name || '')}`;

  return `
    <div class="projet-card">
      <div class="projet-card-header">
        <div>
          <div class="projet-card-title">${escapeHtml(projet.nom)}</div>
          ${projet.dateLivraison ? `<div class="projet-card-sub">Livraison prévue : ${new Date(projet.dateLivraison).toLocaleDateString('fr-FR')}</div>` : ''}
        </div>
        ${projet.previewUrl ? `<a class="projet-preview-link" href="${escapeHtml(projet.previewUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Voir mon site</a>` : ''}
      </div>
      <div class="projet-timeline">
        ${renderProjetTimeline(projet)}
      </div>
      <div class="projet-status-banner">
        <i class="fa-solid ${isDelivered ? 'fa-circle-check' : 'fa-hourglass-half'}"></i>
        <span>${statusText}</span>
      </div>
    </div>`;
}

function renderProjets(projets) {
  if (!projetsListEl) return;
  if (!projets.length) {
    projetsListEl.innerHTML = `
      <div class="placeholder">
        <i class="fa-solid fa-diagram-project fa-2x"></i>
        <p>Aucun projet en cours pour le moment.</p>
      </div>`;
    return;
  }
  projetsListEl.innerHTML = `<div class="projets-grid">${projets.map(renderProjetCard).join('')}</div>`;
}

async function loadClientProjets() {
  if (!currentClient || !currentClient.id) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.clientId}/projets`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderProjets(data.projets || []);
  } catch (err) {
    console.warn('[Client] Failed to load projets:', err);
  }
}

// ── Dashboard (Accueil) ──
function navigateToSection(label) {
  const target = Array.from(navItems).find(i => i.dataset.label === label);
  if (target) target.click();
}

function renderDashboard() {
  const statsEl = document.getElementById('dashboard-stats');
  const actionsEl = document.getElementById('dashboard-actions');
  if (!statsEl || !actionsEl) return;

  const sitesNeedingRenewal = clientSites.filter(site => {
    const status = getEffectiveSiteStatus(site);
    return status === 'Expiré' || status === 'Bientôt expiré';
  });
  const unpaidInvoices = clientDocuments.filter(d => d.type === 'invoice' && d.status === 'unpaid');
  const pendingQuotes = clientDocuments.filter(d => d.type === 'quote' && d.status === 'pending_approval');

  const stats = [
    { icon: 'fa-globe', value: clientSites.length, label: clientSites.length > 1 ? 'Domaines actifs' : 'Domaine actif', variant: '' },
    { icon: 'fa-triangle-exclamation', value: sitesNeedingRenewal.length, label: 'À renouveler', variant: sitesNeedingRenewal.length ? 'danger' : '' },
    { icon: 'fa-file-invoice-dollar', value: unpaidInvoices.length, label: 'Factures non payées', variant: unpaidInvoices.length ? 'alert' : '' },
    { icon: 'fa-file-contract', value: pendingQuotes.length, label: 'Devis en attente', variant: pendingQuotes.length ? 'alert' : '' }
  ];

  statsEl.innerHTML = stats.map(s => `
    <div class="dashboard-stat-card ${s.variant}">
      <div class="dashboard-stat-icon"><i class="fa-solid ${s.icon}"></i></div>
      <div>
        <div class="dashboard-stat-value">${s.value}</div>
        <div class="dashboard-stat-label">${s.label}</div>
      </div>
    </div>
  `).join('');

  const actions = [];
  sitesNeedingRenewal.forEach(site => {
    actions.push({
      icon: 'fa-globe',
      title: site.domain || '—',
      desc: getEffectiveSiteStatus(site) === 'Expiré' ? 'Domaine expiré' : 'Expire bientôt',
      btnLabel: 'Renouveler',
      onClick: () => openRenewal(site)
    });
  });
  unpaidInvoices.forEach(doc => {
    actions.push({
      icon: 'fa-file-invoice-dollar',
      title: doc.number || 'Facture',
      desc: `${formatAmount(doc.total_amount, doc.currency)} à régler`,
      btnLabel: 'Voir',
      onClick: () => navigateToSection('Mes factures & Devis')
    });
  });
  pendingQuotes.forEach(doc => {
    actions.push({
      icon: 'fa-file-contract',
      title: doc.number || 'Devis',
      desc: 'En attente de votre validation',
      btnLabel: 'Voir',
      onClick: () => navigateToSection('Mes factures & Devis')
    });
  });

  if (!actions.length) {
    actionsEl.innerHTML = `
      <div class="dashboard-empty-state">
        <i class="fa-solid fa-circle-check"></i>
        <p>Tout est à jour, rien à signaler.</p>
      </div>`;
    return;
  }

  actionsEl.innerHTML = actions.map((a, i) => `
    <div class="dashboard-action-row">
      <div class="dashboard-action-icon"><i class="fa-solid ${a.icon}"></i></div>
      <div class="dashboard-action-content">
        <div class="dashboard-action-title">${escapeHtml(a.title)}</div>
        <div class="dashboard-action-desc">${escapeHtml(a.desc)}</div>
      </div>
      <button class="dashboard-action-btn" data-action-index="${i}">${a.btnLabel}</button>
    </div>
  `).join('');

  actionsEl.querySelectorAll('[data-action-index]').forEach(btn => {
    const action = actions[parseInt(btn.dataset.actionIndex, 10)];
    if (action) btn.addEventListener('click', action.onClick);
  });
}

document.querySelectorAll('.dashboard-quick-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigateToSection(link.dataset.quickNav);
  });
});

async function showApp(client) {
  loginScreen.classList.add('hidden');
  appContent.classList.remove('hidden');

  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client';
  if (clientNameEl) clientNameEl.textContent = name;
  if (clientBadgeEl) clientBadgeEl.textContent = client.clientId;
  if (clientBadgeMobileEl) clientBadgeMobileEl.textContent = client.clientId;
  if (clientAvatarEl) {
    const initials = [client.prenom, client.nom].filter(Boolean).map(s => s[0]).join('').toUpperCase() || 'K';
    clientAvatarEl.textContent = initials.slice(0, 2);
  }
  const greetingEl = document.getElementById('dashboard-greeting');
  if (greetingEl) greetingEl.textContent = `Bonjour ${client.prenom || name} 👋`;

  await Promise.all([loadSites(), loadClientDocuments(), loadClientProjets()]);

  if (sitesPollingInterval) clearInterval(sitesPollingInterval);
  sitesPollingInterval = setInterval(() => { loadSites(); }, 30000);
}

function logout() {
  setMobileMenu(false);
  if (sitesPollingInterval) { clearInterval(sitesPollingInterval); sitesPollingInterval = null; }
  currentClient = null;
  loginScreen.classList.remove('hidden');
  appContent.classList.add('hidden');
  if (suspendedScreen) suspendedScreen.classList.add('hidden');
  loginIdInput.value = '';
  loginError.textContent = '';
  if (clientNameEl) clientNameEl.textContent = '';
  if (clientBadgeEl) clientBadgeEl.textContent = '';
  if (clientBadgeMobileEl) clientBadgeMobileEl.textContent = '';
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector('.nav-item[data-label="Accueil"]')?.classList.add('active');
  document.querySelectorAll('.section-page').forEach(s => s.classList.remove('active'));
  document.getElementById('section-accueil')?.classList.add('active');
}

document.getElementById('logout-btn').addEventListener('click', logout);

const navLogout = document.getElementById('nav-logout');
if (navLogout) navLogout.addEventListener('click', e => { e.preventDefault(); logout(); });

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section-page');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const clientSidebar = document.getElementById('client-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

function setMobileMenu(open) {
  if (!mobileMenuBtn || !clientSidebar || !sidebarBackdrop) return;
  clientSidebar.classList.toggle('is-open', open);
  sidebarBackdrop.classList.toggle('is-visible', open);
  mobileMenuBtn.setAttribute('aria-expanded', String(open));
  mobileMenuBtn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  mobileMenuBtn.querySelector('i')?.classList.toggle('fa-bars', !open);
  mobileMenuBtn.querySelector('i')?.classList.toggle('fa-xmark', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => setMobileMenu(!clientSidebar.classList.contains('is-open')));
}
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => setMobileMenu(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setMobileMenu(false);
});
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) setMobileMenu(false);
});

const sectionMap = [
  'section-accueil',
  'section-domaines',
  'section-projets',
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
    setMobileMenu(false);

    if (sectionId === 'section-factures' && currentClient) loadClientDocuments();
    if (sectionId === 'section-projets' && currentClient) loadClientProjets();
    if (sectionId === 'section-accueil') renderDashboard();
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

// ── Client documents (factures & devis) ──
let clientDocuments = [];

const quotesList = document.getElementById('quotes-list');
const invoicesList = document.getElementById('invoices-list');
const quotesCount = document.getElementById('quotes-count');
const invoicesCount = document.getElementById('invoices-count');
const bankIbanEl = document.getElementById('bank-iban');
const bankDetailsEl = document.getElementById('bank-details');

const STATUS_LABELS = {
  paid: 'Payée',
  unpaid: 'Non payée',
  draft: 'Brouillon',
  canceled: 'Annulée',
  pending_approval: 'En attente',
  approved: 'Approuvé'
};

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatAmount(amount, currency = 'EUR') {
  if (amount === undefined || amount === null) return '—';
  const value = Number(amount);
  if (isNaN(value)) return String(amount);
  return value.toLocaleString('fr-FR', { style: 'currency', currency }) + ' TTC';
}

function getDocumentStatusClass(status) {
  const key = (status || '').toLowerCase().replace(/\s+/g, '-');
  return `document-status-${key}`;
}

function renderDocumentCard(doc) {
  const statusLabel = STATUS_LABELS[doc.status] || (doc.status || '—');
  const downloadUrl = doc.attachment_id
    ? `${API_BASE_URL}/api/public/client/${currentClient.clientId}/documents/${doc.attachment_id}/download`
    : '';
  const viewUrl = doc.type === 'invoice' ? doc.invoice_url : doc.quote_url;
  return `
    <div class="document-card">
      <div class="document-card-header">
        <div>
          <p class="document-card-title">${escapeHtml(doc.number || 'Document sans numéro')}</p>
          <div class="document-card-meta">
            <span><i class="fa-regular fa-calendar"></i> ${formatDate(doc.issue_date || doc.created_at)}</span>
            <span><i class="fa-solid fa-euro-sign"></i> ${formatAmount(doc.total_amount, doc.currency)}</span>
          </div>
        </div>
        <span class="document-card-status ${getDocumentStatusClass(doc.status)}">${statusLabel}</span>
      </div>
      <div class="document-card-actions">
        ${downloadUrl ? `<a class="btn-doc-download" href="${downloadUrl}" target="_blank" download><i class="fa-solid fa-download"></i> Télécharger</a>` : ''}
        ${viewUrl ? `<a class="btn-doc-view" href="${viewUrl}" target="_blank"><i class="fa-solid fa-eye"></i> Voir</a>` : ''}
      </div>
    </div>
  `;
}

function renderDocuments() {
  if (!quotesList || !invoicesList) return;
  renderDashboard();
  const quotes = clientDocuments.filter(d => d.type === 'quote');
  const invoices = clientDocuments.filter(d => d.type === 'invoice');
  if (quotesCount) quotesCount.textContent = quotes.length;
  if (invoicesCount) invoicesCount.textContent = invoices.length;
  quotesList.innerHTML = quotes.length ? quotes.map(renderDocumentCard).join('') : '<div class="documents-empty">Aucun devis.</div>';
  invoicesList.innerHTML = invoices.length ? invoices.map(renderDocumentCard).join('') : '<div class="documents-empty">Aucune facture.</div>';
}

async function loadClientDocuments() {
  if (!currentClient || !currentClient.clientId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.clientId}/documents`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    clientDocuments = data.documents || [];
    if (bankIbanEl) bankIbanEl.textContent = data.iban || '—';
    if (bankDetailsEl) bankDetailsEl.style.display = data.iban ? 'flex' : 'none';
    renderDocuments();
  } catch (err) {
    console.error('[Client] Error loading documents:', err);
    if (quotesList) quotesList.innerHTML = '<div class="documents-empty">Erreur lors du chargement des documents.</div>';
    if (invoicesList) invoicesList.innerHTML = '<div class="documents-empty">Erreur lors du chargement des documents.</div>';
    if (bankDetailsEl) bankDetailsEl.style.display = 'none';
  }
}

