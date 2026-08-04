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

async function refreshSiteHistory(site) {
  if (!currentClient || !currentClient.id) return;
  console.log('[Client] Refreshing site history for site:', site.id);
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.clientId}/sites`);
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
    ${renderClientServicesTable(site)}
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

// ── Abonnements & Factures Stripe Billing ──

let stripeInstance = null;

function getStripePublicKey() {
  const el = document.getElementById('stripe-pub-key');
  return el ? (el.dataset.key || '') : '';
}

function getStripe() {
  if (!stripeInstance) {
    const key = getStripePublicKey();
    if (key && key.startsWith('pk_')) stripeInstance = Stripe(key);
  }
  return stripeInstance;
}

async function loadClientAbonnements() {
  if (!currentClient || !currentClient.id) return;

  // Load payment methods, subscriptions, invoices in parallel
  const subsList = document.getElementById('abo-subscriptions-list');
  const invTbody = document.getElementById('abo-invoices-tbody');
  const pmContainer = document.getElementById('abo-payment-methods');

  try {
    const [pmRes, subsRes, invRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/payment-methods`),
      fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/subscriptions`),
      fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/invoices`)
    ]);

    // Render payment methods
    if (pmRes.ok && pmContainer) {
      const pmData = await pmRes.json();
      const methods = pmData.paymentMethods || [];
      if (methods.length === 0) {
        pmContainer.innerHTML = `
          <div class="abo-no-payment">
            <i class="fa-solid fa-credit-card"></i>
            Aucun moyen de paiement enregistré.<br>Ajoutez une carte pour activer les prélèvements automatiques.
          </div>
          <button class="abo-add-card-btn" id="btn-show-add-card">
            <i class="fa-solid fa-plus"></i> Ajouter une carte
          </button>`;
        document.getElementById('btn-show-add-card')?.addEventListener('click', showSetupCardForm);
      } else {
        const brandIcons = { visa: 'fa-brands fa-cc-visa', mastercard: 'fa-brands fa-cc-mastercard', amex: 'fa-brands fa-cc-amex' };
        pmContainer.innerHTML = methods.map((pm, idx) => {
          const icon = brandIcons[pm.brand] || 'fa-solid fa-credit-card';
          const isDefault = idx === 0;
          const deleteBtn = methods.length > 1
            ? `<button class="abo-card-delete" data-pm-id="${pm.id}" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>`
            : '';
          return `<div class="abo-payment-card">
            <span class="card-icon"><i class="${icon}"></i></span>
            <div class="card-details">
              <div class="card-info">•••• •••• •••• ${pm.last4}${isDefault ? '<span class="card-default">Par défaut</span>' : ''}</div>
              <div class="card-exp">Expire ${String(pm.exp_month).padStart(2, '0')}/${pm.exp_year}</div>
            </div>
            ${deleteBtn}
          </div>`;
        }).join('') + `<button class="abo-add-card-btn" id="btn-show-add-card">
          <i class="fa-solid fa-plus"></i> Ajouter une carte
        </button>`;
        document.getElementById('btn-show-add-card')?.addEventListener('click', showSetupCardForm);
        // Attach delete listeners
        pmContainer.querySelectorAll('.abo-card-delete').forEach(btn => {
          btn.addEventListener('click', () => deletePaymentMethod(btn.dataset.pmId));
        });
      }
    }

    // Render subscriptions
    if (subsRes.ok) {
      const subsData = await subsRes.json();
      const subs = subsData.subscriptions || [];
      if (subs.length === 0) {
        subsList.innerHTML = '<p class="abo-empty">Aucun abonnement actif.</p>';
      } else {
        subsList.innerHTML = subs.map(sub => {
          const statusMap = { active: 'Actif', past_due: 'Impayé', canceled: 'Annulé', trialing: 'Essai' };
          const statusLabel = statusMap[sub.status] || sub.status;
          const statusClass = sub.status === 'active' ? 'abo-status-active' : sub.status === 'past_due' ? 'abo-status-past_due' : 'abo-status-canceled';
          const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toLocaleDateString('fr-FR') : '—';
          return `<div class="abo-card">
            <div class="abo-card-header">
              <span class="abo-card-title">Abonnement</span>
              <span class="abo-card-status ${statusClass}">${statusLabel}</span>
            </div>
            <div class="abo-card-items">
              ${sub.items.map(item => `<div class="abo-card-item">
                <span>${escapeHtml(item.description || '—')}</span>
                <span>${item.amount != null ? (item.amount / 100).toFixed(2) + ' €/' + (item.interval === 'year' ? 'an' : 'mois') : '—'}</span>
              </div>`).join('')}
            </div>
            <div style="margin-top:8px;font-size:0.75rem;color:var(--muted);">Prochaine échéance : ${periodEnd}</div>
          </div>`;
        }).join('');
      }
    }

    // Render invoices
    if (invRes.ok) {
      const invData = await invRes.json();
      const invoices = invData.invoices || [];
      if (invoices.length === 0) {
        invTbody.innerHTML = '<tr><td colspan="5" class="abo-empty">Aucune facture.</td></tr>';
      } else {
        invTbody.innerHTML = invoices.map(inv => {
          const date = inv.created ? new Date(inv.created * 1000).toLocaleDateString('fr-FR') : '—';
          const amount = inv.amount_due != null ? (inv.amount_due / 100).toFixed(2) + ' €' : '—';
          const statusMap = { paid: 'Payée', open: 'En attente', draft: 'Brouillon', uncollectible: 'Impayée', void: 'Annulée' };
          const statusLabel = statusMap[inv.status] || inv.status;
          const statusClass = inv.status === 'paid' ? 'abo-inv-paid' : inv.status === 'open' ? 'abo-inv-open' : 'abo-inv-failed';
          const actions = [];
          if (inv.hosted_invoice_url) actions.push(`<a href="${inv.hosted_invoice_url}" target="_blank" class="abo-inv-link"><i class="fa-solid fa-eye"></i></a>`);
          if (inv.invoice_pdf) actions.push(`<a href="${inv.invoice_pdf}" target="_blank" class="abo-inv-link"><i class="fa-solid fa-download"></i></a>`);
          return `<tr>
            <td>${escapeHtml(inv.number || '—')}</td>
            <td>${date}</td>
            <td>${amount}</td>
            <td><span class="abo-invoice-status ${statusClass}">${statusLabel}</span></td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>`;
        }).join('');
      }
    }
  } catch (err) {
    console.error('[Client] Error loading abonnements:', err);
    if (subsList) subsList.innerHTML = '<p class="abo-empty">Erreur de chargement.</p>';
    if (invTbody) invTbody.innerHTML = '<tr><td colspan="5" class="abo-empty">Erreur de chargement.</td></tr>';
  }
}

async function deletePaymentMethod(pmId) {
  if (!confirm('Supprimer cette carte ?')) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/payment-methods/${pmId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Erreur lors de la suppression.');
      return;
    }
    await loadClientAbonnements();
  } catch (err) {
    console.error('[Stripe] Delete PM error:', err);
    alert('Erreur réseau.');
  }
}

async function showSetupCardForm() {
  const container = document.getElementById('setup-card-container');
  const submitBtn = document.getElementById('setup-card-submit');
  const errorEl = document.getElementById('setup-card-error');
  if (!container || !submitBtn) return;

  container.style.display = 'block';
  submitBtn.disabled = true;
  if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

  const stripe = getStripe();
  if (!stripe) {
    if (errorEl) { errorEl.textContent = 'Stripe non disponible.'; errorEl.style.display = ''; }
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/create-setup-intent`, { method: 'POST' });
    if (!res.ok) throw new Error(await res.text());
    const { clientSecret } = await res.json();

    // Use Card Element (simpler, no sessions API needed)
    const elements = stripe.elements();
    const cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '15px',
          fontFamily: "'Space Grotesk', sans-serif",
          color: '#111',
          '::placeholder': { color: '#aab7c4' },
        },
        invalid: { color: '#dc2626' },
      },
    });
    const mountEl = document.getElementById('setup-card-element');
    mountEl.innerHTML = '';
    cardElement.mount(mountEl);

    cardElement.on('ready', () => { submitBtn.disabled = false; });

    // Remove old listener
    const newBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newBtn, submitBtn);
    newBtn.disabled = false;

    newBtn.addEventListener('click', async () => {
      newBtn.disabled = true;
      newBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enregistrement...';
      if (errorEl) errorEl.style.display = 'none';

      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: cardElement },
      });

      if (error) {
        if (errorEl) { errorEl.textContent = error.message; errorEl.style.display = ''; }
        newBtn.disabled = false;
        newBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Enregistrer la carte';
        return;
      }

      // Success — set as default payment method then reload
      try {
        await fetch(`${API_BASE_URL}/api/public/client/${currentClient.id}/set-default-payment-method`, { method: 'POST' });
      } catch (e) { console.warn('[Stripe] set-default-pm failed:', e); }
      container.style.display = 'none';
      await loadClientAbonnements();
    });
  } catch (err) {
    console.error('[Stripe] Setup card error:', err);
    if (errorEl) { errorEl.textContent = 'Erreur : ' + err.message; errorEl.style.display = ''; }
  }
}

function renderClientServicesTable(site) {
  const services = site.services || [];
  if (services.length === 0) return '';
  const rows = services.map(svc => {
    const startDate = svc.startDate ? new Date(svc.startDate).toLocaleDateString('fr-FR') : '—';
    const endDate = svc.endDate ? new Date(svc.endDate).toLocaleDateString('fr-FR') : '—';
    const price = svc.priceMonthly != null ? svc.priceMonthly.toFixed(2) + ' €' : '—';
    return `<tr>
      <td>${escapeHtml(svc.description || '—')}</td>
      <td>${price}/mois</td>
      <td>${startDate}</td>
      <td>${endDate}</td>
    </tr>`;
  }).join('');
  return `
    <div class="client-services-section" style="margin-top:24px;">
      <h2><i class="fa-solid fa-cubes"></i> Services associés</h2>
      <table class="client-services-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Prix mensuel</th>
            <th>Date de début</th>
            <th>Date d'échéance</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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

  // Auto-create Stripe customer on login
  try {
    await fetch(`${API_BASE_URL}/api/public/client/${client.id}/ensure-stripe-customer`, { method: 'POST' });
  } catch (e) { console.warn('[Client] Stripe customer ensure failed:', e); }

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
  'section-abonnements',
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

    if (sectionId === 'section-factures' && currentClient) loadClientDocuments();
    if (sectionId === 'section-abonnements' && currentClient) loadClientAbonnements();
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

