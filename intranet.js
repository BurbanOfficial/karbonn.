const loginScreen = document.getElementById('login-screen');
const appContent = document.getElementById('app-content');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userAvatarEl = document.getElementById('user-avatar');

let currentUserProfile = null;
let currentUserRole = null;

// Backend API configuration (Render)
const API_BASE_URL = 'https://karbonn-x-abby.onrender.com';

async function apiRequest(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non authentifié');
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Erreur API');
    error.details = data.details || data;
    error.status = response.status;
    throw error;
  }
  return data;
}

function showApp(user, profile) {
  loginScreen.classList.add('hidden');
  appContent.classList.remove('hidden');

  const name = profile?.displayName || user.displayName || user.email.split('@')[0];
  const role = profile?.role?.label || profile?.role || 'Utilisateur';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  currentUserProfile = { uid: user.uid, ...(profile || {}) };
  currentUserRole = role;

  if (userNameEl) userNameEl.textContent = name;
  if (userRoleEl) userRoleEl.textContent = role;
  if (userAvatarEl) userAvatarEl.textContent = initials;

  // Restrict team and billing management to managers
  const restrictedLabels = ['Équipe', 'Facturation & Devis'];
  restrictedLabels.forEach(label => {
    const nav = document.querySelector(`.nav-item[data-label="${label}"]`);
    if (nav) {
      if (role === 'Manager') {
        nav.style.display = 'flex';
      } else {
        nav.style.display = 'none';
        const sectionId = label === 'Équipe' ? 'section-equipe' : 'section-facturation';
        const section = document.getElementById(sectionId);
        if (section && section.classList.contains('active')) {
          navItems.forEach(n => n.classList.remove('active'));
          navItems[0].classList.add('active');
          sections.forEach(s => s.classList.remove('active'));
          document.getElementById('section-dashboard').classList.add('active');
        }
      }
    }
  });

  // Re-render role-dependent UI
  if (document.getElementById('clients-tbody')) {
    renderClients(allClients);
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appContent.classList.add('hidden');
  if (userNameEl) userNameEl.textContent = '';
  if (userRoleEl) userRoleEl.textContent = '';
  if (userAvatarEl) userAvatarEl.textContent = '';
}

// Initialize Supabase after library loads
let supabaseClient = null;

function initSupabase() {
  if (typeof window.supabase !== 'undefined') {
    const supabaseUrl = 'https://kpaibgkdnjvcqbbniimb.supabase.co';
    const supabaseKey = 'sb_publishable_yxbrPmgBVYaM-kjUP2VLWQ_Fb72K5UM';
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    
    // Create bucket if it doesn't exist
    createBucketIfNotExists();
  } else {
    console.error('Supabase library not loaded');
  }
}

async function createBucketIfNotExists() {
  try {
    // Try to list buckets to see if our bucket exists
    const { data: buckets, error } = await supabaseClient.storage.listBuckets();
    
    if (error) {
      console.error('Error listing buckets:', error);
      // Try to use the bucket anyway, it might exist but we can't list it
      return;
    }
    
    const projectFilesBucket = buckets.find(b => b.name === 'project-files');
    
    if (!projectFilesBucket) {
      console.log('Bucket project-files not found. You may need to create it manually in Supabase dashboard.');
      // Try to create the bucket (might fail with public key)
      const { data, error } = await supabaseClient.storage.createBucket('project-files', {
        public: true,
        allowedMimeTypes: ['*/*'],
        fileSizeLimit: 52428800 // 50MB
      });
      
      if (error) {
        console.error('Cannot create bucket with public key. Please create "project-files" bucket manually in Supabase dashboard:', error);
      console.log('IMPORTANT: Since users are authenticated via Firebase, use these RLS policies without auth.role() check:');
      } else {
        console.log('Bucket project-files created successfully');
      }
    } else {
      console.log('Bucket project-files already exists');
    }
  } catch (err) {
    console.error('Error with bucket operations:', err);
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabase);
} else {
  initSupabase();
}

auth.onAuthStateChanged(async user => {
  if (!user) {
    showLogin();
    return;
  }

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    const profile = doc.exists ? doc.data() : null;
    showApp(user, profile);
    loadTeamMembers();
    
    // Initialize planning after user is logged in
    setTimeout(() => {
      updatePlanningHeader();
      refreshPlanning();
    }, 1000);
  } catch (err) {
    console.error(err);
    loginError.textContent = 'Erreur lors du chargement du profil.';
    showLogin();
  }
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    loginError.textContent = 'Veuillez saisir votre email et votre mot de passe.';
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error(err);
    let message = 'Échec de la connexion.';
    if (err.code === 'auth/user-not-found') message = 'Aucun compte ne correspond à cet email.';
    if (err.code === 'auth/wrong-password') message = 'Mot de passe incorrect.';
    if (err.code === 'auth/invalid-email') message = 'Adresse email invalide.';
    loginError.textContent = message;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
});

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section-page');
const sectionMap = [
  'section-dashboard',
  'section-clients',
  'section-pipeline',
  'section-taches',
  'section-analytics',
  'section-projets',
  'section-facturation',
  'section-equipe',
  'section-parametres'
];

navItems.forEach((item, index) => {
  item.addEventListener('click', e => {
    e.preventDefault();

    const sectionId = sectionMap[index];
    // Restrict team and billing management to managers
    if ((sectionId === 'section-equipe' || sectionId === 'section-facturation') && currentUserRole !== 'Manager') {
      showToast('Accès réservé aux managers.', 'error');
      return;
    }

    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    sections.forEach(s => s.classList.remove('active'));
    const target = document.getElementById(sectionId);
    if (target) target.classList.add('active');

    // Load team data when opening the team section
    if (sectionId === 'section-equipe' && currentUserRole === 'Manager') {
      loadTeamMembers();
    }

    // Load billing data when opening the billing section
    if (sectionId === 'section-facturation' && currentUserRole === 'Manager') {
      loadBillings();
    }
  });
});

// Clients — temps réel
let allClients = [];

db.collection('clients').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
  allClients = [];
  snapshot.forEach(doc => {
    allClients.push({ id: doc.id, ...doc.data() });
  });
  renderClients(allClients);
}, err => {
  console.error(err);
  document.getElementById('clients-tbody').innerHTML = '<tr class="empty-row"><td colspan="7">Erreur lors du chargement.</td></tr>';
});

function renderClients(clients) {
  const tbody = document.getElementById('clients-tbody');
  if (clients.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Aucun client trouvé.</td></tr>';
    return;
  }

  tbody.innerHTML = clients.map(c => {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || '—';
    const email = c.email || '—';
    const telephone = c.telephone || '—';
    const type = c.type || '—';
    const entreprise = c.entreprise || '—';
    const date = c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '—';
    const badgeClass = type === 'professionnel' ? 'badge-professionnel' : 'badge-particulier';
    return `<tr data-client-id="${c.id}">
      <td>${nom}</td>
      <td>${email}</td>
      <td>${telephone}</td>
      <td><span class="badge ${badgeClass}">${type}</span></td>
      <td>${entreprise}</td>
      <td>${date}</td>
      <td style="text-align:right;"><div class="action-btns"><button class="action-btn" data-action="delete" title="Supprimer"><i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`;
  }).join('');

  // Attach click handlers
  tbody.querySelectorAll('tr[data-client-id]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.action-btns')) return;
      const client = allClients.find(c => c.id === row.dataset.clientId);
      if (client) openClientDetail(client);
    });
  });

  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
    if (!isManager()) {
      btn.disabled = true;
      btn.title = 'Réservé aux managers';
    }
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!isManager()) {
        showToast('Accès réservé aux managers.', 'error');
        return;
      }
      const row = btn.closest('tr[data-client-id]');
      const clientId = row?.dataset.clientId;
      if (!clientId) return;
      await deleteClient(clientId);
    });
  });
}

async function deleteClient(clientId) {
  if (!isManager()) {
    showToast('Accès réservé aux managers.', 'error');
    return;
  }

  const client = allClients.find(c => c.id === clientId);
  if (!client) return;

  if (!API_BASE_URL) {
    showToast('URL du backend non configurée. Voir README-ABBY.md.', 'error');
    return;
  }

  const nom = [client.prenom, client.nom].filter(Boolean).join(' ') || client.entreprise || client.email || clientId;
  const confirmed = await appConfirm(
    `Supprimer définitivement le client « ${nom} » ? Cette action est irréversible.`,
    { title: 'Supprimer le client', confirmLabel: 'Supprimer', cancelLabel: 'Annuler', icon: 'fa-trash' }
  );
  if (!confirmed) return;

  try {
    await apiRequest(`/api/client/${clientId}`, { method: 'DELETE' });
    showToast('Client supprimé avec succès.', 'success');
  } catch (err) {
    console.error('Delete client error:', err);
    showToast('Erreur lors de la suppression du client : ' + err.message, 'error');
  }
}

// Search
const clientsSearchInput = document.getElementById('clients-search');
if (clientsSearchInput) {
  clientsSearchInput.addEventListener('input', () => {
    const query = clientsSearchInput.value.toLowerCase().trim();
    if (!query) {
      renderClients(allClients);
      return;
    }
    const filtered = allClients.filter(c => {
      const fullName = [c.prenom, c.nom].join(' ').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const entreprise = (c.entreprise || '').toLowerCase();
      return fullName.includes(query) || email.includes(query) || entreprise.includes(query);
    });
    renderClients(filtered);
  });
}

// Modal - Créer un client
const clientModal = document.getElementById('client-modal');
const modalClose = document.getElementById('modal-close');
const modalStep1 = document.getElementById('modal-step-1');
const modalStepParticulier = document.getElementById('modal-step-particulier');
const modalStepProfessionnel = document.getElementById('modal-step-professionnel');
const formParticulier = document.getElementById('form-particulier');
const formProfessionnel = document.getElementById('form-professionnel');
const modalTitle = document.getElementById('modal-title');

function openClientModal() {
  clientModal.classList.add('visible');
  showModalStep('step1');
  showFormStep('particulier', 1);
  showFormStep('professionnel', 1);
}

function closeClientModal() {
  clientModal.classList.remove('visible');
  formParticulier.reset();
  formProfessionnel.reset();
  document.getElementById('modal-error-particulier').textContent = '';
  document.getElementById('modal-error-professionnel').textContent = '';
  showFormStep('particulier', 1);
  showFormStep('professionnel', 1);
}

function showFormStep(type, step) {
  const step1 = document.getElementById(`form-step-${type}-1`);
  const step2 = document.getElementById(`form-step-${type}-2`);
  if (!step1 || !step2) return;
  if (step === 1) {
    step1.classList.add('active');
    step2.classList.remove('active');
  } else {
    step1.classList.remove('active');
    step2.classList.add('active');
  }
}

function validateFormStep(type, step) {
  const container = document.getElementById(`form-step-${type}-${step}`);
  if (!container) return false;
  const invalid = container.querySelector(':invalid');
  if (invalid) {
    invalid.focus();
    return false;
  }

  // Address must contain a number (zip) and enough text for street + city
  const addressInput = container.querySelector('input[name="adresse"]');
  if (addressInput) {
    const address = addressInput.value.trim();
    const hasZip = /\d{4,5}/.test(address);
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    if (!hasZip || parts.length < 2) {
      addressInput.setCustomValidity('Format attendu : numéro, rue, code postal, ville');
      addressInput.reportValidity();
      addressInput.focus();
      return false;
    }
    addressInput.setCustomValidity('');
  }

  return true;
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll('input, select').forEach(input => {
    if (input.name) data[input.name] = input.value.trim();
  });
  return data;
}

function showModalStep(step) {
  modalStep1.classList.remove('active');
  modalStepParticulier.classList.remove('active');
  modalStepProfessionnel.classList.remove('active');

  if (step === 'step1') {
    modalStep1.classList.add('active');
    modalTitle.textContent = 'Nouveau client';
  } else if (step === 'particulier') {
    modalStepParticulier.classList.add('active');
    modalTitle.textContent = 'Client particulier';
  } else if (step === 'professionnel') {
    modalStepProfessionnel.classList.add('active');
    modalTitle.textContent = 'Client professionnel';
  }
}

document.getElementById('create-client-btn').addEventListener('click', openClientModal);
modalClose.addEventListener('click', closeClientModal);
clientModal.addEventListener('click', e => {
  if (e.target === clientModal) closeClientModal();
});

document.getElementById('type-particulier').addEventListener('click', () => {
  showModalStep('particulier');
  showFormStep('particulier', 1);
});
document.getElementById('type-professionnel').addEventListener('click', () => {
  showModalStep('professionnel');
  showFormStep('professionnel', 1);
});
document.getElementById('back-from-particulier').addEventListener('click', () => showModalStep('step1'));
document.getElementById('back-from-professionnel').addEventListener('click', () => showModalStep('step1'));

document.getElementById('next-particulier')?.addEventListener('click', () => {
  if (validateFormStep('particulier', 1)) showFormStep('particulier', 2);
});
document.getElementById('next-professionnel')?.addEventListener('click', () => {
  if (validateFormStep('professionnel', 1)) showFormStep('professionnel', 2);
});
document.getElementById('back-to-particulier-1')?.addEventListener('click', () => showFormStep('particulier', 1));
document.getElementById('back-to-professionnel-1')?.addEventListener('click', () => showFormStep('professionnel', 1));

function generateClientId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `KRB-${part()}-${part()}`;
}

async function saveNewClient(data, type) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non authentifié');

  const clientUniqueId = generateClientId();

  const docRef = await db.collection('clients').add({
    ...data,
    type,
    clientId: clientUniqueId,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: user.uid
  });

  // Sync to Abby asynchronously (do not block client creation if Abby fails)
  syncClientToAbby({ id: docRef.id, ...data, type }).catch(err => {
    console.error('Abby sync error:', err);
  });

  return clientUniqueId;
}

async function syncClientToAbby(client) {
  if (!API_BASE_URL) return;
  return apiRequest('/api/sync-client', {
    method: 'POST',
    body: JSON.stringify({ client }),
  });
}

function showClientIdNotification(clientId) {
  const notification = document.createElement('div');
  notification.className = 'client-id-notification';
  notification.innerHTML = `
    <div class="client-id-notification-content">
      <i class="fa-solid fa-circle-check"></i>
      <div>
        <p class="notif-title">Client créé avec succès</p>
        <p class="notif-id">Identifiant : <strong>${clientId}</strong></p>
      </div>
      <button class="notif-close" onclick="this.parentElement.parentElement.remove()">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="14" y2="14"/><line x1="14" y1="6" x2="6" y2="14"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 8000);
}

// ===== Toast notifications =====
function showToast(message, type = 'info', title = '', duration = 5000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info'
  };
  const titles = {
    success: title || 'Succès',
    error: title || 'Erreur',
    info: title || 'Information'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="toast__icon fa-solid ${icons[type] || icons.info}"></i>
    <div class="toast__body">
      <div class="toast__title">${titles[type]}</div>
      <div class="toast__message">${message}</div>
    </div>
    <button class="toast__close"><i class="fa-solid fa-xmark"></i></button>
  `;

  const dismiss = () => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast__close').addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
  return toast;
}

// ===== Custom confirm dialog (returns a Promise<boolean>) =====
function appConfirm(message, { title = 'Confirmation', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', icon = 'fa-circle-question' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'app-confirm-overlay';
    overlay.innerHTML = `
      <div class="app-confirm-card">
        <div class="app-confirm-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="app-confirm-title">${title}</div>
        <div class="app-confirm-message">${message}</div>
        <div class="app-confirm-actions">
          <button class="app-confirm-btn app-confirm-btn--cancel">${cancelLabel}</button>
          <button class="app-confirm-btn app-confirm-btn--confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = result => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    overlay.querySelector('.app-confirm-btn--confirm').addEventListener('click', () => close(true));
    overlay.querySelector('.app-confirm-btn--cancel').addEventListener('click', () => close(false));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(false);
    });
  });
}

// ===== Download progress overlay =====
function showDownloadProgress(title = 'Téléchargement en cours') {
  let overlay = document.getElementById('download-progress-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'download-progress-overlay';
    overlay.className = 'download-progress-overlay';
    overlay.innerHTML = `
      <div class="download-progress-card">
        <div class="download-progress-header">
          <i class="fa-solid fa-cloud-arrow-down"></i>
          <span class="download-progress-title" id="download-progress-title"></span>
        </div>
        <div class="download-progress-status" id="download-progress-status"></div>
        <div class="progress-bar"><div class="progress-bar-fill" id="download-progress-fill"></div></div>
        <div class="progress-bar-percent" id="download-progress-percent">0%</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  document.getElementById('download-progress-title').textContent = title;
  document.getElementById('download-progress-status').textContent = 'Préparation…';
  document.getElementById('download-progress-fill').style.width = '0%';
  document.getElementById('download-progress-percent').textContent = '0%';
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function updateDownloadProgress(percent, status = '') {
  const fill = document.getElementById('download-progress-fill');
  const percentEl = document.getElementById('download-progress-percent');
  const statusEl = document.getElementById('download-progress-status');
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (fill) fill.style.width = `${clamped}%`;
  if (percentEl) percentEl.textContent = `${clamped}%`;
  if (statusEl && status) statusEl.textContent = status;
}

function hideDownloadProgress() {
  const overlay = document.getElementById('download-progress-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }
}

formParticulier.addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = document.getElementById('modal-error-particulier');
  errorEl.textContent = '';

  const data = collectFormData(formParticulier);

  try {
    const clientId = await saveNewClient(data, 'particulier');
    closeClientModal();
    showClientIdNotification(clientId);
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Erreur lors de la création du client.';
  }
});

formProfessionnel.addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = document.getElementById('modal-error-professionnel');
  errorEl.textContent = '';

  const data = collectFormData(formProfessionnel);

  try {
    const clientId = await saveNewClient(data, 'professionnel');
    closeClientModal();
    showClientIdNotification(clientId);
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Erreur lors de la création du client.';
  }
});

// Projets & Services — temps réel
let allProjets = [];

db.collection('projets').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
  allProjets = [];
  snapshot.forEach(doc => {
    allProjets.push({ id: doc.id, ...doc.data() });
  });
  renderAllProjets();
  refreshPlanning(); // Update planning when projects change
}, err => {
  console.error(err);
  document.getElementById('projets-tbody').innerHTML = '<tr class="empty-row"><td colspan="6">Erreur lors du chargement.</td></tr>';
});

function isProjetAcheve(p) {
  return p.statut === 'Projet livré';
}

function renderAllProjets() {
  const query = (document.getElementById('projets-search').value || '').toLowerCase().trim();
  let filtered = allProjets;
  if (query) {
    filtered = allProjets.filter(p => {
      const nom = (p.nom || '').toLowerCase();
      const client = (p.clientName || '').toLowerCase();
      return nom.includes(query) || client.includes(query);
    });
  }
  const actifs = filtered.filter(p => !isProjetAcheve(p));
  const acheves = filtered.filter(p => isProjetAcheve(p));
  renderProjets(actifs);
  renderProjetsAcheves(acheves);
}

// Tabs
const tabActifs = document.getElementById('tab-actifs');
const tabAcheves = document.getElementById('tab-acheves');
const projetsActifsView = document.getElementById('projets-actifs-view');
const projetsAchevesView = document.getElementById('projets-acheves-view');

tabActifs.addEventListener('click', () => {
  tabActifs.classList.add('active');
  tabAcheves.classList.remove('active');
  projetsActifsView.style.display = '';
  projetsAchevesView.style.display = 'none';
});

tabAcheves.addEventListener('click', () => {
  tabAcheves.classList.add('active');
  tabActifs.classList.remove('active');
  projetsAchevesView.style.display = '';
  projetsActifsView.style.display = 'none';
});

function getDeliveryStatus(dateLivraison, manualStatus) {
  if (manualStatus === 'Projet livré') return { label: 'Projet livré', cls: 'badge-livre' };
  if (!dateLivraison) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const delivery = new Date(dateLivraison);
  delivery.setHours(0, 0, 0, 0);
  const diff = delivery - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'En retard', cls: 'badge-en-retard' };
  if (days <= 7) return { label: 'Dans les temps', cls: 'badge-dans-les-temps' };
  return { label: 'En avance', cls: 'badge-en-avance' };
}

function renderProjets(projets) {
  const tbody = document.getElementById('projets-tbody');
  if (projets.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Aucun projet trouvé.</td></tr>';
    return;
  }

  tbody.innerHTML = projets.map(p => {
    const nom = p.nom || '—';
    const clientName = p.clientName || '—';
    const date = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '—';
    const livraison = p.dateLivraison || '';
    const livraisonDisplay = livraison ? new Date(livraison).toLocaleDateString('fr-FR') : '—';
    const status = getDeliveryStatus(livraison, p.statut);
    const statusHtml = status ? `<span class="badge ${status.cls}">${status.label}</span>` : '—';
    const teamHtml = (p.team && p.team.length > 0)
      ? p.team.map(m => `<span class="team-tag"><i class="fa-solid fa-user"></i>${m.name}</span>`).join(' ')
      : '—';
    return `<tr data-projet-id="${p.id}">
      <td>${nom}</td>
      <td>${clientName}</td>
      <td>${teamHtml}</td>
      <td>${date}</td>
      <td>${livraisonDisplay}</td>
      <td>${statusHtml}</td>
    </tr>`;
  }).join('');

  // Attach click handlers — navigate to project page
  tbody.querySelectorAll('tr[data-projet-id]').forEach(row => {
    row.addEventListener('click', () => {
      const projet = allProjets.find(p => p.id === row.dataset.projetId);
      if (projet) openProjetPage(projet);
    });
  });
}

// Render projets achevés
function renderProjetsAcheves(projets) {
  const tbody = document.getElementById('projets-acheves-tbody');
  if (projets.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Aucun projet achevé.</td></tr>';
    return;
  }

  tbody.innerHTML = projets.map(p => {
    const nom = p.nom || '—';
    const clientName = p.clientName || '—';
    const date = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '—';
    const dateFin = p.dateFin ? new Date(p.dateFin).toLocaleDateString('fr-FR') : '—';
    const teamHtml = (p.team && p.team.length > 0)
      ? p.team.map(m => `<span class="team-tag"><i class="fa-solid fa-user"></i>${m.name}</span>`).join(' ')
      : '—';
    return `<tr data-projet-id="${p.id}">
      <td>${nom}</td>
      <td>${clientName}</td>
      <td>${teamHtml}</td>
      <td>${date}</td>
      <td>${dateFin}</td>
      <td><span class="badge badge-livre">Projet livré</span></td>
    </tr>`;
  }).join('');

  // Click → open recap modal
  tbody.querySelectorAll('tr[data-projet-id]').forEach(row => {
    row.addEventListener('click', () => {
      const projet = allProjets.find(p => p.id === row.dataset.projetId);
      if (projet) openProjetRecap(projet);
    });
  });
}

// Recap modal for achevés
const projetRecapModal = document.getElementById('projet-recap-modal');
const projetRecapClose = document.getElementById('projet-recap-close');
const projetRecapTitle = document.getElementById('projet-recap-title');
const projetRecapInfo = document.getElementById('projet-recap-info');
const projetRecapResume = document.getElementById('projet-recap-resume');
const projetRecapTeam = document.getElementById('projet-recap-team');

function openProjetRecap(projet) {
  projetRecapTitle.textContent = projet.nom || 'Projet';

  const dateCreation = projet.createdAt ? new Date(projet.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '—';
  const dateFin = projet.dateFin ? new Date(projet.dateFin).toLocaleDateString('fr-FR') : '—';
  const livraisonDisplay = projet.dateLivraison ? new Date(projet.dateLivraison).toLocaleDateString('fr-FR') : '—';

  projetRecapInfo.innerHTML = `
    <div class="detail-info-item"><span class="detail-info-label">ID Projet</span><span class="detail-info-value">${projet.projetId || '—'}</span></div>
    <div class="detail-info-item"><span class="detail-info-label">Client</span><span class="detail-info-value">${projet.clientName || '—'}</span></div>
    <div class="detail-info-item"><span class="detail-info-label">Date de création</span><span class="detail-info-value">${dateCreation}</span></div>
    <div class="detail-info-item"><span class="detail-info-label">Livraison prévue</span><span class="detail-info-value">${livraisonDisplay}</span></div>
    <div class="detail-info-item"><span class="detail-info-label">Date de fin</span><span class="detail-info-value">${dateFin}</span></div>
    <div class="detail-info-item"><span class="detail-info-label">Statut</span><span class="detail-info-value"><span class="badge badge-livre">Projet livré</span></span></div>
  `;

  if (projet.resume) {
    projetRecapResume.innerHTML = `<p class="detail-resume">${projet.resume}</p>`;
  } else {
    projetRecapResume.innerHTML = '<p class="detail-resume-empty">Aucun résumé renseigné.</p>';
  }

  if (projet.team && projet.team.length > 0) {
    const teamByRole = {};
    projet.team.forEach(m => {
      const r = m.role || 'Autre';
      if (!teamByRole[r]) teamByRole[r] = [];
      teamByRole[r].push(m);
    });
    projetRecapTeam.innerHTML = `<div class="team-cards-grid">
      ${roleOrder.map(r => `
        <div class="team-role-card">
          <div class="team-role-card-title">${r}</div>
          <div class="team-role-card-members">
            ${(teamByRole[r] || []).length > 0
              ? teamByRole[r].map(m => `<div class="team-role-card-member"><i class="fa-solid fa-user"></i>${m.name}</div>`).join('')
              : '<span class="team-role-card-empty">—</span>'}
          </div>
        </div>
      `).join('')}
    </div>`;
  } else {
    projetRecapTeam.innerHTML = '<p class="detail-resume-empty">Aucune équipe assignée.</p>';
  }

  projetRecapModal.classList.add('visible');
}

projetRecapClose.addEventListener('click', () => projetRecapModal.classList.remove('visible'));
projetRecapModal.addEventListener('click', e => {
  if (e.target === projetRecapModal) projetRecapModal.classList.remove('visible');
});

// Search projets
const projetsSearchInput = document.getElementById('projets-search');
if (projetsSearchInput) {
  projetsSearchInput.addEventListener('input', () => {
    renderAllProjets();
  });
}

// Modal - Créer un projet
const projetModal = document.getElementById('projet-modal');
const projetModalClose = document.getElementById('projet-modal-close');
const formProjet = document.getElementById('form-projet');
const projetClientSelect = document.getElementById('projet-client');
const projetTeamListEl = document.getElementById('projet-team-list');

let allTeamMembers = [];

const roleOrder = ['Manager', 'Développeur', 'Designer Graphique'];

function getRoleLabel(role) {
  if (!role) return 'Autre';
  if (typeof role === 'object' && role.label) return role.label;
  return role;
}

function sortByRole(members) {
  return [...members].sort((a, b) => {
    const ia = roleOrder.indexOf(a.role);
    const ib = roleOrder.indexOf(b.role);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function groupByRole(members) {
  const groups = {};
  members.forEach(m => {
    const r = m.role || 'Autre';
    if (!groups[r]) groups[r] = [];
    groups[r].push(m);
  });
  const ordered = [];
  roleOrder.forEach(r => { if (groups[r]) { ordered.push({ role: r, members: groups[r] }); delete groups[r]; } });
  Object.keys(groups).forEach(r => ordered.push({ role: r, members: groups[r] }));
  return ordered;
}

async function loadTeamMembers() {
  try {
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    allUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
    allTeamMembers = allUsers.map(u => ({ uid: u.uid, name: u.displayName || u.email || u.uid, role: getRoleLabel(u.role) }));
    allTeamMembers = sortByRole(allTeamMembers);
    renderEquipeTable();
  } catch (err) {
    console.error('Error loading team members:', err);
  }
}

function populateTeamCheckboxes() {
  if (allTeamMembers.length === 0) {
    projetTeamListEl.innerHTML = '<p style="font-size:0.85rem;color:var(--muted);">Aucun membre trouvé.</p>';
    return;
  }
  const membersByRole = {};
  allTeamMembers.forEach(m => {
    const r = m.role || 'Autre';
    if (!membersByRole[r]) membersByRole[r] = [];
    membersByRole[r].push(m);
  });
  projetTeamListEl.innerHTML = `<div class="team-cards-grid">
    ${roleOrder.map(r => `
      <div class="team-role-card">
        <div class="team-role-card-title">${r}</div>
        <div class="team-role-card-members">
          ${(membersByRole[r] || []).length > 0
            ? (membersByRole[r]).map(m => `
              <div class="team-checkbox-item" style="border:none;padding:4px 0;">
                <input type="checkbox" id="team-${m.uid}" value="${m.uid}" data-name="${m.name}" data-role="${m.role}" />
                <label for="team-${m.uid}">${m.name}</label>
              </div>
            `).join('')
            : '<span class="team-role-card-empty">Aucun membre</span>'}
        </div>
      </div>
    `).join('')}
  </div>`;
}

async function openProjetModal() {
  populateClientSelect();
  await loadTeamMembers();
  populateTeamCheckboxes();
  projetModal.classList.add('visible');
}

function closeProjetModal() {
  projetModal.classList.remove('visible');
  formProjet.reset();
  document.getElementById('modal-error-projet').textContent = '';
}

function populateClientSelect() {
  projetClientSelect.innerHTML = '<option value="">Sélectionner un client...</option>';
  allClients.forEach(c => {
    const name = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email || c.id;
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.entreprise ? `${name} — ${c.entreprise}` : name;
    projetClientSelect.appendChild(option);
  });
}

function ensureClientsLoaded() {
  return Promise.resolve();
}

document.getElementById('create-projet-btn').addEventListener('click', async () => {
  await ensureClientsLoaded();
  openProjetModal();
});
projetModalClose.addEventListener('click', closeProjetModal);
projetModal.addEventListener('click', e => {
  if (e.target === projetModal) closeProjetModal();
});

function getSelectedTeam() {
  const checked = projetTeamListEl.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => ({ uid: cb.value, name: cb.dataset.name, role: cb.dataset.role }));
}

function generateProjetId() {
  const chars = '0123456789';
  let id = 'KRBPRJCTID-';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

formProjet.addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = document.getElementById('modal-error-projet');
  errorEl.textContent = '';

  const nom = document.getElementById('projet-nom').value.trim();
  const clientId = projetClientSelect.value;
  const dateLivraison = document.getElementById('projet-livraison').value || '';
  const resume = document.getElementById('projet-resume').value.trim();
  const team = getSelectedTeam();

  if (!nom || !clientId) {
    errorEl.textContent = 'Veuillez remplir le nom et sélectionner un client.';
    return;
  }

  const selectedClient = allClients.find(c => c.id === clientId);
  const clientName = selectedClient
    ? (selectedClient.entreprise
      ? `${[selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')} — ${selectedClient.entreprise}`
      : [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' '))
    : '';

  const user = auth.currentUser;
  if (!user) {
    errorEl.textContent = 'Non authentifié.';
    return;
  }

  const projetUniqueId = generateProjetId();

  try {
    await db.collection('projets').add({
      nom,
      clientId,
      clientName,
      dateLivraison,
      resume,
      team,
      projetId: projetUniqueId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user.uid
    });
    closeProjetModal();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Erreur lors de la création du projet.';
  }
});

// Client Detail Modal
const clientDetailModal = document.getElementById('client-detail-modal');
const detailModalClose = document.getElementById('detail-modal-close');
const detailModalTitle = document.getElementById('detail-modal-title');
const detailFieldsContainer = document.getElementById('detail-fields');
const detailProjetsContainer = document.getElementById('detail-projets');
const detailClientIdEl = document.getElementById('detail-client-id');

let currentDetailClient = null;

function openClientDetail(client) {
  currentDetailClient = client;
  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client';
  detailModalTitle.textContent = name;
  detailClientIdEl.textContent = client.clientId || '—';

  renderDetailFields(client);
  loadClientProjets(client.id);
  clientDetailModal.classList.add('visible');
}

function closeClientDetail() {
  clientDetailModal.classList.remove('visible');
  currentDetailClient = null;
}

detailModalClose.addEventListener('click', closeClientDetail);
clientDetailModal.addEventListener('click', e => {
  if (e.target === clientDetailModal) closeClientDetail();
});

function getFieldsForClient(client) {
  const fields = [
    { key: 'nom', label: 'Nom' },
    { key: 'prenom', label: 'Prénom' },
    { key: 'email', label: 'Email' },
    { key: 'telephone', label: 'Téléphone' },
    { key: 'adresse', label: client.type === 'professionnel' ? 'Adresse du siège social' : 'Adresse de domicile' },
  ];
  if (client.type === 'professionnel') {
    fields.push({ key: 'siret', label: 'Numéro SIRET' });
    fields.push({ key: 'entreprise', label: 'Entreprise' });
  }
  return fields;
}

function renderDetailFields(client) {
  const fields = getFieldsForClient(client);

  detailFieldsContainer.innerHTML = fields.map(f => {
    const value = client[f.key] || '—';
    return `<div class="detail-field" data-field="${f.key}">
      <div class="detail-field-left">
        <span class="detail-field-label">${f.label}</span>
        <span class="detail-field-value">${value}</span>
        <input class="detail-field-input" type="text" value="${client[f.key] || ''}" />
      </div>
      <button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>
    </div>`;
  }).join('');

  // Attach edit handlers
  detailFieldsContainer.querySelectorAll('.detail-field').forEach(field => {
    const editBtn = field.querySelector('.detail-field-edit');
    const input = field.querySelector('.detail-field-input');

    editBtn.addEventListener('click', async () => {
      if (field.classList.contains('editing')) {
        // Save
        const key = field.dataset.field;
        const newValue = input.value.trim();
        try {
          await db.collection('clients').doc(currentDetailClient.id).update({ [key]: newValue });
          currentDetailClient[key] = newValue;
          field.querySelector('.detail-field-value').textContent = newValue || '—';
          field.classList.remove('editing');
          // Update table
          const idx = allClients.findIndex(c => c.id === currentDetailClient.id);
          if (idx !== -1) allClients[idx] = { ...currentDetailClient };
          renderClients(allClients);
        } catch (err) {
          console.error(err);
        }
      } else {
        field.classList.add('editing');
        input.focus();
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        editBtn.click();
      }
      if (e.key === 'Escape') {
        input.value = currentDetailClient[field.dataset.field] || '';
        field.classList.remove('editing');
      }
    });
  });
}

async function loadClientProjets(clientDocId) {
  detailProjetsContainer.innerHTML = '<p class="detail-projets-empty">Chargement...</p>';

  try {
    const snapshot = await db.collection('projets').where('clientId', '==', clientDocId).get();
    if (snapshot.empty) {
      detailProjetsContainer.innerHTML = '<p class="detail-projets-empty">Aucun projet associé.</p>';
      return;
    }

    const projets = [];
    snapshot.forEach(doc => projets.push({ id: doc.id, ...doc.data() }));

    detailProjetsContainer.innerHTML = `<ul class="detail-projets-list">
      ${projets.map(p => {
        const date = p.createdAt ? new Date(p.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '';
        return `<li><i class="fa-solid fa-diagram-project"></i> <span>${p.nom || '—'}</span> <span style="color:var(--muted);font-size:0.78rem;margin-left:auto;">${date}</span></li>`;
      }).join('')}
    </ul>`;
  } catch (err) {
    console.error(err);
    detailProjetsContainer.innerHTML = '<p class="detail-projets-empty">Erreur lors du chargement.</p>';
  }
}

// Projet Page View (inline within section-projets)
const projetsListView = document.getElementById('projets-list-view');
const projetPageView = document.getElementById('projet-page-view');
const projetPageTitle = document.getElementById('projet-page-title');
const projetPageId = document.getElementById('projet-page-id');
const projetPageInfo = document.getElementById('projet-page-info');
const projetPageResumeText = document.getElementById('projet-page-resume-text');
const projetPageResumeInput = document.getElementById('projet-page-resume-input');
const projetPageResumeEdit = document.getElementById('projet-page-resume-edit');
const projetPageResumeWrapper = document.getElementById('projet-page-resume');
const projetPageTeamDisplay = document.getElementById('projet-page-team-display');
const projetPageTeamEditList = document.getElementById('projet-page-team-edit-list');
const projetPageTeamEditBtn = document.getElementById('projet-page-team-edit');
const projetPageTeamSection = document.getElementById('projet-page-team');

let currentPageProjet = null;

function openProjetPage(projet) {
  currentPageProjet = projet;
  projetsListView.style.display = 'none';
  projetPageView.style.display = '';

  projetPageTitle.textContent = projet.nom || 'Projet';
  projetPageId.textContent = projet.projetId || '—';

  renderProjetPageInfo(projet);
  renderProjetPageResume(projet);
  renderProjetPageTeam(projet);
  renderProjetPageFiles(projet);
}

function closeProjetPage() {
  projetPageView.style.display = 'none';
  projetsListView.style.display = '';
  projetPageResumeWrapper.classList.remove('editing');
  projetPageTeamSection.classList.remove('editing');
  currentPageProjet = null;
}

document.getElementById('projet-back-btn').addEventListener('click', closeProjetPage);

// Editable info fields
function renderProjetPageInfo(projet) {
  const dateCreation = projet.createdAt ? new Date(projet.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '—';
  const livraison = projet.dateLivraison || '';
  const livraisonDisplay = livraison ? new Date(livraison).toLocaleDateString('fr-FR') : '—';
  const status = getDeliveryStatus(livraison, projet.statut);
  const statusHtml = status ? `<span class="badge ${status.cls}">${status.label}</span>` : '—';

  // Client select options
  const clientOptions = allClients.map(c => {
    const cName = c.entreprise ? `${[c.prenom, c.nom].filter(Boolean).join(' ')} — ${c.entreprise}` : [c.prenom, c.nom].filter(Boolean).join(' ');
    const selected = c.id === projet.clientId ? 'selected' : '';
    return `<option value="${c.id}" ${selected}>${cName}</option>`;
  }).join('');

  // Status select options
  const statusOptions = ['', 'Projet livré'];
  const currentStatut = projet.statut || '';

  const dateFinVal = projet.dateFin || '';
  const dateFinDisplay = dateFinVal ? new Date(dateFinVal).toLocaleDateString('fr-FR') : '—';

  const editableFields = [
    { key: 'nom', label: 'Nom du projet', value: projet.nom || '', type: 'text' },
    { key: 'dateLivraison', label: 'Livraison prévue', value: projet.dateLivraison || '', type: 'date', display: livraisonDisplay },
    { key: 'dateFin', label: 'Date de fin', value: dateFinVal, type: 'date', display: dateFinDisplay },
  ];

  let html = '';

  editableFields.forEach(f => {
    const displayVal = f.display || f.value || '—';
    html += `<div class="detail-info-item-editable" data-field="${f.key}">
      <div class="detail-info-content">
        <span class="detail-info-label">${f.label}</span>
        <span class="detail-info-value">${displayVal}</span>
        <input class="detail-field-input" type="${f.type}" value="${f.value}" />
      </div>
      <button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>
    </div>`;
  });

  // Client editable
  html += `<div class="detail-info-item-editable" data-field="clientId">
    <div class="detail-info-content">
      <span class="detail-info-label">Client</span>
      <span class="detail-info-value">${projet.clientName || '—'}</span>
      <select class="detail-field-input" id="projet-page-client-select">
        <option value="">— Sélectionner —</option>
        ${clientOptions}
      </select>
    </div>
    <button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>
  </div>`;

  // Date de création (static)
  html += `<div class="detail-info-item">
    <span class="detail-info-label">Date de création</span>
    <span class="detail-info-value">${dateCreation}</span>
  </div>`;

  // Statut editable
  html += `<div class="detail-info-item-editable" data-field="statut">
    <div class="detail-info-content">
      <span class="detail-info-label">Statut</span>
      <span class="detail-info-value">${statusHtml}</span>
      <select class="detail-field-input" id="projet-page-statut-select">
        <option value="" ${currentStatut === '' ? 'selected' : ''}>Automatique (selon date)</option>
        <option value="Projet livré" ${currentStatut === 'Projet livré' ? 'selected' : ''}>Projet livré</option>
      </select>
    </div>
    <button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>
  </div>`;

  projetPageInfo.innerHTML = html;

  // Attach edit handlers
  projetPageInfo.querySelectorAll('.detail-info-item-editable').forEach(item => {
    const editBtn = item.querySelector('.detail-field-edit');
    const input = item.querySelector('.detail-field-input');

    editBtn.addEventListener('click', async () => {
      if (item.classList.contains('editing')) {
        const key = item.dataset.field;
        try {
          if (key === 'clientId') {
            const select = item.querySelector('select');
            const newClientId = select.value;
            const selectedClient = allClients.find(c => c.id === newClientId);
            const newClientName = selectedClient
              ? (selectedClient.entreprise ? `${[selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')} — ${selectedClient.entreprise}` : [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' '))
              : '';
            await db.collection('projets').doc(currentPageProjet.id).update({ clientId: newClientId, clientName: newClientName });
            currentPageProjet.clientId = newClientId;
            currentPageProjet.clientName = newClientName;
          } else if (key === 'statut') {
            const select = item.querySelector('select');
            const newStatut = select.value;
            if (newStatut === 'Projet livré') {
              // Download ZIP before marking as delivered
              const zipDownloaded = await downloadProjectAsZip(currentPageProjet);
              if (!zipDownloaded) {
                // User cancelled or failed, don't change status
                select.value = currentPageProjet.statut || '';
                return;
              }
              
              const today = new Date().toISOString().split('T')[0];
              await db.collection('projets').doc(currentPageProjet.id).update({ statut: newStatut, dateFin: today });
              currentPageProjet.statut = newStatut;
              currentPageProjet.dateFin = today;
              
              // Clear project files after successful download and status change
              await clearProjectFiles(currentPageProjet.id);
            } else {
              await db.collection('projets').doc(currentPageProjet.id).update({ statut: newStatut, dateFin: '' });
              currentPageProjet.statut = newStatut;
              currentPageProjet.dateFin = '';
            }
          } else {
            const newValue = input.value.trim();
            await db.collection('projets').doc(currentPageProjet.id).update({ [key]: newValue });
            currentPageProjet[key] = newValue;
            
            // If delivery date changed, refresh file tree to update Livraison folder
            if (key === 'dateLivraison') {
              renderProjetPageFiles(currentPageProjet);
            }
          }
          item.classList.remove('editing');
          renderProjetPageInfo(currentPageProjet);
          projetPageTitle.textContent = currentPageProjet.nom || 'Projet';
        } catch (err) {
          console.error(err);
        }
      } else {
        item.classList.add('editing');
        input.focus();
      }
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); editBtn.click(); }
      if (e.key === 'Escape') { item.classList.remove('editing'); }
    });
  });
}

// Editable résumé
function renderProjetPageResume(projet) {
  projetPageResumeWrapper.classList.remove('editing');
  if (projet.resume) {
    projetPageResumeText.textContent = projet.resume;
    projetPageResumeText.className = 'detail-resume';
  } else {
    projetPageResumeText.textContent = 'Aucun résumé renseigné.';
    projetPageResumeText.className = 'detail-resume-empty';
  }
  projetPageResumeInput.value = projet.resume || '';
}

projetPageResumeEdit.addEventListener('click', async () => {
  if (projetPageResumeWrapper.classList.contains('editing')) {
    const newResume = projetPageResumeInput.value.trim();
    try {
      await db.collection('projets').doc(currentPageProjet.id).update({ resume: newResume });
      currentPageProjet.resume = newResume;
      renderProjetPageResume(currentPageProjet);
    } catch (err) {
      console.error(err);
    }
  } else {
    projetPageResumeWrapper.classList.add('editing');
    projetPageResumeInput.focus();
  }
});

// Editable team
function renderProjetPageTeam(projet) {
  projetPageTeamSection.classList.remove('editing');

  if (projet.team && projet.team.length > 0) {
    const teamByRole = {};
    (projet.team || []).forEach(m => {
      const r = m.role || 'Autre';
      if (!teamByRole[r]) teamByRole[r] = [];
      teamByRole[r].push(m);
    });
    projetPageTeamDisplay.innerHTML = `<div class="team-cards-grid">
      ${roleOrder.map(r => `
        <div class="team-role-card">
          <div class="team-role-card-title">${r}</div>
          <div class="team-role-card-members">
            ${(teamByRole[r] || []).length > 0
              ? (teamByRole[r]).map(m => `<div class="team-role-card-member"><i class="fa-solid fa-user"></i>${m.name}</div>`).join('')
              : '<span class="team-role-card-empty">—</span>'}
          </div>
        </div>
      `).join('')}
    </div>`;
  } else {
    projetPageTeamDisplay.innerHTML = '<p class="detail-resume-empty">Aucune équipe assignée.</p>';
  }

  // Populate checkboxes in card grid layout
  const currentUids = (projet.team || []).map(m => m.uid);
  const membersByRole = {};
  allTeamMembers.forEach(m => {
    const r = m.role || 'Autre';
    if (!membersByRole[r]) membersByRole[r] = [];
    membersByRole[r].push(m);
  });
  projetPageTeamEditList.innerHTML = `<div class="team-cards-grid">
    ${roleOrder.map(r => `
      <div class="team-role-card">
        <div class="team-role-card-title">${r}</div>
        <div class="team-role-card-members">
          ${(membersByRole[r] || []).length > 0
            ? (membersByRole[r]).map(m => `
              <div class="team-checkbox-item" style="border:none;padding:4px 0;">
                <input type="checkbox" id="ppage-team-${m.uid}" value="${m.uid}" data-name="${m.name}" data-role="${m.role}" ${currentUids.includes(m.uid) ? 'checked' : ''} />
                <label for="ppage-team-${m.uid}">${m.name}</label>
              </div>
            `).join('')
            : '<span class="team-role-card-empty">Aucun membre</span>'}
        </div>
      </div>
    `).join('')}
  </div>`;
}

projetPageTeamEditBtn.addEventListener('click', async () => {
  if (projetPageTeamSection.classList.contains('editing')) {
    const checked = projetPageTeamEditList.querySelectorAll('input[type="checkbox"]:checked');
    const newTeam = Array.from(checked).map(cb => ({ uid: cb.value, name: cb.dataset.name, role: cb.dataset.role }));
    try {
      await db.collection('projets').doc(currentPageProjet.id).update({ team: newTeam });
      currentPageProjet.team = newTeam;
      renderProjetPageTeam(currentPageProjet);
    } catch (err) {
      console.error(err);
    }
  } else {
    await loadTeamMembers();
    renderProjetPageTeam(currentPageProjet);
    projetPageTeamSection.classList.add('editing');
  }
});

// Delete project
document.getElementById('btn-delete-projet').addEventListener('click', async () => {
  if (!currentPageProjet) return;
  const confirmed = confirm(`Supprimer le projet « ${currentPageProjet.nom} » ? Cette action est irréversible.`);
  if (!confirmed) return;

  try {
    await db.collection('projets').doc(currentPageProjet.id).delete();
    closeProjetPage();
  } catch (err) {
    console.error(err);
    alert('Erreur lors de la suppression du projet.');
  }
});

// File Explorer
const fileUploadModal = document.getElementById('file-upload-modal');
const fileUploadClose = document.getElementById('file-upload-close');
const fileUploadInput = document.getElementById('file-upload-input');
const fileUploadFolder = document.getElementById('file-upload-folder');
const fileUploadName = document.getElementById('file-upload-name');
const fileUploadSubmit = document.getElementById('file-upload-submit');
const fileUploadError = document.getElementById('file-upload-error');

// Folder Date Modal
const folderDateModal = document.getElementById('folder-date-modal');
const folderDateClose = document.getElementById('folder-date-close');
const folderDateName = document.getElementById('folder-date-name');
const folderDateInput = document.getElementById('folder-date-input');
const folderDateSubmit = document.getElementById('folder-date-submit');
const folderDateError = document.getElementById('folder-date-error');

// Planning variables
let currentWeekOffset = 0;
let planningProjects = [];

// Planning DOM elements
const planningPrevWeek = document.getElementById('planning-prev-week');
const planningToday = document.getElementById('planning-today');
const planningNextWeek = document.getElementById('planning-next-week');
const weekStartDate = document.getElementById('week-start-date');
const weekEndDate = document.getElementById('week-end-date');

// Task Modal DOM elements
const taskModal = document.getElementById('task-modal');
const taskModalClose = document.getElementById('task-modal-close');
const taskModalCloseBtn = document.getElementById('task-modal-close-btn');
const taskProjectName = document.getElementById('task-project-name');
const taskProjectId = document.getElementById('task-project-id');
const taskProjectClient = document.getElementById('task-project-client');
const taskFolderSections = document.getElementById('task-folder-sections');

// Default folder structure with required files (without extensions)
const defaultFolderStructure = {
  '01 - Administration': {
    'Contrat': { required: true },
    'Devis': { required: true },
    'Factures': { required: true }
  },
  '02 - Analyse': {
    'Cahier des charges': { required: true },
    'Arborescence': { required: true },
    'Planning': { required: true }
  },
  '03 - Design': {
    'Maquette': { required: true },
    'Prototype': { required: true },
    'Charte graphique': { required: true },
    'Assets': { required: true }
  },
  '04 - Développement': {
    'Documentation API': { required: true },
    'Base de données': { required: true },
    'Variables': { required: true }
  },
  '05 - Tests': {
    'Rapport QA': { required: true },
    'Bugs': { required: true }
  },
  '06 - Livraison': {
    'Documentation': { required: true },
    'Identifiants': { required: true },
    'Guide utilisateur': { required: true }
  },
  '07 - Archives': {}
};

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const iconMap = {
    'pdf': 'fa-file-pdf',
    'zip': 'fa-file-archive',
    'rar': 'fa-file-archive',
    '7z': 'fa-file-archive',
    'fig': 'fa-file-image',
    'png': 'fa-file-image',
    'jpg': 'fa-file-image',
    'jpeg': 'fa-file-image',
    'gif': 'fa-file-image',
    'svg': 'fa-file-image',
    'sql': 'fa-file-code',
    'env': 'fa-file-code',
    'js': 'fa-file-code',
    'html': 'fa-file-code',
    'css': 'fa-file-code',
    'xlsx': 'fa-file-excel',
    'xls': 'fa-file-excel',
    'docx': 'fa-file-word',
    'doc': 'fa-file-word'
  };
  return iconMap[ext] || 'fa-file';
}

// Planning functions
function getWeekDates(offset = 0) {
  const today = new Date();
  const currentDay = today.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay; // Adjust for Sunday (0) to Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff + (offset * 7));
  monday.setHours(0, 0, 0, 0); // Set to midnight
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999); // Set to end of day
  
  // Create proper Date objects for each day
  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() + 1);
  
  const wednesday = new Date(monday);
  wednesday.setDate(monday.getDate() + 2);
  
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  
  return {
    monday,
    tuesday,
    wednesday,
    thursday,
    friday,
    start: monday,
    end: friday
  };
}

function updatePlanningHeader() {
  const weekDates = getWeekDates(currentWeekOffset);
  weekStartDate.textContent = weekDates.start.toLocaleDateString('fr-FR');
  weekEndDate.textContent = weekDates.end.toLocaleDateString('fr-FR');
  
  // Update individual day dates
  document.getElementById('monday-date').textContent = weekDates.monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  document.getElementById('tuesday-date').textContent = weekDates.tuesday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  document.getElementById('wednesday-date').textContent = weekDates.wednesday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  document.getElementById('thursday-date').textContent = weekDates.thursday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  document.getElementById('friday-date').textContent = weekDates.friday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function collectPlanningProjects() {
  planningProjects = [];
  
  allProjets.forEach(projet => {
    // Check project delivery date
    if (projet.dateLivraison) {
      planningProjects.push({
        projet,
        date: projet.dateLivraison,
        type: 'project',
        folder: null
      });
    }
    
    // Check folder delivery dates
    if (projet.folderDates) {
      Object.keys(projet.folderDates).forEach(folder => {
        if (projet.folderDates[folder]) {
          planningProjects.push({
            projet,
            date: projet.folderDates[folder],
            type: 'folder',
            folder: folder
          });
        }
      });
    }
  });
  
  // Sort by date
  planningProjects.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderPlanning() {
  const weekDates = getWeekDates(currentWeekOffset);
  const filteredProjects = filterPlanningProjects();
  
  // Clear all days
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
    document.getElementById(`${day}-projects`).innerHTML = '';
  });
  
  // Add projects to appropriate days only if they fall within the current week
  filteredProjects.forEach(item => {
    const projectDate = new Date(item.date);
    
    // Check if project date is within the current week (use timestamps for accurate comparison)
    const isWithinWeek = projectDate.getTime() >= weekDates.start.getTime() && projectDate.getTime() <= weekDates.end.getTime();
    
    if (isWithinWeek) {
      const dayOfWeek = projectDate.getDay();
      
      // Only show Monday-Friday (1-5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];
        
        const projectHtml = createPlanningProjectHtml(item);
        const container = document.getElementById(`${dayName}-projects`);
        if (container) {
          container.innerHTML += projectHtml;
        }
      }
    }
  });
}

function areAllTasksCompleted(projet, folderName = null) {
  const projectFiles = projet.files || {};
  
  if (folderName) {
    // Check specific folder
    const requiredFiles = defaultFolderStructure[folderName] || {};
    for (const fileName of Object.keys(requiredFiles)) {
      // Check if any file with this base name is uploaded
      let isUploaded = false;
      for (const [fileKey, fileData] of Object.entries(projectFiles)) {
        if (fileData.folder === folderName) {
          const baseName = fileData.filename.includes('.') 
            ? fileData.filename.substring(0, fileData.filename.lastIndexOf('.'))
            : fileData.filename;
          if (baseName === fileName) {
            isUploaded = true;
            break;
          }
        }
      }
      if (!isUploaded) return false;
    }
    return true;
  } else {
    // Check all folders
    for (const folder of Object.keys(defaultFolderStructure)) {
      const requiredFiles = defaultFolderStructure[folder] || {};
      for (const fileName of Object.keys(requiredFiles)) {
        // Check if any file with this base name is uploaded
        let isUploaded = false;
        for (const [fileKey, fileData] of Object.entries(projectFiles)) {
          if (fileData.folder === folder) {
            const baseName = fileData.filename.includes('.') 
              ? fileData.filename.substring(0, fileData.filename.lastIndexOf('.'))
              : fileData.filename;
            if (baseName === fileName) {
              isUploaded = true;
              break;
            }
          }
        }
        if (!isUploaded) return false;
      }
    }
    return true;
  }
}

function createPlanningProjectHtml(item) {
  const projet = item.projet;
  const clientName = projet.clientName || '—';
  const projectId = projet.projetId || '—';
  const folderInfo = item.folder ? `<div class="planning-project-folder">${item.folder}</div>` : '';
  
  // Check if all tasks are completed
  const isAllCompleted = areAllTasksCompleted(projet, item.folder);
  const completedClass = isAllCompleted ? 'completed' : '';
  
  // Pass folder name to task modal if it's a folder-specific event
  const modalParams = item.folder ? `'${projet.id}', '${item.folder}'` : `'${projet.id}'`;
  
  return `
    <div class="planning-project ${completedClass}" onclick="openTaskModal(${modalParams})">
      <div class="planning-project-title">${projet.nom || 'Projet sans nom'}</div>
      <div class="planning-project-id">${projectId}</div>
      <div class="planning-project-company">${clientName}</div>
      ${folderInfo}
    </div>
  `;
}

function filterPlanningProjects() {
  // Search functionality removed - return all projects
  return planningProjects;
}

function refreshPlanning() {
  collectPlanningProjects();
  renderPlanning();
}

// Task Modal Functions
function openTaskModal(projetId, folderName = null) {
  const projet = allProjets.find(p => p.id === projetId);
  if (!projet) return;
  
  // Set project info
  taskProjectName.textContent = projet.nom || 'Projet sans nom';
  taskProjectId.textContent = projet.projetId || '—';
  taskProjectClient.textContent = projet.clientName || '—';
  
  // Generate task list
  renderTaskList(projet, folderName);
  
  // Show modal
  taskModal.classList.add('visible');
}

function renderTaskList(projet, specificFolder = null) {
  const projectFiles = projet.files || {};
  let html = '';
  
  // If specific folder is provided, only show that folder
  const foldersToShow = specificFolder ? [specificFolder] : [
    '01 - Administration',
    '02 - Analyse', 
    '03 - Design',
    '04 - Développement',
    '05 - Tests',
    '06 - Livraison',
    '07 - Archives'
  ];
  
  foldersToShow.forEach(folder => {
    // Skip if folder doesn't exist in default structure
    if (!defaultFolderStructure[folder]) return;
    
    const folderFiles = {};
    
    // Get files for this folder
    Object.keys(projectFiles).forEach(fileKey => {
      const file = projectFiles[fileKey];
      if (file.folder === folder) {
        folderFiles[file.filename] = file;
      }
    });
    
    // Get required files for this folder
    const requiredFiles = defaultFolderStructure[folder] || {};
    
    if (Object.keys(requiredFiles).length > 0) {
      html += `<div class="task-folder-section">
        <div class="task-folder-title">${folder}</div>
        <ul class="task-list">`;
      
      Object.keys(requiredFiles).forEach(fileName => {
        // Check if file is uploaded (with any extension)
        let isUploaded = false;
        let uploadedFile = null;
        
        for (const [fileKey, fileData] of Object.entries(folderFiles)) {
          const baseName = fileData.filename.includes('.') 
            ? fileData.filename.substring(0, fileData.filename.lastIndexOf('.'))
            : fileData.filename;
          
          if (baseName === fileName) {
            isUploaded = true;
            uploadedFile = fileData;
            break;
          }
        }
        
        // Check if task is completed (stored in project data)
        const completedTasks = projet.completedTasks || {};
        const isCompleted = completedTasks[`${folder}|${fileName}`] || false;
        
        const taskStatusClass = isUploaded ? 'uploaded' : 'pending';
        const taskStatusText = isUploaded ? 'Uploadé' : 'En attente';
        const completedClass = isCompleted ? 'completed' : '';
        
        const uploadIcon = !isUploaded ? `
              <button class="task-upload-icon" onclick="uploadTaskFile('${projet.id}', '${folder}', '${fileName}')" title="Importer ce fichier">
                <i class="fa-solid fa-cloud-upload-alt"></i>
              </button>
            ` : `
              <div class="task-uploaded-icon" title="Fichier importé">
                <i class="fa-solid fa-check-circle"></i>
              </div>
            `;
        
        // Auto-strike text when file is uploaded
        const uploadedClass = isUploaded ? 'uploaded' : '';
        
        html += `
          <li class="task-item ${uploadedClass}">
            ${uploadIcon}
            <span class="task-label">
              ${fileName}
            </span>
            <span class="task-status ${taskStatusClass}">${taskStatusText}</span>
          </li>`;
      });
      
      html += `</ul></div>`;
    }
  });
  
  if (!html) {
    html = '<div class="empty-tasks">Aucune tâche définie pour ce projet</div>';
  }
  
  taskFolderSections.innerHTML = html;
}


// Task file upload function
function uploadTaskFile(projetId, folder, fileName) {
  const projet = allProjets.find(p => p.id === projetId);
  if (!projet) return;
  
  // Create a file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '*/*';
  fileInput.style.display = 'none';
  
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      // Show loading state
      const uploadBtn = document.querySelector(`[onclick="uploadTaskFile('${projetId}', '${folder}', '${fileName}')"]`);
      if (uploadBtn) {
        uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        uploadBtn.disabled = true;
      }
      
      // Determine file extension
      const fileExtension = file.name.includes('.') ? file.name.split('.').pop() : '';
      const fullFileName = fileExtension ? `${fileName}.${fileExtension}` : fileName;
      
      // Update project files in Firestore - metadata only
      const currentFiles = projet.files || {};
      const fileKey = `${folder}|${fullFileName}`;
      
      // Upload file to Supabase
      const filePath = `${projetId}/${folder}/${fullFileName}`;
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('project-files')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true,
          cacheControl: '3600'
        });
      
      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        throw uploadError;
      }
      
      // Update file metadata in Firestore
      currentFiles[fileKey] = {
        folder: folder,
        filename: fullFileName,
        type: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isLocal: false,
        supabasePath: filePath
      };
      
      await db.collection('projets').doc(projetId).update({ files: currentFiles });
      projet.files = currentFiles;
      
      // Refresh task modal
      renderTaskList(projet, folder);
      
      // Refresh planning if needed
      refreshPlanning();
      
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Erreur lors de l\'upload du fichier : ' + err.message, 'error');
      
      // Reset button state
      const uploadBtn = document.querySelector(`[onclick="uploadTaskFile('${projetId}', '${folder}', '${fileName}')"]`);
      if (uploadBtn) {
        uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i>';
        uploadBtn.disabled = false;
      }
    }
    
    // Clean up
    document.body.removeChild(fileInput);
  });
  
  // Add to DOM and trigger click
  document.body.appendChild(fileInput);
  fileInput.click();
}

function renderFileTree(files) {
  const tree = document.getElementById('projet-file-tree');
  let html = '';
  
  Object.keys(defaultFolderStructure).forEach(folder => {
    // Get files for this folder from flattened structure
    const folderFiles = {};
    Object.keys(files).forEach(key => {
      const file = files[key];
      if (file.folder === folder) {
        folderFiles[file.filename] = file;
      }
    });
    
    const hasFiles = Object.keys(folderFiles).length > 0;
    
    // Get folder delivery date (except for Archives)
    const folderDates = currentPageProjet.folderDates || {};
    let deliveryDate = folderDates[folder];
    const isArchiveFolder = folder === '07 - Archives';
    const isLivraisonFolder = folder === '06 - Livraison';
    
    // For Livraison folder, use project's delivery date if no specific date is set
    if (isLivraisonFolder && !deliveryDate && currentPageProjet.dateLivraison) {
      deliveryDate = currentPageProjet.dateLivraison;
    }
    
    const deliveryDateDisplay = deliveryDate ? new Date(deliveryDate).toLocaleDateString('fr-FR') : '';
    
    const folderActions = isArchiveFolder ? '' : `
      <div class="tree-node-actions">
        <button onclick="openFolderDateModal('${folder}')" title="Définir la date de livraison">
          <i class="fa-solid fa-calendar"></i>
        </button>
      </div>
    `;
    
    html += `<div class="tree-node ${hasFiles ? 'expanded' : 'empty'}" data-folder="${folder}">
      <div class="tree-node-content">
        <i class="fa-solid ${hasFiles ? 'fa-folder-open' : 'fa-folder'}"></i>
        <span>${folder}</span>
        ${!isArchiveFolder && deliveryDateDisplay ? `<span class="folder-date">${deliveryDateDisplay}</span>` : ''}
        ${folderActions}
      </div>
      <div class="tree-children">`;
    
    // Add required files (even if not uploaded yet)
    Object.keys(defaultFolderStructure[folder]).forEach(file => {
      const fileInfo = defaultFolderStructure[folder][file];
      
      // Check if file is uploaded (with any extension)
      let uploaded = null;
      for (const [fileKey, fileData] of Object.entries(folderFiles)) {
        // Remove extension to compare with required file name
        const baseName = fileData.filename.includes('.') 
          ? fileData.filename.substring(0, fileData.filename.lastIndexOf('.'))
          : fileData.filename;
        
        if (baseName === file) {
          uploaded = fileData;
          break;
        }
      }
      
      const icon = uploaded ? getFileIcon(uploaded.filename) : getFileIcon(file + '.pdf'); // Default icon
      
      html += `<div class="tree-node">
        <div class="tree-node-content">
          <i class="fa-solid ${icon}"></i>
          <span>${file}${uploaded ? '' : ' <em style="color:var(--muted);font-size:0.75em;">(manquant)</em>'}</span>
          <div class="tree-node-actions">`;
      
      if (uploaded) {
        html += `<button onclick="downloadFile('${folder}', '${uploaded.filename}')" title="Télécharger">
          <i class="fa-solid fa-download"></i>
        </button>
        <button onclick="editFile('${folder}', '${uploaded.filename}')" title="Modifier">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="deleteFile('${folder}', '${uploaded.filename}')" title="Supprimer">
          <i class="fa-solid fa-trash"></i>
        </button>`;
      } else {
        html += `<button onclick="uploadRequiredFile('${folder}', '${file}')" title="Ajouter ce fichier obligatoire">
          <i class="fa-solid fa-plus"></i>
        </button>`;
      }
      
      html += `</div>
        </div>
      </div>`;
    });
    
    // Add additional uploaded files not in required list
    Object.keys(folderFiles).forEach(file => {
      const fileData = folderFiles[file];
      
      // Check if this is a required file (by comparing base name without extension)
      const baseName = fileData.filename.includes('.') 
        ? fileData.filename.substring(0, fileData.filename.lastIndexOf('.'))
        : fileData.filename;
      
      const isRequired = defaultFolderStructure[folder].hasOwnProperty(baseName);
      
      if (!isRequired) {
        const icon = getFileIcon(fileData.filename);
        html += `<div class="tree-node">
          <div class="tree-node-content">
            <i class="fa-solid ${icon}"></i>
            <span>${fileData.filename}</span>
            <div class="tree-node-actions">
              <button onclick="downloadFile('${folder}', '${fileData.filename}')" title="Télécharger">
                <i class="fa-solid fa-download"></i>
              </button>
              <button onclick="editFile('${folder}', '${fileData.filename}')" title="Modifier">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button onclick="deleteFile('${folder}', '${fileData.filename}')" title="Supprimer">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>`;
      }
    });
    
    html += `</div>
    </div>`;
  });
  
  tree.innerHTML = html;
  
  // Add folder toggle functionality
  tree.querySelectorAll('.tree-node[data-folder] > .tree-node-content').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.tree-node-actions')) return;
      const node = header.parentElement;
      const icon = header.querySelector('i');
      const isExpanded = node.classList.contains('expanded');
      
      if (isExpanded) {
        node.classList.remove('expanded');
        node.classList.add('empty');
        icon.classList.remove('fa-folder-open');
        icon.classList.add('fa-folder');
      } else {
        node.classList.remove('empty');
        node.classList.add('expanded');
        icon.classList.remove('fa-folder');
        icon.classList.add('fa-folder-open');
      }
    });
  });
}

function renderProjetPageFiles(projet) {
  const files = projet.files || {};
  
  // Clear the file tree container first
  const tree = document.getElementById('projet-file-tree');
  if (tree) {
    tree.innerHTML = '';
  }
  
  // Re-render the file tree
  renderFileTree(files);
  
  // Force a reflow to ensure DOM updates
  if (tree) {
    tree.style.display = 'none';
    tree.offsetHeight; // Trigger reflow
    tree.style.display = '';
  }
}

// File upload modal
function openFileUploadModal(folder = '01 - Administration', filename = '') {
  fileUploadFolder.value = folder;
  fileUploadInput.value = '';
  fileUploadName.value = filename;
  fileUploadError.textContent = '';
  
  // Update modal title for editing
  const modalTitle = fileUploadModal.querySelector('h2');
  if (filename) {
    modalTitle.textContent = 'Modifier un fichier';
    fileUploadName.disabled = true; // Don't allow renaming required files
  } else {
    modalTitle.textContent = 'Ajouter un fichier';
    fileUploadName.disabled = false;
  }
  
  fileUploadModal.classList.add('visible');
}

// General add file button
document.getElementById('btn-add-file').addEventListener('click', () => {
  openFileUploadModal();
});

fileUploadClose.addEventListener('click', () => fileUploadModal.classList.remove('visible'));
fileUploadModal.addEventListener('click', e => {
  if (e.target === fileUploadModal) fileUploadModal.classList.remove('visible');
});

// Folder date modal functions
function openFolderDateModal(folder) {
  folderDateName.value = folder;
  const folderDates = currentPageProjet.folderDates || {};
  let currentDeliveryDate = folderDates[folder] || '';
  
  // For Livraison folder, default to project delivery date if no specific date is set
  if (folder === '06 - Livraison' && !currentDeliveryDate && currentPageProjet.dateLivraison) {
    currentDeliveryDate = currentPageProjet.dateLivraison;
  }
  
  folderDateInput.value = currentDeliveryDate;
  folderDateError.textContent = '';
  folderDateModal.classList.add('visible');
}

folderDateClose.addEventListener('click', () => folderDateModal.classList.remove('visible'));
folderDateModal.addEventListener('click', e => {
  if (e.target === folderDateModal) folderDateModal.classList.remove('visible');
});

folderDateSubmit.addEventListener('click', async () => {
  const folder = folderDateName.value;
  const deliveryDate = folderDateInput.value;
  
  if (!deliveryDate) {
    folderDateError.textContent = 'Veuillez sélectionner une date de livraison.';
    return;
  }
  
  try {
    const folderDates = currentPageProjet.folderDates || {};
    folderDates[folder] = deliveryDate;
    
    await db.collection('projets').doc(currentPageProjet.id).update({ folderDates });
    currentPageProjet.folderDates = folderDates;
    
    renderProjetPageFiles(currentPageProjet);
    refreshPlanning(); // Update planning when folder date is set
    folderDateModal.classList.remove('visible');
  } catch (err) {
    console.error(err);
    folderDateError.textContent = 'Erreur lors de l\'enregistrement de la date.';
  }
});

// Planning event listeners
if (planningPrevWeek) {
  planningPrevWeek.addEventListener('click', () => {
    currentWeekOffset--;
    updatePlanningHeader();
    renderPlanning();
  });
}

if (planningNextWeek) {
  planningNextWeek.addEventListener('click', () => {
    currentWeekOffset++;
    updatePlanningHeader();
    renderPlanning();
  });
}

if (planningToday) {
  planningToday.addEventListener('click', () => {
    currentWeekOffset = 0;
    updatePlanningHeader();
    renderPlanning();
  });
}

// Task modal event listeners
taskModalClose.addEventListener('click', () => taskModal.classList.remove('visible'));
taskModalCloseBtn.addEventListener('click', () => taskModal.classList.remove('visible'));
taskModal.addEventListener('click', e => {
  if (e.target === taskModal) taskModal.classList.remove('visible');
});

fileUploadSubmit.addEventListener('click', async () => {
  const file = fileUploadInput.files[0];
  if (!file) {
    fileUploadError.textContent = 'Veuillez sélectionner un fichier.';
    return;
  }
  
  const folder = fileUploadFolder.value;
  let customName = fileUploadName.value.trim();
  
  // If customName is provided (for required files), add the file extension
  if (customName && !customName.includes('.')) {
    const ext = file.name.split('.').pop();
    customName = `${customName}.${ext}`;
  } else if (!customName) {
    customName = file.name;
  }
  const isEditing = fileUploadModal.querySelector('h2').textContent === 'Modifier un fichier';
  
  try {
    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      
      // Update project files in Firestore - metadata only
      const currentFiles = currentPageProjet.files || {};
      const fileKey = `${folder}|${customName}`;
      
      // Upload file to Supabase - use public bucket approach
      const filePath = `${currentPageProjet.id}/${folder}/${customName}`;
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('project-files')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true,
          cacheControl: '3600'
        });
      
      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        
        // Check if it's an RLS policy error and provide fallback
        if (uploadError.message && uploadError.message.includes('row-level security')) {
          console.log('RLS Policy Error: Using localStorage fallback');
          
          // Fallback to localStorage
          try {
            const reader = new FileReader();
            reader.onload = async (e) => {
              const base64 = e.target.result;
              
              // Store in localStorage as fallback
              const storageKey = `project_files_${currentPageProjet.id}`;
              let storedFiles = JSON.parse(localStorage.getItem(storageKey) || '{}');
              const fileKey = `${folder}|${customName}`;
              
              storedFiles[fileKey] = {
                folder: folder,
                filename: customName,
                type: file.type,
                size: file.size,
                base64: base64,
                uploadedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isLocal: true
              };
              
              localStorage.setItem(storageKey, JSON.stringify(storedFiles));
              
              // Update metadata in Firestore without Supabase path
              currentFiles[fileKey] = {
                folder: folder,
                filename: customName,
                type: file.type,
                size: file.size,
                uploadedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isLocal: true
              };
              
              await db.collection('projets').doc(currentPageProjet.id).update({ files: currentFiles });
              currentPageProjet.files = currentFiles;
              
              // Real-time refresh
              renderProjetPageFiles(currentPageProjet);
              refreshPlanning();
              
              // Force UI update
              setTimeout(() => {
                renderProjetPageFiles(currentPageProjet);
              }, 500);
              
              fileUploadModal.classList.remove('visible');
            };
            reader.readAsDataURL(file);
          } catch (localErr) {
            console.error('LocalStorage fallback failed:', localErr);
            fileUploadError.textContent = 'Erreur : Supabase et localStorage indisponibles.';
          }
          return;
        } else {
          fileUploadError.textContent = 'Erreur lors de l\'upload sur Supabase.';
        }
        return;
      }
      
      // Store only metadata in Firestore
      currentFiles[fileKey] = {
        folder: folder,
        filename: customName,
        type: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        supabasePath: filePath
      };
      
      await db.collection('projets').doc(currentPageProjet.id).update({ files: currentFiles });
      currentPageProjet.files = currentFiles;
      
      // Real-time refresh
      renderProjetPageFiles(currentPageProjet);
      refreshPlanning();
      
      // Force UI update
      setTimeout(() => {
        renderProjetPageFiles(currentPageProjet);
      }, 500);
      
      fileUploadModal.classList.remove('visible');
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error(err);
    fileUploadError.textContent = 'Erreur lors de l\'upload du fichier.';
  }
});

// Edit file function
function editFile(folder, filename) {
  openFileUploadModal(folder, filename);
}

// Upload required file function
function uploadRequiredFile(folder, filename) {
  // Open modal with predefined filename and trigger file selection
  openFileUploadModal(folder, filename);
  // Trigger file input click
  setTimeout(() => {
    fileUploadInput.click();
  }, 100);
}

// Download file
async function downloadFile(folder, filename) {
  const fileKey = `${folder}|${filename}`;
  const file = currentPageProjet.files[fileKey];
  if (!file) return;
  
  try {
    let data;
    
    if (file.isLocal) {
      // Get from localStorage
      const storageKey = `project_files_${currentPageProjet.id}`;
      const storedFiles = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const storedFile = storedFiles[fileKey];
      
      if (!storedFile || !storedFile.base64) {
        showToast('Fichier local non trouvé.', 'error');
        return;
      }
      
      // Convert base64 to blob
      const response = await fetch(storedFile.base64);
      data = await response.blob();
    } else if (file.supabasePath) {
      // Get from Supabase
      const { data: supabaseData, error } = await supabaseClient.storage
        .from('project-files')
        .download(file.supabasePath);
      
      if (error) {
        console.error(error);
        showToast('Erreur lors du téléchargement du fichier depuis Supabase.', 'error');
        return;
      }
      data = supabaseData;
    } else {
      showToast('Fichier non trouvé (ni local ni sur Supabase).', 'error');
      return;
    }
    
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    showToast('Erreur lors du téléchargement du fichier.', 'error');
  }
}

// Delete file
async function deleteFile(folder, filename) {
  const confirmed = await appConfirm(
    `Voulez-vous vraiment supprimer le fichier "${filename}" ?`,
    { title: 'Supprimer le fichier', confirmLabel: 'Supprimer', cancelLabel: 'Annuler', icon: 'fa-trash' }
  );
  if (!confirmed) return;
  
  try {
    const currentFiles = currentPageProjet.files || {};
    const fileKey = `${folder}|${filename}`;
    const file = currentFiles[fileKey];
    
    // Remove from Supabase storage
    if (file) {
      // Build Supabase path if not stored
      const supabasePath = file.supabasePath || `${currentPageProjet.id}/${folder}/${filename}`;
      
      const { error } = await supabaseClient.storage
        .from('project-files')
        .remove([supabasePath]);
      
      if (error) {
        console.error('Supabase delete error:', error);
      }
    }
    
    delete currentFiles[fileKey];
    
    await db.collection('projets').doc(currentPageProjet.id).update({ files: currentFiles });
    currentPageProjet.files = currentFiles;
    
    renderProjetPageFiles(currentPageProjet);
    refreshPlanning(); // Update planning if needed
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Erreur lors de la suppression du fichier : ' + err.message, 'error');
  }
}

// Download project as ZIP
async function downloadProjectAsZip(projet) {
  const confirmed = await appConfirm(
    'Ce projet va être marqué comme livré. Voulez-vous télécharger l\'archive complète des fichiers avant ?',
    { title: 'Livraison du projet', confirmLabel: 'Télécharger', cancelLabel: 'Annuler', icon: 'fa-box-archive' }
  );
  if (!confirmed) return false;

  try {
    const files = projet.files || {};
    if (Object.keys(files).length === 0) {
      showToast('Ce projet ne contient aucun fichier à télécharger.', 'info');
      return true; // Continue with status change even if no files
    }

    // Build a flat list of files to download
    const downloadTasks = [];
    const missingFiles = [];

    Object.keys(defaultFolderStructure).forEach(folder => {
      Object.keys(files).forEach(key => {
        const file = files[key];
        if (file.folder === folder) {
          if (file.supabasePath) {
            downloadTasks.push({ folder, filename: file.filename, path: file.supabasePath });
          } else {
            missingFiles.push(`${folder}: ${file.filename}`);
          }
        }
      });
    });

    const zip = new JSZip();
    const total = downloadTasks.length;

    showDownloadProgress('Téléchargement de l\'archive');

    if (total === 0) {
      updateDownloadProgress(100, 'Aucun fichier disponible');
    }

    let completed = 0;
    let failed = 0;

    // Download files and track progress as each completes
    await Promise.all(downloadTasks.map(async task => {
      try {
        const { data, error } = await supabaseClient.storage
          .from('project-files')
          .download(task.path);

        if (!error && data) {
          zip.folder(task.folder).file(task.filename, data);
        } else {
          failed++;
          console.error(`Failed to download ${task.filename}:`, error);
        }
      } catch (err) {
        failed++;
        console.error(`Failed to download ${task.filename}:`, err);
      } finally {
        completed++;
        // Reserve last 10% for ZIP generation
        const percent = (completed / total) * 90;
        updateDownloadProgress(percent, `Téléchargement ${completed}/${total} — ${task.filename}`);
      }
    }));

    // Generate ZIP with progress
    updateDownloadProgress(92, 'Création de l\'archive ZIP…');
    const zipBlob = await zip.generateAsync({ type: 'blob' }, metadata => {
      const percent = 90 + (metadata.percent * 0.1);
      updateDownloadProgress(percent, 'Compression des fichiers…');
    });

    updateDownloadProgress(100, 'Téléchargement terminé');

    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${projet.nom || 'projet'}_${projet.projetId || projet.id}_archive.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);

    // Hide progress shortly after completion
    setTimeout(hideDownloadProgress, 600);

    // Toast feedback
    if (failed > 0) {
      showToast(`${total - failed}/${total} fichiers inclus. ${failed} échec(s) de téléchargement.`, 'error', 'Archive incomplète');
    } else if (missingFiles.length > 0) {
      showToast(`Archive téléchargée.\nFichiers non uploadés :\n${missingFiles.join('\n')}`, 'info', 'Archive téléchargée');
    } else {
      showToast('Tous les fichiers ont été inclus dans l\'archive.', 'success', 'Archive téléchargée');
    }

    return true;
  } catch (err) {
    console.error(err);
    hideDownloadProgress();
    showToast('Erreur lors de la création de l\'archive ZIP : ' + err.message, 'error');
    return false;
  }
}

// Clear project files from Supabase and Firestore
async function clearProjectFiles(projectId) {
  try {
    const projet = allProjets.find(p => p.id === projectId);
    if (!projet?.files) return;
    
    // Delete all files from Supabase
    const filesToDelete = Object.values(projet.files)
      .filter(file => file.supabasePath)
      .map(file => file.supabasePath);
    
    if (filesToDelete.length > 0) {
      const { error } = await supabaseClient.storage
        .from('project-files')
        .remove(filesToDelete);
      
      if (error) {
        console.error('Error deleting files from Supabase:', error);
      }
    }
    
    // Clear files from Firestore
    await db.collection('projets').doc(projectId).update({ files: {} });
    projet.files = {};
    
    // Update UI if this is the current project
    if (currentPageProjet?.id === projectId) {
      currentPageProjet.files = {};
      renderProjetPageFiles(currentPageProjet);
    }
  } catch (err) {
    console.error('Error clearing project files:', err);
  }
}

// ===== Team management section =====
const userModal = document.getElementById('user-modal');
const userModalClose = document.getElementById('user-modal-close');
const userForm = document.getElementById('form-user');
const userModalTitle = document.getElementById('user-modal-title');
const userModalSubmit = document.getElementById('user-modal-submit');
const userModalError = document.getElementById('user-modal-error');
const userIdInput = document.getElementById('user-id');
const userPrenomInput = document.getElementById('user-prenom');
const userNomInput = document.getElementById('user-nom');
const userEmailInput = document.getElementById('user-email');
const userRoleInput = document.getElementById('user-role');
const userStatutInput = document.getElementById('user-statut');
const equipeSearch = document.getElementById('equipe-search');
const equipeTableBody = document.getElementById('equipe-table-body');
const btnCreateUser = document.getElementById('btn-create-user');

let allUsers = [];

const statusClasses = {
  'Actif': 'actif',
  'Inactif': 'inactif',
  'En congés': 'en-conges'
};

const roleClasses = {
  'Manager': 'manager',
  'Développeur': 'developpeur',
  'Designer Graphique': 'designer'
};

function isManager() {
  return currentUserRole === 'Manager';
}

function userClassSlug(text, map) {
  const key = Object.keys(map).find(k => k.toLowerCase() === (text || '').toLowerCase());
  return map[key] || '';
}

function renderEquipeTable(users = allUsers) {
  if (!equipeTableBody) return;

  if (users.length === 0) {
    equipeTableBody.innerHTML = `<tr><td colspan="5" class="empty">Aucun membre dans l'équipe.</td></tr>`;
    return;
  }

  equipeTableBody.innerHTML = users.map(u => {
    const role = u.role || 'Autre';
    const status = u.status || 'Actif';
    const roleClass = userClassSlug(role, roleClasses);
    const statusClass = userClassSlug(status, statusClasses);
    const isCurrentUser = u.uid === currentUserProfile?.uid;

    return `
      <tr data-uid="${u.uid || ''}">
        <td>${u.displayName || '—'}</td>
        <td>${u.email || '—'}</td>
        <td><span class="role-badge ${roleClass}">${role}</span></td>
        <td><span class="status-badge ${statusClass}">${status}</span></td>
        <td>
          <div class="actions">
            <button class="btn-icon" onclick="editUser('${u.uid}')" title="Modifier">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button class="btn-icon" onclick="resetUserPassword('${u.email}')" title="Réinitialiser le mot de passe">
              <i class="fa-solid fa-key"></i>
            </button>
            <button class="btn-icon btn-icon-danger" onclick="deleteUser('${u.uid}')" title="Supprimer" ${isCurrentUser ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openUserModal(user = null) {
  if (!isManager()) {
    showToast('Accès réservé aux managers.', 'error');
    return;
  }

  userModalError.textContent = '';
  if (user) {
    userModalTitle.textContent = 'Modifier un membre';
    userModalSubmit.textContent = 'Enregistrer';
    userIdInput.value = user.uid || '';
    const names = (user.displayName || '').split(' ');
    userPrenomInput.value = user.prenom || names[0] || '';
    userNomInput.value = user.nom || names.slice(1).join(' ') || '';
    userEmailInput.value = user.email || '';
    userEmailInput.disabled = true;
    userRoleInput.value = user.role || 'Autre';
    userStatutInput.value = user.status || 'Actif';
  } else {
    userModalTitle.textContent = 'Ajouter un membre';
    userModalSubmit.textContent = 'Créer';
    userForm.reset();
    userIdInput.value = '';
    userEmailInput.disabled = false;
  }
  userModal.classList.add('visible');
}

function closeUserModal() {
  userModal.classList.remove('visible');
}

async function createUser(email, password, displayName, prenom, nom, role, status) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({ displayName });
  await db.collection('users').doc(cred.user.uid).set({
    email,
    displayName,
    prenom,
    nom,
    role,
    status,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return cred.user.uid;
}

async function updateUser(uid, data) {
  await db.collection('users').doc(uid).update(data);
  if (data.displayName && auth.currentUser?.uid === uid) {
    await auth.currentUser.updateProfile({ displayName: data.displayName });
  }
}

userModalClose.addEventListener('click', closeUserModal);
userModal.addEventListener('click', e => {
  if (e.target === userModal) closeUserModal();
});

btnCreateUser?.addEventListener('click', () => openUserModal());

userForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!isManager()) {
    showToast('Accès réservé aux managers.', 'error');
    return;
  }

  userModalError.textContent = '';
  const prenom = userPrenomInput.value.trim();
  const nom = userNomInput.value.trim();
  const displayName = `${prenom} ${nom}`.trim();
  const email = userEmailInput.value.trim().toLowerCase();
  const role = userRoleInput.value;
  const status = userStatutInput.value;
  const uid = userIdInput.value;

  userModalSubmit.disabled = true;
  const originalText = userModalSubmit.textContent;
  userModalSubmit.textContent = 'Enregistrement…';

  try {
    if (uid) {
      // Edit existing user
      const updateData = {
        displayName,
        prenom,
        nom,
        role,
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await updateUser(uid, updateData);
      showToast('Membre mis à jour avec succès.', 'success');
    } else {
      // Create new user
      const password = 'Karbonn2024!';
      const newUid = await createUser(email, password, displayName, prenom, nom, role, status);
      showToast('Membre créé avec succès. Mot de passe temporaire : Karbonn2024!', 'success', 'Membre créé', 7000);
    }
    closeUserModal();
    await loadTeamMembers();
  } catch (err) {
    console.error(err);
    let msg = err.message || 'Erreur lors de l\'enregistrement.';
    if (err.code === 'auth/email-already-in-use') msg = 'Cette adresse email est déjà utilisée.';
    if (err.code === 'auth/invalid-email') msg = 'Adresse email invalide.';
    userModalError.textContent = msg;
  } finally {
    userModalSubmit.disabled = false;
    userModalSubmit.textContent = originalText;
  }
});

async function editUser(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  openUserModal(user);
}

async function deleteUser(uid) {
  if (!isManager()) {
    showToast('Accès réservé aux managers.', 'error');
    return;
  }
  if (uid === auth.currentUser?.uid) {
    showToast('Vous ne pouvez pas supprimer votre propre compte.', 'error');
    return;
  }

  const user = allUsers.find(u => u.uid === uid);
  const confirmed = await appConfirm(
    `Supprimer le compte de ${user?.displayName || uid} ? Cette action est irréversible.`,
    { title: 'Supprimer un membre', confirmLabel: 'Supprimer', cancelLabel: 'Annuler', icon: 'fa-trash' }
  );
  if (!confirmed) return;

  try {
    await db.collection('users').doc(uid).delete();
    showToast('Membre supprimé avec succès.', 'success');
    await loadTeamMembers();
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la suppression du membre.', 'error');
  }
}

async function resetUserPassword(email) {
  if (!isManager()) {
    showToast('Accès réservé aux managers.', 'error');
    return;
  }
  if (!email) {
    showToast('Aucune adresse email associée.', 'error');
    return;
  }

  const confirmed = await appConfirm(
    `Envoyer un email de réinitialisation de mot de passe à ${email} ?`,
    { title: 'Réinitialiser le mot de passe', confirmLabel: 'Envoyer', cancelLabel: 'Annuler', icon: 'fa-key' }
  );
  if (!confirmed) return;

  try {
    await auth.sendPasswordResetEmail(email);
    showToast('Email de réinitialisation envoyé.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de l\'envoi de l\'email : ' + err.message, 'error');
  }
}

equipeSearch?.addEventListener('input', () => {
  const query = equipeSearch.value.toLowerCase().trim();
  if (!query) {
    renderEquipeTable(allUsers);
    return;
  }
  const filtered = allUsers.filter(u =>
    (u.displayName || '').toLowerCase().includes(query) ||
    (u.email || '').toLowerCase().includes(query) ||
    (u.role || '').toLowerCase().includes(query) ||
    (u.status || '').toLowerCase().includes(query)
  );
  renderEquipeTable(filtered);
});

// ===========================
// Facturation & Devis
// ===========================

const facturationModal = document.getElementById('facturation-modal');
const facturationModalTitle = document.getElementById('facturation-modal-title');
const facturationModalClose = document.getElementById('facturation-modal-close');
const facturationModalSubmit = document.getElementById('facturation-modal-submit');
const facturationModalError = document.getElementById('facturation-modal-error');
const facturationForm = document.getElementById('form-facturation');
const facturationTypeInput = document.getElementById('facturation-type');
const facturationClientSelect = document.getElementById('facturation-client');
const facturationContactSelect = document.getElementById('facturation-contact');
const facturationContactGroup = document.getElementById('facturation-contact-group');
const facturationEsignatureGroup = document.getElementById('facturation-esignature-group');
const facturationEsignature = document.getElementById('facturation-esignature');
const facturationTitleInput = document.getElementById('facturation-title');
const facturationPaymentDelay = document.getElementById('facturation-payment-delay');
const facturationFinalize = document.getElementById('facturation-finalize');
const facturationLinesContainer = document.getElementById('facturation-lines');
const btnAddLine = document.getElementById('btn-add-line');
const btnCreateDevis = document.getElementById('btn-create-devis');
const btnCreateFacture = document.getElementById('btn-create-facture');
const btnSyncAllClients = document.getElementById('btn-sync-all-clients');
const facturationTableBody = document.getElementById('facturation-table-body');
const facturationSearch = document.getElementById('facturation-search');
const facturationFilters = document.querySelectorAll('.facturation-filter');

let allBillings = [];
let currentBillingFilter = 'all';

function renderClientOptions() {
  if (!facturationClientSelect) return;
  facturationClientSelect.innerHTML = '<option value="">Sélectionner un client...</option>';
  allClients.forEach(client => {
    const label = client.type === 'professionnel'
      ? `${client.entreprise || ''} (${client.prenom || ''} ${client.nom || ''})`.trim()
      : `${client.prenom || ''} ${client.nom || ''}`.trim();
    const option = document.createElement('option');
    option.value = client.id;
    option.textContent = label || client.email || client.id;
    option.dataset.abbyId = client.abbyCustomerId || '';
    option.dataset.abbyContactId = client.abbyContactId || '';
    option.dataset.clientType = client.type || 'particulier';
    facturationClientSelect.appendChild(option);
  });
}

function updateContactSelect() {
  if (!facturationClientSelect) return;
  const selected = facturationClientSelect.options[facturationClientSelect.selectedIndex];
  const isPro = selected?.dataset.clientType === 'professionnel';
  const contactId = selected?.dataset.abbyContactId || '';
  const billingType = facturationTypeInput?.value;

  if (isPro && billingType === 'estimate') {
    if (facturationContactGroup) facturationContactGroup.style.display = '';
    if (facturationEsignatureGroup) facturationEsignatureGroup.style.display = '';
    if (facturationContactSelect) {
      facturationContactSelect.innerHTML = contactId
        ? `<option value="${contactId}">${selected.textContent}</option>`
        : '<option value="">Aucun contact lié — re-synchronisez ce client</option>';
    }
  } else {
    if (facturationContactGroup) facturationContactGroup.style.display = 'none';
    if (facturationEsignatureGroup) facturationEsignatureGroup.style.display = 'none';
  }
}

function createLineRow(line = {}) {
  const div = document.createElement('div');
  div.className = 'facturation-line';
  div.innerHTML = `
    <input type="text" class="line-designation" placeholder="Désignation" value="${line.designation || ''}" required />
    <input type="number" class="line-quantity" placeholder="Qté" value="${line.quantity || 1}" min="1" step="any" required />
    <input type="number" class="line-unit-price" placeholder="Prix HT" value="${line.unitPrice || ''}" min="0" step="0.01" required />
    <select class="line-vat-code">
      <option value="FR_2000" ${line.vatCode === 'FR_2000' ? 'selected' : ''}>20%</option>
      <option value="FR_1000" ${line.vatCode === 'FR_1000' ? 'selected' : ''}>10%</option>
      <option value="FR_550" ${line.vatCode === 'FR_550' ? 'selected' : ''}>5.5%</option>
      <option value="FR_00HT" ${line.vatCode === 'FR_00HT' ? 'selected' : ''}>0%</option>
    </select>
    <select class="line-unit">
      <option value="14" ${line.quantityUnit === 14 ? 'selected' : ''}>Unité</option>
      <option value="1" ${line.quantityUnit === 1 ? 'selected' : ''}>Heure</option>
      <option value="2" ${line.quantityUnit === 2 ? 'selected' : ''}>Jour</option>
      <option value="3" ${line.quantityUnit === 3 ? 'selected' : ''}>Mois</option>
      <option value="22" ${line.quantityUnit === 22 ? 'selected' : ''}>Forfait</option>
    </select>
    <button type="button" class="btn-remove-line"><i class="fa-solid fa-trash"></i></button>
  `;
  div.querySelector('.btn-remove-line').addEventListener('click', () => div.remove());
  return div;
}

function openFacturationModal(type) {
  if (!isManager()) {
    showToast('Accès réservé aux managers.', 'error');
    return;
  }
  facturationTypeInput.value = type;
  facturationModalTitle.textContent = type === 'estimate' ? 'Nouveau devis' : 'Nouvelle facture';
  facturationTitleInput.value = '';
  facturationPaymentDelay.value = 'thirty_days';
  facturationFinalize.checked = false;
  facturationModalError.textContent = '';
  renderClientOptions();
  if (facturationContactGroup) facturationContactGroup.style.display = 'none';
  if (facturationEsignatureGroup) facturationEsignatureGroup.style.display = 'none';
  if (facturationEsignature) facturationEsignature.checked = true;
  facturationLinesContainer.innerHTML = '';
  facturationLinesContainer.appendChild(createLineRow());
  requestAnimationFrame(() => facturationModal.classList.add('visible'));
}

function closeFacturationModal() {
  facturationModal.classList.remove('visible');
}

facturationModal?.addEventListener('click', e => {
  if (e.target === facturationModal) closeFacturationModal();
});

facturationClientSelect?.addEventListener('change', updateContactSelect);

function getBillingLines() {
  const rows = facturationLinesContainer.querySelectorAll('.facturation-line');
  return Array.from(rows).map(row => ({
    designation: row.querySelector('.line-designation').value.trim(),
    quantity: Number(row.querySelector('.line-quantity').value),
    unitPrice: Number(row.querySelector('.line-unit-price').value),
    vatCode: row.querySelector('.line-vat-code').value,
    quantityUnit: Number(row.querySelector('.line-unit').value),
    type: 1,
  })).filter(line => line.designation && line.quantity > 0 && line.unitPrice >= 0);
}

async function handleCreateBilling(e) {
  e.preventDefault();
  if (!isManager()) return;
  if (!API_BASE_URL) {
    facturationModalError.textContent = 'URL du backend non configurée. Voir README-ABBY.md.';
    return;
  }

  const type = facturationTypeInput.value;
  const clientId = facturationClientSelect.value;
  const selectedOption = facturationClientSelect.options[facturationClientSelect.selectedIndex];
  const abbyCustomerId = selectedOption?.dataset.abbyId;
  const abbyContactId = facturationContactSelect?.value || '';
  const isPro = selectedOption?.dataset.clientType === 'professionnel';
  const withElectronicSignature = isPro && type === 'estimate' && (facturationEsignature?.checked ?? true);

  if (!clientId) {
    facturationModalError.textContent = 'Veuillez sélectionner un client.';
    return;
  }

  if (!abbyCustomerId) {
    facturationModalError.textContent = 'Ce client n\'est pas encore synchronisé avec Abby. Créez d\'abord le client dans la section Clients.';
    return;
  }

  if (isPro && type === 'estimate' && !abbyContactId) {
    facturationModalError.textContent = 'Ce client professionnel n\'a pas de contact Abby lié. Re-synchronisez ce client d\'abord.';
    return;
  }

  const lines = getBillingLines();
  if (lines.length === 0) {
    facturationModalError.textContent = 'Veuillez ajouter au moins une ligne valide.';
    return;
  }

  facturationModalSubmit.disabled = true;
  facturationModalSubmit.textContent = 'Création...';

  try {
    const endpoint = type === 'estimate' ? '/api/create-estimate' : '/api/create-invoice';
    const data = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        clientId,
        abbyCustomerId,
        abbyContactId: abbyContactId || undefined,
        title: facturationTitleInput.value.trim(),
        paymentDelay: facturationPaymentDelay.value,
        lines,
        finalize: facturationFinalize.checked,
        withElectronicSignature,
      }),
    });

    showToast(`${type === 'estimate' ? 'Devis' : 'Facture'} créé(e) avec succès.`, 'success');
    closeFacturationModal();
    loadBillings();
  } catch (err) {
    console.error('Create billing error:', err);
    let message = err.message || 'Erreur lors de la création.';
    if (err.details) {
      const d = err.details;
      const extra = Array.isArray(d.message)
        ? d.message.join(' — ')
        : (typeof d.message === 'string' ? d.message : (d.error || JSON.stringify(d)));
      if (extra && extra !== message) message += ` (${extra})`;
    }
    facturationModalError.textContent = message;
  } finally {
    facturationModalSubmit.disabled = false;
    facturationModalSubmit.textContent = 'Créer';
  }
}

function formatAmount(amount) {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount / 100);
}

function getStatusLabel(status) {
  const labels = {
    draft: 'Brouillon',
    finalized: 'Finalisé',
    signed: 'Signé',
    refused: 'Refusé',
    paid: 'Payé',
  };
  return labels[status] || status;
}

function getBillingActions(billing) {
  const actions = [];
  const id = billing.abbyBillingId;

  if (billing.status === 'draft') {
    actions.push(`<button class="action-btn" onclick="finalizeBilling('${id}')" title="Finaliser"><i class="fa-solid fa-check-double"></i></button>`);
  }

  if (billing.type === 'estimate') {
    if (billing.status === 'finalized') {
      actions.push(`<button class="action-btn" onclick="sendBilling('${id}')" title="Envoyer par email"><i class="fa-solid fa-paper-plane"></i></button>`);
      actions.push(`<button class="action-btn" onclick="activateEsignature('${id}')" title="Activer signature électronique"><i class="fa-solid fa-signature"></i></button>`);
      actions.push(`<button class="action-btn" onclick="signBilling('${id}')" title="Marquer comme signé"><i class="fa-solid fa-pen-nib"></i></button>`);
      actions.push(`<button class="action-btn" onclick="refuseBilling('${id}')" title="Marquer comme refusé"><i class="fa-solid fa-ban"></i></button>`);
    }
    if (billing.status === 'signed') {
      actions.push(`<button class="action-btn" onclick="unsignBilling('${id}')" title="Annuler la signature"><i class="fa-solid fa-rotate-left"></i></button>`);
    }
    if (billing.status === 'refused') {
      actions.push(`<button class="action-btn" onclick="unrefuseBilling('${id}')" title="Annuler le refus"><i class="fa-solid fa-rotate-left"></i></button>`);
    }
  } else if (billing.type === 'invoice') {
    if (billing.status === 'finalized') {
      actions.push(`<button class="action-btn" onclick="sendBilling('${id}')" title="Envoyer par email"><i class="fa-solid fa-paper-plane"></i></button>`);
      actions.push(`<button class="action-btn" onclick="markPaid('${id}')" title="Marquer comme payé"><i class="fa-solid fa-check"></i></button>`);
    }
    if (billing.status === 'paid') {
      actions.push(`<button class="action-btn" onclick="markUnpaid('${id}')" title="Marquer comme non payé"><i class="fa-solid fa-rotate-left"></i></button>`);
    }
  }

  actions.push(`<button class="action-btn" onclick="downloadBilling('${id}')" title="Télécharger PDF"><i class="fa-solid fa-download"></i></button>`);
  return actions.join('');
}

function renderBillings() {
  if (!facturationTableBody) return;

  let filtered = allBillings;
  if (currentBillingFilter !== 'all') {
    filtered = allBillings.filter(b => b.type === currentBillingFilter);
  }

  const query = (facturationSearch?.value || '').toLowerCase().trim();
  if (query) {
    filtered = filtered.filter(b =>
      (b.title || '').toLowerCase().includes(query) ||
      (b.number || '').toLowerCase().includes(query) ||
      (b.clientName || '').toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    facturationTableBody.innerHTML = `<tr class="empty-row"><td colspan="8">Aucun document trouvé.</td></tr>`;
    return;
  }

  facturationTableBody.innerHTML = filtered.map(b => {
    const client = allClients.find(c => c.id === b.clientId);
    const clientName = client
      ? (client.type === 'professionnel' ? client.entreprise || `${client.prenom} ${client.nom}` : `${client.prenom} ${client.nom}`)
      : 'Client inconnu';
    const date = b.createdAt ? b.createdAt.toDate().toLocaleDateString('fr-FR') : '—';
    const totalTtc = b.lines?.reduce((sum, line) => {
      const vatRates = { FR_2000: 0.2, FR_1000: 0.1, FR_550: 0.055, FR_00HT: 0 };
      const rate = vatRates[line.vatCode] || 0.2;
      return sum + (line.quantity * line.unitPrice * (1 + rate));
    }, 0) || 0;

    return `
      <tr>
        <td>${b.number || '—'}</td>
        <td>${b.type === 'estimate' ? 'Devis' : 'Facture'}</td>
        <td>${clientName}</td>
        <td>${b.title || '—'}</td>
        <td>${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totalTtc)}</td>
        <td><span class="billing-status ${b.status}">${getStatusLabel(b.status)}</span></td>
        <td>${date}</td>
        <td style="text-align:right;">
          <div class="action-btns">${getBillingActions(b)}</div>
        </td>
      </tr>
    `;
  }).join('');
}

function loadBillings() {
  if (!isManager()) return;
  db.collection('billings').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allBillings = [];
    snapshot.forEach(doc => {
      allBillings.push({ id: doc.id, ...doc.data() });
    });
    renderBillings();
  }, err => {
    console.error('Load billings error:', err);
    showToast('Erreur lors du chargement des documents.', 'error');
  });
}

async function syncAllClients() {
  if (!isManager()) return;
  if (!API_BASE_URL) {
    showToast('URL du backend non configurée. Voir README-ABBY.md.', 'error');
    return;
  }
  const confirmed = await appConfirm(
    'Synchroniser tous les clients vers Abby ? Cela peut prendre quelques instants.',
    { title: 'Synchronisation Abby', confirmLabel: 'Synchroniser', cancelLabel: 'Annuler', icon: 'fa-rotate' }
  );
  if (!confirmed) return;

  try {
    const data = await apiRequest('/api/sync-all-clients', { method: 'POST', body: JSON.stringify({}) });
    showToast(`Synchronisation terminée : ${data.results.filter(r => r.status === 'synced').length} client(s) synchronisé(s).`, 'success');
  } catch (err) {
    console.error('Sync all clients error:', err);
    showToast('Erreur lors de la synchronisation : ' + err.message, 'error');
  }
}

async function billingAction(path, successMessage, method = 'PATCH') {
  if (!API_BASE_URL) {
    showToast('URL du backend non configurée. Voir README-ABBY.md.', 'error');
    return;
  }
  try {
    await apiRequest(path, { method });
    showToast(successMessage, 'success');
    loadBillings();
  } catch (err) {
    showToast(err.message || 'Erreur', 'error');
  }
}

window.finalizeBilling = (id) => billingAction(`/api/billing/${id}/finalize`, 'Document finalisé.');
window.signBilling = (id) => billingAction(`/api/billing/${id}/sign`, 'Devis signé.');
window.unsignBilling = (id) => billingAction(`/api/billing/${id}/unsign`, 'Signature annulée.');
window.refuseBilling = (id) => billingAction(`/api/billing/${id}/refuse`, 'Devis refusé.');
window.unrefuseBilling = (id) => billingAction(`/api/billing/${id}/unrefuse`, 'Refus annulé.');
window.markPaid = (id) => billingAction(`/api/billing/${id}/mark-paid`, 'Facture marquée comme payée.');
window.markUnpaid = (id) => billingAction(`/api/billing/${id}/mark-unpaid`, 'Facture marquée comme non payée.');
window.sendBilling = (id) => billingAction(`/api/billing/${id}/send`, 'Document envoyé par email.', 'POST');
window.activateEsignature = (id) => billingAction(`/api/billing/${id}/activate-esignature`, 'Signature électronique activée.', 'POST');

window.downloadBilling = async (id) => {
  try {
    if (!API_BASE_URL) {
      showToast('URL du backend non configurée. Voir README-ABBY.md.', 'error');
      return;
    }
    const user = auth.currentUser;
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE_URL}/api/billing/${id}/download?locale=fr`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Erreur de téléchargement');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    showToast(err.message || 'Erreur de téléchargement', 'error');
  }
};

// Event listeners
btnCreateDevis?.addEventListener('click', () => openFacturationModal('estimate'));
btnCreateFacture?.addEventListener('click', () => openFacturationModal('invoice'));
btnSyncAllClients?.addEventListener('click', syncAllClients);
btnAddLine?.addEventListener('click', () => facturationLinesContainer.appendChild(createLineRow()));
facturationModalClose?.addEventListener('click', closeFacturationModal);
facturationForm?.addEventListener('submit', handleCreateBilling);

facturationSearch?.addEventListener('input', renderBillings);

facturationFilters.forEach(filter => {
  filter.addEventListener('click', () => {
    facturationFilters.forEach(f => f.classList.remove('active'));
    filter.classList.add('active');
    currentBillingFilter = filter.dataset.filter;
    renderBillings();
  });
});
