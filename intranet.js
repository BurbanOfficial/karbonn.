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

async function apiRequest(path, options = {}, _retry = false) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non authentifié');
  const token = await user.getIdToken(_retry);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (response.status === 401 && !_retry) {
    return apiRequest(path, options, true);
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Erreur API');
    error.details = data.details || data;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function sendNotificationEmail({ to, subject, text, html }) {
  if (!to || to.length === 0) return;
  console.log('[CLIENT EMAIL] Sending to:', to, '| subject:', subject);
  try {
    const result = await apiRequest('/notify/email', {
      method: 'POST',
      body: JSON.stringify({ to, subject, text, html })
    });
    console.log('[CLIENT EMAIL] Success:', result);
  } catch (err) {
    console.error('[CLIENT EMAIL] Error:', err);
  }
}

function getCurrentUserEmail() {
  return auth.currentUser?.email || '';
}

function sanitizeStoragePath(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._\-/]/g, '_');
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

function buildEmailHtml({ title, intro, lines, buttonText, buttonHref }) {
  const linesHtml = (lines || []).map(line => `<div>${escapeHtml(line)}<br></div>`).join('');
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
                    <h2 style="text-align: center; margin: 0 0 10px 0; color: rgb(17, 17, 17)">${escapeHtml(title)}<br></h2>
                    <div><br></div>
                    <div style="text-align: center; color: rgb(68, 68, 68); font-size: 14px; line-height: 1.6">
                      ${intro ? `<div>${escapeHtml(intro)}<br></div><div><br></div>` : ''}
                      ${linesHtml}
                    </div>
                    <div style="text-align: center; margin-top: 30px">
                      <a target="_blank" style="background: rgb(11, 11, 11); color: rgb(255, 255, 255); padding: 12px 22px; border-radius: 2px; text-decoration: none; font-size: 14px" href="${escapeHtml(buttonHref)}">
                        ${escapeHtml(buttonText)}
                      </a><br>
                    </div>
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

function getManagerEmails() {
  const currentEmail = getCurrentUserEmail();
  const managers = (allUsers || [])
    .filter(u => u.role === 'Manager' && u.email && u.email !== currentEmail)
    .map(u => u.email);
  console.log('[CLIENT EMAIL] Manager recipients:', managers, '| allUsers loaded:', allUsers.length);
  return managers;
}

function getProjectTeamEmails(projet) {
  const currentEmail = getCurrentUserEmail();
  const teamUids = (projet.team || []).map(m => m.uid);
  const recipients = (allUsers || [])
    .filter(u => teamUids.includes(u.uid) && u.email && u.email !== currentEmail)
    .map(u => u.email);
  console.log('[CLIENT EMAIL] Team recipients:', recipients, '| teamUids:', teamUids, '| allUsers loaded:', allUsers.length);
  return recipients;
}

function getAllProjectMemberEmails(projet) {
  const currentEmail = getCurrentUserEmail();
  const teamUids = (projet?.team || []).map(m => m.uid);
  const managerEmails = (allUsers || [])
    .filter(u => u.role === 'Manager' && u.email && u.email !== currentEmail)
    .map(u => u.email);
  const teamEmails = (allUsers || [])
    .filter(u => teamUids.includes(u.uid) && u.email && u.email !== currentEmail)
    .map(u => u.email);
  return [...new Set([...managerEmails, ...teamEmails])];
}

function notifyFileChange(folder, filename, isEdit) {
  const recipients = getAllProjectMemberEmails(currentPageProjet);
  if (recipients.length === 0) return;
  const projetName = currentPageProjet?.nom || 'Projet';
  const action = isEdit ? 'modifié' : 'ajouté';
  const userName = currentUserProfile?.displayName || auth.currentUser?.displayName || 'Un utilisateur';
  const subject = `[Karbonn] Fichier ${action} – ${projetName}`;
  const text = `${userName} a ${action} un fichier dans le projet « ${projetName} ».\n\nDossier : ${folder}\nFichier : ${filename}\n`;
  const html = buildEmailHtml({
    title: `Fichier ${action}`,
    intro: `${userName} a ${action} un fichier dans le projet ${projetName}.`,
    lines: [`Dossier : ${folder}`, `Fichier : ${filename}`],
    buttonText: 'Voir le projet',
    buttonHref: `${window.location.origin}/intranet.html`
  });
  sendNotificationEmail({ to: recipients, subject, text, html });
}

function notifyProjectDateChange(dateLabel, dateValue, folderName = null) {
  const recipients = getAllProjectMemberEmails(currentPageProjet);
  console.log('[CLIENT EMAIL] notifyProjectDateChange recipients:', recipients, '| projet:', currentPageProjet?.nom);
  if (recipients.length === 0) return;
  const projetName = currentPageProjet?.nom || 'Projet';
  const userName = currentUserProfile?.displayName || auth.currentUser?.displayName || 'Un manager';
  const formattedDate = dateValue ? new Date(dateValue).toLocaleDateString('fr-FR') : 'non définie';
  const target = folderName ? `Dossier : ${folderName}` : `Type : ${dateLabel}`;
  const subject = `[Karbonn] Nouvelle date d'échéance – ${projetName}`;
  const text = `${userName} a défini une nouvelle date d'échéance pour le projet « ${projetName} ».\n\n${target}\nDate : ${formattedDate}\n`;
  const html = buildEmailHtml({
    title: `Nouvelle date d'échéance`,
    intro: `${userName} a défini une nouvelle date d'échéance pour le projet ${projetName}.`,
    lines: [target, `Date : ${formattedDate}`],
    buttonText: 'Voir le projet',
    buttonHref: `${window.location.origin}/intranet.html`
  });
  sendNotificationEmail({ to: recipients, subject, text, html });
}

function showApp(user, profile) {
  loginScreen.classList.add('hidden');
  appContent.classList.remove('hidden');

  // Always land on dashboard
  navItems.forEach(n => n.classList.remove('active'));
  sections.forEach(s => s.classList.remove('active'));
  if (navItems[0]) navItems[0].classList.add('active');
  const dash = document.getElementById('section-dashboard');
  if (dash) dash.classList.add('active');

  const name = profile?.displayName || user.displayName || user.email.split('@')[0];
  const role = profile?.role?.label || profile?.role || 'Utilisateur';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  currentUserProfile = { uid: user.uid, ...(profile || {}) };
  currentUserRole = role;

  if (userNameEl) userNameEl.textContent = name;
  if (userRoleEl) userRoleEl.textContent = role;
  if (userAvatarEl) userAvatarEl.textContent = initials;

  // Restrict team and billing management to managers
  const createProjetBtn = document.getElementById('create-projet-btn');
  if (createProjetBtn) {
    createProjetBtn.style.display = role === 'Manager' ? '' : 'none';
  }

  const equipeNav = document.querySelector(`.nav-item[data-label="Équipe"]`);
  if (equipeNav) {
    if (role === 'Manager') {
      equipeNav.style.display = 'flex';
    } else {
      equipeNav.style.display = 'none';
      const section = document.getElementById('section-equipe');
      if (section && section.classList.contains('active')) {
        navItems.forEach(n => n.classList.remove('active'));
        navItems[0].classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById('section-dashboard').classList.add('active');
      }
    }
  }

  // Re-render role-dependent UI
  if (document.getElementById('clients-tbody')) {
    renderClients(allClients);
  }

  renderDashboard();
}

const _dashCharts = {};

function _toDate(ts) {
  if (!ts) return null;
  if (ts.seconds) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d) ? null : d;
}

function _getLast7MonthsTimeSeries(items, getDate) {
  const now = new Date();
  const points = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const count = items.filter(item => {
      const dt = getDate(item);
      return dt && dt.getFullYear() === y && dt.getMonth() === m;
    }).length;
    points.push([d.getTime(), count]);
  }
  return points;
}

function _apexSparklineOptions(seriesData, color, name) {
  return {
    series: [{ name, data: seriesData }],
    chart: {
      type: 'area',
      height: 60,
      sparkline: { enabled: true },
      toolbar: { show: false },
      animations: { enabled: true, speed: 400 },
    },
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        inverseColors: false,
        opacityFrom: 0.45,
        opacityTo: 0.02,
        stops: [20, 100],
      },
    },
    colors: [color],
    markers: { size: 0 },
    dataLabels: { enabled: false },
    xaxis: { type: 'datetime' },
    yaxis: { min: 0 },
    tooltip: { enabled: false },
    grid: { show: false },
  };
}

function renderDashboard() {
  const greetingEl = document.getElementById('dashboard-greeting');
  const projetsVal = document.getElementById('stat-projets-val');
  const clientsVal = document.getElementById('stat-clients-val');
  const caVal      = document.getElementById('stat-ca-val');
  const tachesVal  = document.getElementById('stat-taches-val');

  // Greeting
  if (greetingEl && currentUserProfile) {
    const firstName = (currentUserProfile.displayName || '').split(' ')[0] || 'vous';
    const hour = new Date().getHours();
    const salut = hour >= 18 ? 'Bonsoir' : 'Bonjour';
    greetingEl.textContent = `${salut}, ${firstName} 👋`;
  }

  // Projets actifs
  const activeProjects = allProjets.filter(p => p.statut !== 'Projet livré');
  if (projetsVal) projetsVal.textContent = activeProjects.length;

  // Clients
  if (clientsVal) clientsVal.textContent = allClients.length;

  // CA du mois — placeholder
  if (caVal) caVal.textContent = '—';

  // Tâches aujourd'hui
  const today = new Date().toISOString().split('T')[0];
  let tachesCount = 0;
  allProjets.forEach(p => {
    Object.values(p.folderDates || {}).forEach(d => { if (d && d.startsWith(today)) tachesCount++; });
  });
  if (tachesVal) tachesVal.textContent = tachesCount;

  if (typeof ApexCharts === 'undefined') return;

  const projetsData = _getLast7MonthsTimeSeries(allProjets, p => _toDate(p.createdAt));
  const clientsData = _getLast7MonthsTimeSeries(allClients, c => _toDate(c.createdAt));
  const caData      = _getLast7MonthsTimeSeries([], () => null);
  const tachesData  = _getLast7MonthsTimeSeries(
    allProjets.flatMap(p => Object.values(p.folderDates || {}).map(d => ({ d }))),
    item => { const d = new Date(item.d); return isNaN(d) ? null : d; }
  );

  const defs = [
    { id: 'chart-projets', data: projetsData, color: '#6366f1', name: 'Projets'  },
    { id: 'chart-clients', data: clientsData, color: '#22c55e', name: 'Clients'  },
    { id: 'chart-ca',      data: caData,      color: '#eab308', name: 'CA'       },
    { id: 'chart-taches',  data: tachesData,  color: '#ef4444', name: 'Tâches'  },
  ];

  defs.forEach(({ id, data, color, name }) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (_dashCharts[id]) { _dashCharts[id].destroy(); delete _dashCharts[id]; }
    const chart = new ApexCharts(el, _apexSparklineOptions(data, color, name));
    chart.render();
    _dashCharts[id] = chart;
  });

  renderDashboardProjects();
}

// ── Activity log ──
let unsubscribeActivity = null;
let _activityLog = [];

async function logActivity({ action, projetName = null, fileName = null, folderName = null }) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const userName = currentUserProfile?.displayName || user.displayName || user.email;
    await db.collection('activity_log').add({
      action,
      userName,
      projetName: projetName || null,
      fileName: fileName || null,
      folderName: folderName || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[ACTIVITY] Log error:', err);
  }
}

function setupActivityListener() {
  if (unsubscribeActivity) unsubscribeActivity();
  unsubscribeActivity = db.collection('activity_log')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot(snapshot => {
      _activityLog = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDashboardHistory();
    }, err => console.error('[ACTIVITY] Listener error:', err));
}

function renderDashboardHistory() {
  const list = document.getElementById('dashboard-history-list');
  if (!list) return;

  if (_activityLog.length === 0) {
    list.innerHTML = '<div class="dashboard-empty">Aucune action enregistrée</div>';
    return;
  }

  const actionMeta = {
    'file_upload':  { icon: 'fa-upload',         label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a déposé <strong>${escapeHtml(e.fileName)}</strong>${e.projetName ? ` dans <strong>${escapeHtml(e.projetName)}</strong>` : ''}` },
    'file_edit':    { icon: 'fa-pencil',          label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a modifié <strong>${escapeHtml(e.fileName)}</strong>${e.projetName ? ` dans <strong>${escapeHtml(e.projetName)}</strong>` : ''}` },
    'file_delete':  { icon: 'fa-trash',           label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a supprimé <strong>${escapeHtml(e.fileName)}</strong>${e.projetName ? ` dans <strong>${escapeHtml(e.projetName)}</strong>` : ''}` },
    'date_change':  { icon: 'fa-calendar',        label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a modifié une date${e.projetName ? ` sur <strong>${escapeHtml(e.projetName)}</strong>` : ''}` },
    'projet_create':{ icon: 'fa-folder-plus',     label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a créé le projet <strong>${escapeHtml(e.projetName)}</strong>` },
    'projet_delete':{ icon: 'fa-folder-minus',    label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a supprimé le projet <strong>${escapeHtml(e.projetName)}</strong>` },
    'client_create':{ icon: 'fa-user-plus',       label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a ajouté le client <strong>${escapeHtml(e.projetName)}</strong>` },
    'member_create':{ icon: 'fa-user-plus',       label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a créé le membre <strong>${escapeHtml(e.projetName)}</strong>` },
    'member_delete':{ icon: 'fa-user-minus',      label: (e) => `<strong>${escapeHtml(e.userName)}</strong> a supprimé le membre <strong>${escapeHtml(e.projetName)}</strong>` },
  };

  const now = new Date();
  list.innerHTML = _activityLog.map(entry => {
    const meta = actionMeta[entry.action] || { icon: 'fa-circle-info', label: (e) => `<strong>${escapeHtml(e.userName)}</strong> — ${escapeHtml(e.action)}` };
    const ts = entry.createdAt?.seconds ? new Date(entry.createdAt.seconds * 1000) : null;
    let timeLabel = '';
    if (ts) {
      const diff = Math.floor((now - ts) / 1000);
      if (diff < 60)           timeLabel = "À l'instant";
      else if (diff < 3600)    timeLabel = `Il y a ${Math.floor(diff/60)} min`;
      else if (diff < 86400)   timeLabel = `Il y a ${Math.floor(diff/3600)} h`;
      else                     timeLabel = ts.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
    return `
      <div class="dashboard-history-row">
        <div class="dashboard-history-icon"><i class="fa-solid ${meta.icon}"></i></div>
        <div class="dashboard-history-body">
          <div class="dashboard-history-text">${meta.label(entry)}</div>
          ${timeLabel ? `<div class="dashboard-history-time">${timeLabel}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function openProjetPageById(projetId) {
  const projet = allProjets.find(p => p.id === projetId);
  if (!projet) return;
  // Switch to projets section
  navItems.forEach(n => n.classList.remove('active'));
  sections.forEach(s => s.classList.remove('active'));
  const projetsIndex = sectionMap.indexOf('section-projets');
  if (projetsIndex !== -1) navItems[projetsIndex]?.classList.add('active');
  const projetsSection = document.getElementById('section-projets');
  if (projetsSection) projetsSection.classList.add('active');
  openProjetPage(projet);
}

function renderDashboardProjects() {
  const list = document.getElementById('dashboard-projects-list');
  if (!list) return;

  const active = allProjets
    .filter(p => p.statut !== 'Projet livré')
    .map(p => ({ ...p, _ts: p.dateLivraison ? new Date(p.dateLivraison).getTime() : Infinity }))
    .sort((a, b) => a._ts - b._ts);

  if (active.length === 0) {
    list.innerHTML = '<div class="dashboard-empty">Aucun projet actif</div>';
    return;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const msDay = 86400000;

  list.innerHTML = active.map(p => {
    let dateLabel = '—', dateCls = '', badgeCls = 'nodate', badgeLabel = 'Sans échéance';
    if (p.dateLivraison) {
      const dt = new Date(p.dateLivraison);
      const diff = Math.round((dt.getTime() - today.getTime()) / msDay);
      dateLabel = dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      if (diff < 0)        { dateCls = 'urgent'; badgeCls = 'urgent'; badgeLabel = 'En retard'; }
      else if (diff <= 7)  { dateCls = 'urgent'; badgeCls = 'urgent'; badgeLabel = `${diff}j restants`; }
      else if (diff <= 21) { dateCls = 'soon';   badgeCls = 'soon';   badgeLabel = `${diff}j restants`; }
      else                 { dateCls = '';        badgeCls = 'ok';     badgeLabel = `${diff}j restants`; }
    }
    return `
      <div class="dashboard-project-row" onclick="openProjetPageById('${p.id}')">
        <div>
          <div class="dashboard-project-name">${escapeHtml(p.nom || 'Sans nom')}</div>
          <div class="dashboard-project-client">${escapeHtml(p.clientName || '—')}</div>
        </div>
        <div class="dashboard-project-date ${dateCls}">${dateLabel}</div>
        <span class="dashboard-project-badge ${badgeCls}">${badgeLabel}</span>
      </div>`;
  }).join('');
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
  if (_suppressAuthChange) return;
  if (!user) {
    if (unsubscribeClients) { unsubscribeClients(); unsubscribeClients = null; }
    if (unsubscribeProjets) { unsubscribeProjets(); unsubscribeProjets = null; }
    if (unsubscribeSites) { unsubscribeSites(); unsubscribeSites = null; }
    if (unsubscribeSiteHistory) { unsubscribeSiteHistory(); unsubscribeSiteHistory = null; }
    if (unsubscribeUsers) { unsubscribeUsers(); unsubscribeUsers = null; }
    if (unsubscribeActivity) { unsubscribeActivity(); unsubscribeActivity = null; }
    showLogin();
    return;
  }

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    const profile = doc.exists ? doc.data() : null;
    showApp(user, profile);
    setupClientsListener();
    setupProjetsListener();
    setupSitesListener();
    setupUsersListener();
    setupActivityListener();

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

// ── Multi-step login ──
const TEMP_PASSWORD = 'Karbonn2024!';
let _loginStep = 'email'; // 'email' | 'password' | 'firstlogin'
let _suppressAuthChange = false; // true while detecting first login

const loginStepEmail     = document.getElementById('login-step-email');
const loginStepPassword  = document.getElementById('login-step-password');
const loginStepFirst     = document.getElementById('login-step-firstlogin');
const loginSubmitBtn     = document.getElementById('login-submit-btn');
const loginNewPassword   = document.getElementById('login-newpassword');
const loginConfirmPassword = document.getElementById('login-confirmpassword');

function _setLoginStep(step) {
  _loginStep = step;
  loginStepEmail.style.display    = step === 'email'      ? '' : 'none';
  loginStepPassword.style.display = step === 'password'   ? '' : 'none';
  loginStepFirst.style.display    = step === 'firstlogin' ? '' : 'none';
  loginError.textContent = '';
  if (step === 'email') {
    loginSubmitBtn.textContent = 'Continuer';
    loginEmail.focus();
  } else if (step === 'password') {
    loginSubmitBtn.textContent = 'Se connecter';
    loginPassword.value = '';
    loginPassword.focus();
  } else {
    loginSubmitBtn.textContent = 'Définir mon mot de passe';
    loginNewPassword.value = '';
    loginConfirmPassword.value = '';
    loginNewPassword.focus();
  }
}

document.getElementById('login-back-btn').addEventListener('click', () => _setLoginStep('email'));
document.getElementById('login-back-btn2').addEventListener('click', () => _setLoginStep('email'));

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  const email = loginEmail.value.trim();

  // ── Étape 1 : vérification email ──
  if (_loginStep === 'email') {
    if (!email) { loginError.textContent = 'Veuillez saisir votre adresse email.'; return; }
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Vérification…';
    try {
      // Suppress auth state changes during detection
      _suppressAuthChange = true;
      // Try signing in with temp password to detect first login
      await auth.signInWithEmailAndPassword(email, TEMP_PASSWORD);
      // Success → first login, sign out immediately and ask for new password
      await auth.signOut();
      _suppressAuthChange = false;
      _setLoginStep('firstlogin');
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        // Account exists with a real password → normal login
        _setLoginStep('password');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        loginError.textContent = 'Aucun compte ne correspond à cet email.';
      } else {
        // Possibly first login but different error — still show password step
        _setLoginStep('password');
      }
    } finally {
      _suppressAuthChange = false;
      loginSubmitBtn.disabled = false;
    }
    return;
  }

  // ── Étape 2a : connexion normale ──
  if (_loginStep === 'password') {
    const password = loginPassword.value;
    if (!password) { loginError.textContent = 'Veuillez saisir votre mot de passe.'; return; }
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Connexion…';
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      console.error(err);
      let message = 'Échec de la connexion.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') message = 'Mot de passe incorrect.';
      if (err.code === 'auth/user-not-found') message = 'Aucun compte ne correspond à cet email.';
      if (err.code === 'auth/too-many-requests') message = 'Trop de tentatives. Réessayez plus tard.';
      loginError.textContent = message;
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Se connecter';
    }
    return;
  }

  // ── Étape 2b : définir un nouveau mot de passe (première connexion) ──
  if (_loginStep === 'firstlogin') {
    const newPwd = loginNewPassword.value;
    const confirmPwd = loginConfirmPassword.value;
    if (!newPwd || newPwd.length < 8) { loginError.textContent = 'Le mot de passe doit contenir au moins 8 caractères.'; return; }
    if (newPwd !== confirmPwd) { loginError.textContent = 'Les mots de passe ne correspondent pas.'; return; }
    loginSubmitBtn.disabled = true;
    loginSubmitBtn.textContent = 'Enregistrement…';
    try {
      // Sign in with temp password to get a credential
      const cred = await auth.signInWithEmailAndPassword(email, TEMP_PASSWORD);
      // Update to new password
      await cred.user.updatePassword(newPwd);
      // Mark firstLogin as done in Firestore
      await db.collection('users').doc(cred.user.uid).update({ firstLogin: false });
      // Sign out and ask user to log in with new password
      _suppressAuthChange = true;
      await auth.signOut();
      _suppressAuthChange = false;
      _setLoginStep('password');
      loginPassword.value = '';
      showToast('Mot de passe défini. Connectez-vous maintenant.', 'success', 'Bienvenue !', 5000);
    } catch (err) {
      console.error(err);
      loginError.textContent = 'Erreur lors de la mise à jour du mot de passe. Réessayez.';
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Définir mon mot de passe';
    }
    return;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  _setLoginStep('email');
});

// ═══════════════════════════════════════════════════════════════
// Sites Web
// ═══════════════════════════════════════════════════════════════
let allSites = [];
let unsubscribeSites = null;
let currentPageSite = null;
let unsubscribeSiteHistory = null;

const sitesListView = document.getElementById('sites-list-view');
const sitePageView = document.getElementById('site-page-view');
const sitesTbody = document.getElementById('sites-tbody');
const sitesSearch = document.getElementById('sites-search');
const sitePageTitle = document.getElementById('site-page-title');
const sitePageDomain = document.getElementById('site-page-domain');
const sitePageInfo = document.getElementById('site-page-info');
const siteHistoryList = document.getElementById('site-history-list');
const siteClientNotes = document.getElementById('site-client-notes');

const siteModal = document.getElementById('site-modal');
const siteModalClose = document.getElementById('site-modal-close');
const formSite = document.getElementById('form-site');
const siteClientSelect = document.getElementById('site-client');
const siteClientIdDisplay = document.getElementById('site-client-id-display');

const SITE_STATUSES = ['Actif','Suspendu','En maintenance','Expiré','En attente'];

function getSiteStatusClass(status) {
  const key = (status || 'En attente').toLowerCase().replace(/\s+/g, '-');
  return `site-status-${key}`;
}

function getEffectiveSiteStatus(site) {
  if (!site) return 'En attente';
  // Auto-expiration: only 'Actif' automatically switches to 'Expiré'
  if (site.status === 'Actif' && site.expirationDate) {
    const exp = new Date(site.expirationDate);
    const now = new Date();
    now.setHours(0,0,0,0);
    exp.setHours(23,59,59,999);
    if (exp < now) return 'Expiré';
  }
  return site.status || 'En attente';
}

function autoUpdateExpiredSites() {
  allSites.forEach(site => {
    if (site.status === 'Actif' && site.expirationDate) {
      const exp = new Date(site.expirationDate);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      exp.setHours(23, 59, 59, 999);
      if (exp < now) {
        db.collection('sitesWeb').doc(site.id).update({ status: 'Expiré' }).catch(err => console.warn('[Sites] Auto-update failed:', err));
      }
    }
  });
}

function setupSitesListener() {
  if (unsubscribeSites) unsubscribeSites();
  unsubscribeSites = db.collection('sitesWeb').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allSites = [];
    snapshot.forEach(doc => allSites.push({ id: doc.id, ...doc.data() }));
    renderAllSites();
    autoUpdateExpiredSites();
    refreshPlanning();
    if (currentPageSite) {
      const updated = allSites.find(s => s.id === currentPageSite.id);
      if (updated) {
        currentPageSite = updated;
        openSitePage(updated, false);
      }
    }
  }, err => {
    console.error(err);
    sitesTbody.innerHTML = '<tr class="empty-row"><td colspan="5">Erreur lors du chargement.</td></tr>';
  });
}

function renderAllSites() {
  const query = (sitesSearch.value || '').toLowerCase().trim();
  let filtered = allSites;
  if (query) {
    filtered = allSites.filter(s => {
      const domain = (s.domain || '').toLowerCase();
      const clientName = (s.clientName || '').toLowerCase();
      return domain.includes(query) || clientName.includes(query);
    });
  }
  renderSites(filtered);
}

function renderSites(sites) {
  if (sites.length === 0) {
    sitesTbody.innerHTML = '<tr class="empty-row"><td colspan="5">Aucun site Web trouvé.</td></tr>';
    return;
  }
  sitesTbody.innerHTML = sites.map(s => {
    const domain = s.domain || '—';
    const clientName = s.clientName || '—';
    const clientId = s.clientIdDisplay || s.clientId || '—';
    const status = getEffectiveSiteStatus(s);
    const statusClass = getSiteStatusClass(status);
    const expiration = s.expirationDate ? new Date(s.expirationDate).toLocaleDateString('fr-FR') : '—';
    return `<tr data-site-id="${s.id}">
      <td>${escapeHtml(domain)}</td>
      <td>${escapeHtml(clientName)}</td>
      <td>${escapeHtml(clientId)}</td>
      <td><span class="site-status-badge ${statusClass}">${status}</span></td>
      <td>${expiration}</td>
    </tr>`;
  }).join('');

  sitesTbody.querySelectorAll('tr[data-site-id]').forEach(row => {
    row.addEventListener('click', () => {
      const site = allSites.find(s => s.id === row.dataset.siteId);
      if (site) openSitePage(site);
    });
  });
}

function openSitePage(site, loadHistory = true) {
  currentPageSite = site;
  sitesListView.style.display = 'none';
  sitePageView.style.display = '';
  sitePageTitle.textContent = site.domain || 'Site Web';
  sitePageDomain.textContent = site.domain || '—';

  const canEdit = isManager();

  const clientOptions = allClients.map(c => {
    const cName = c.entreprise ? `${[c.prenom, c.nom].filter(Boolean).join(' ')} — ${c.entreprise}` : [c.prenom, c.nom].filter(Boolean).join(' ');
    const selected = c.id === site.clientId ? 'selected' : '';
    return `<option value="${c.id}" ${selected}>${escapeHtml(cName)}</option>`;
  }).join('');

  const statusOptions = SITE_STATUSES.map(st => {
    const selected = st === site.status ? 'selected' : '';
    return `<option value="${st}" ${selected}>${st}</option>`;
  }).join('');

  const fields = [
    { key: 'domain', label: 'Nom de domaine', icon: 'fa-globe', value: site.domain || '', type: 'text' },
    { key: 'expirationDate', label: "Date d'expiration", icon: 'fa-calendar-xmark', value: site.expirationDate || '', type: 'date', display: site.expirationDate ? new Date(site.expirationDate).toLocaleDateString('fr-FR') : '—' },
    { key: 'creationDate', label: 'Date de création', icon: 'fa-calendar-plus', value: site.creationDate || '', type: 'date', display: site.creationDate ? new Date(site.creationDate).toLocaleDateString('fr-FR') : '—' },
    { key: 'host', label: 'Hébergeur', icon: 'fa-server', value: site.host || '', type: 'text' },
    { key: 'server', label: 'Serveur', icon: 'fa-network-wired', value: site.server || '', type: 'text' },
  ];

  let html = '';
  fields.forEach(f => {
    const displayVal = f.display || f.value || '—';
    html += `<div class="detail-info-item-editable site-info-item" data-field="${f.key}">
      <div class="site-info-icon"><i class="fa-solid ${f.icon}"></i></div>
      <div class="detail-info-content">
        <span class="detail-info-label">${f.label}</span>
        <span class="detail-info-value">${escapeHtml(displayVal)}</span>
        <input class="detail-field-input" type="${f.type}" value="${f.value}" />
      </div>
      ${canEdit ? `<button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>` : ''}
    </div>`;
  });

  html += `<div class="detail-info-item-editable site-info-item" data-field="clientId">
    <div class="site-info-icon"><i class="fa-solid fa-user"></i></div>
    <div class="detail-info-content">
      <span class="detail-info-label">Client</span>
      <span class="detail-info-value">${escapeHtml(site.clientName || '—')}</span>
      <select class="detail-field-input" id="site-page-client-select">
        <option value="">— Sélectionner —</option>
        ${clientOptions}
      </select>
    </div>
    ${canEdit ? `<button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>` : ''}
  </div>`;

  html += `<div class="detail-info-item-editable site-info-item" data-field="status">
    <div class="site-info-icon"><i class="fa-solid fa-signal"></i></div>
    <div class="detail-info-content">
      <span class="detail-info-label">Statut</span>
      <span class="detail-info-value"><span class="site-status-badge ${getSiteStatusClass(getEffectiveSiteStatus(site))}">${getEffectiveSiteStatus(site)}</span></span>
      <select class="detail-field-input" id="site-page-status-select">
        ${statusOptions}
      </select>
    </div>
    ${canEdit ? `<button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>` : ''}
  </div>`;

  sitePageInfo.innerHTML = html;

  if (canEdit) {
    sitePageInfo.querySelectorAll('.detail-info-item-editable').forEach(item => {
      const editBtn = item.querySelector('.detail-field-edit');
      const input = item.querySelector('.detail-field-input');
      if (!editBtn) return;
      editBtn.addEventListener('click', async () => {
        if (item.classList.contains('editing')) {
          const key = item.dataset.field;
          try {
            let update = {};
            let historyNote = null;
            if (key === 'clientId') {
              const select = item.querySelector('select');
              const newClientId = select.value;
              const selectedClient = allClients.find(c => c.id === newClientId);
              const newClientName = selectedClient ? (selectedClient.entreprise ? `${[selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')} — ${selectedClient.entreprise}` : [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')) : '';
              update = { clientId: newClientId, clientName: newClientName, clientIdDisplay: selectedClient?.clientId || newClientId };
              historyNote = `Changement de client : ${newClientName || newClientId}`;
              try {
                if (site.clientId && site.domain) {
                  await db.collection('clients').doc(site.clientId).update({
                    sites: firebase.firestore.FieldValue.arrayRemove(site.domain)
                  });
                }
                await db.collection('clients').doc(newClientId).update({
                  sites: firebase.firestore.FieldValue.arrayUnion(site.domain)
                });
              } catch (err) {
                console.warn('[Sites] Failed to update client sites:', err);
              }
            } else if (key === 'status') {
              const select = item.querySelector('select');
              const newStatus = select.value;
              update = { status: newStatus };
              historyNote = `Changement de statut : ${site.status || '—'} → ${newStatus}`;
            } else {
              const newValue = input.value.trim();
              update = { [key]: newValue };
              historyNote = `${item.querySelector('.detail-info-label').textContent} modifié : ${newValue || '—'}`;
            }
            await db.collection('sitesWeb').doc(site.id).update(update);
            await addSiteHistory(site.id, 'field_edit', historyNote);
            item.classList.remove('editing');
            Object.assign(site, update);
            openSitePage(site);
          } catch (err) {
            console.error(err);
            showToast('Erreur lors de la mise à jour.', 'error');
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

  if (loadHistory) loadSiteHistory(site.id);
}

function closeSitePage() {
  sitesListView.style.display = '';
  sitePageView.style.display = 'none';
  currentPageSite = null;
  if (unsubscribeSiteHistory) { unsubscribeSiteHistory(); unsubscribeSiteHistory = null; }
}

function populateSiteClientSelect() {
  siteClientSelect.innerHTML = '<option value="">Sélectionner un client...</option>';
  allClients.forEach(c => {
    const name = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email || c.id;
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.entreprise ? `${name} — ${c.entreprise}` : name;
    option.dataset.clientId = c.clientId || '';
    siteClientSelect.appendChild(option);
  });
}

siteClientSelect.addEventListener('change', () => {
  const selected = siteClientSelect.options[siteClientSelect.selectedIndex];
  siteClientIdDisplay.value = selected?.dataset.clientId || '';
});

function openSiteModal() {
  populateSiteClientSelect();
  siteModal.classList.add('visible');
}

function closeSiteModal() {
  siteModal.classList.remove('visible');
  formSite.reset();
  siteClientIdDisplay.value = '';
  document.getElementById('modal-error-site').textContent = '';
}

document.getElementById('create-site-btn').addEventListener('click', () => {
  if (!isManager()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }
  openSiteModal();
});
siteModalClose.addEventListener('click', closeSiteModal);
siteModal.addEventListener('click', e => { if (e.target === siteModal) closeSiteModal(); });

formSite.addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = document.getElementById('modal-error-site');
  errorEl.textContent = '';

  const clientId = siteClientSelect.value;
  const domain = document.getElementById('site-domain').value.trim();
  const status = document.getElementById('site-status').value;
  const creationDate = document.getElementById('site-creation-date').value || '';
  const expirationDate = document.getElementById('site-expiration-date').value || '';
  const host = document.getElementById('site-host').value.trim();
  const server = document.getElementById('site-server').value.trim();

  if (!clientId || !domain || !expirationDate) {
    errorEl.textContent = 'Veuillez remplir les champs obligatoires.';
    return;
  }

  const selectedClient = allClients.find(c => c.id === clientId);
  const clientName = selectedClient ? (selectedClient.entreprise ? `${[selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')} — ${selectedClient.entreprise}` : [selectedClient.prenom, selectedClient.nom].filter(Boolean).join(' ')) : '';
  const clientIdDisplay = selectedClient?.clientId || clientId;

  try {
    const user = auth.currentUser;
    const docRef = await db.collection('sitesWeb').add({
      clientId,
      clientName,
      clientIdDisplay,
      domain,
      status,
      creationDate,
      expirationDate,
      host,
      server,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: user?.uid || ''
    });
    await addSiteHistory(docRef.id, 'note', `Site Web créé pour ${domain}`);
    try {
      await db.collection('clients').doc(clientId).update({
        sites: firebase.firestore.FieldValue.arrayUnion(domain)
      });
    } catch (err) {
      console.warn('[Sites] Failed to update client sites:', err);
    }
    closeSiteModal();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Erreur lors de la création du site Web.';
  }
});

document.getElementById('site-back-btn').addEventListener('click', closeSitePage);

document.getElementById('btn-delete-site').addEventListener('click', async () => {
  if (!currentPageSite) return;
  if (!isManager()) { showToast('Action réservée aux managers.', 'error'); return; }
  const confirmed = await appConfirm(`Supprimer définitivement le site ${currentPageSite.domain} ?`, { title: 'Supprimer un site Web', confirmLabel: 'Supprimer', cancelLabel: 'Annuler', icon: 'fa-trash' });
  if (!confirmed) return;
  try {
    await db.collection('sitesWeb').doc(currentPageSite.id).delete();
    if (currentPageSite.clientId && currentPageSite.domain) {
      try {
        await db.collection('clients').doc(currentPageSite.clientId).update({
          sites: firebase.firestore.FieldValue.arrayRemove(currentPageSite.domain)
        });
      } catch (err) {
        console.warn('[Sites] Failed to update client sites:', err);
      }
    }
    closeSitePage();
    showToast('Site Web supprimé.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la suppression.', 'error');
  }
});

document.getElementById('btn-add-site-note').addEventListener('click', async () => {
  if (!currentPageSite) return;
  if (!isManager()) { showToast('Action réservée aux managers.', 'error'); return; }
  const content = window.prompt('Contenu de la note :');
  if (!content) return;
  try {
    await addSiteHistory(currentPageSite.id, 'note', content);
    loadSiteHistory(currentPageSite.id);
    showToast('Note ajoutée.', 'success');
  } catch (err) {
    console.error(err);
    showToast("Erreur lors de l'ajout de la note.", 'error');
  }
});

async function addSiteHistory(siteId, type, content) {
  const user = auth.currentUser;
  const userName = currentUserProfile?.displayName || user?.displayName || user?.email || 'Utilisateur';
  await db.collection('sitesWeb').doc(siteId).collection('history').add({
    type,
    content,
    createdBy: user?.uid || '',
    createdByName: userName,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function loadSiteHistory(siteId) {
  if (unsubscribeSiteHistory) unsubscribeSiteHistory();
  unsubscribeSiteHistory = db.collection('sitesWeb').doc(siteId).collection('history').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    const clientNotes = items.filter(i => i.type === 'note' && i.createdByName === 'Espace Client');
    const historyItems = items.filter(i => !(i.type === 'note' && i.createdByName === 'Espace Client'));
    renderSiteHistory(historyItems);
    renderClientNotes(clientNotes);
  });
}

function renderSiteHistory(items) {
  if (!items.length) {
    siteHistoryList.innerHTML = '<p class="empty-history">Aucune modification enregistrée.</p>';
    return;
  }
  const canEdit = isManager();
  siteHistoryList.innerHTML = items.map(item => {
    const date = item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString('fr-FR') : '—';
    const icon = item.type === 'note' ? 'fa-note-sticky' : 'fa-pen-to-square';
    return `<div class="site-history-item" data-history-id="${item.id}">
      <div class="history-meta">
        <span><i class="fa-solid ${icon}"></i> ${escapeHtml(item.createdByName || '—')} · ${date}</span>
        ${canEdit ? `<span class="history-actions">
          <button class="history-edit-btn" title="Modifier"><i class="fa-solid fa-pencil"></i></button>
          <button class="history-delete-btn" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
        </span>` : ''}
      </div>
      <div class="history-content">${escapeHtml(item.content || '')}</div>
    </div>`;
  }).join('');

  if (canEdit && currentPageSite) {
    siteHistoryList.querySelectorAll('.history-edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemEl = btn.closest('.site-history-item');
        const id = itemEl.dataset.historyId;
        const item = items.find(i => i.id === id);
        const newContent = window.prompt('Modifier la note :', item?.content || '');
        if (newContent === null) return;
        try {
          await db.collection('sitesWeb').doc(currentPageSite.id).collection('history').doc(id).update({ content: newContent });
          showToast('Note mise à jour.', 'success');
        } catch (err) {
          console.error(err);
          showToast('Erreur lors de la mise à jour.', 'error');
        }
      });
    });

    siteHistoryList.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemEl = btn.closest('.site-history-item');
        const id = itemEl.dataset.historyId;
        const confirmed = await appConfirm('Supprimer cette note ?', { title: 'Supprimer une note', confirmLabel: 'Supprimer', cancelLabel: 'Annuler', icon: 'fa-trash' });
        if (!confirmed) return;
        try {
          await db.collection('sitesWeb').doc(currentPageSite.id).collection('history').doc(id).delete();
          showToast('Note supprimée.', 'success');
        } catch (err) {
          console.error(err);
          showToast('Erreur lors de la suppression.', 'error');
        }
      });
    });
  }
}

function getClientNoteStatusBadge(status) {
  const map = {
    pending: { label: 'En attente', class: 'client-note-status-pending' },
    accepted: { label: 'Acceptée', class: 'client-note-status-accepted' },
    rejected: { label: 'Refusée', class: 'client-note-status-rejected' }
  };
  return map[status] || map.pending;
}

function renderClientNotes(notes) {
  if (!siteClientNotes) return;
  if (!notes.length) {
    siteClientNotes.innerHTML = '<p class="empty-history">Aucune remarque client.</p>';
    return;
  }
  const canModerate = isManager();
  siteClientNotes.innerHTML = notes.map(item => {
    const date = item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString('fr-FR') : '—';
    const status = getClientNoteStatusBadge(item.status);
    const isPending = !item.status || item.status === 'pending';
    return `<div class="site-client-note-item" data-client-note-id="${item.id}">
      <div class="client-note-meta">
        <div class="client-note-meta-left">
          <span class="client-note-badge"><i class="fa-solid fa-user"></i> Espace Client</span>
          <span class="client-note-status-badge ${status.class}">${status.label}</span>
        </div>
        <span class="client-note-date">${date}</span>
      </div>
      <div class="client-note-content">${escapeHtml(item.content || '')}</div>
      ${canModerate && isPending ? `
      <div class="client-note-actions">
        <button class="client-note-accept" title="Accepter"><i class="fa-solid fa-check"></i> Accepter</button>
        <button class="client-note-reject" title="Refuser"><i class="fa-solid fa-xmark"></i> Refuser</button>
      </div>` : ''}
    </div>`;
  }).join('');

  if (!canModerate || !currentPageSite) return;
  siteClientNotes.querySelectorAll('.client-note-accept').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.site-client-note-item').dataset.clientNoteId;
      await updateClientNoteStatus(id, 'accepted');
    });
  });
  siteClientNotes.querySelectorAll('.client-note-reject').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.site-client-note-item').dataset.clientNoteId;
      await updateClientNoteStatus(id, 'rejected');
    });
  });
}

async function updateClientNoteStatus(noteId, status) {
  if (!currentPageSite) return;
  console.log('[Intranet] Updating client note status:', { siteId: currentPageSite.id, noteId, status });
  try {
    await db.collection('sitesWeb').doc(currentPageSite.id).collection('history').doc(noteId).update({ status });
    console.log('[Intranet] Client note status updated successfully:', { noteId, status });
    showToast(`Remarque ${status === 'accepted' ? 'acceptée' : 'refusée'}.`, 'success');
  } catch (err) {
    console.error('[Intranet] Failed to update client note status:', err);
    showToast('Erreur lors de la mise à jour du statut.', 'error');
  }
}

sitesSearch.addEventListener('input', renderAllSites);

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section-page');
const sectionMap = [
  'section-dashboard',
  'section-clients',
  'section-taches',
  'section-projets',
  'section-sitesweb',
  'section-equipe',
  'section-parametres'
];

navItems.forEach((item, index) => {
  item.addEventListener('click', e => {
    e.preventDefault();

    const sectionId = sectionMap[index];
    if (sectionId === 'section-equipe' && currentUserRole !== 'Manager') {
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

  });
});

// Clients — temps réel
let allClients = [];
let unsubscribeClients = null;

function setupClientsListener() {
  if (unsubscribeClients) unsubscribeClients();
  unsubscribeClients = db.collection('clients').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allClients = [];
    snapshot.forEach(doc => {
      allClients.push({ id: doc.id, ...doc.data() });
    });
    renderClients(allClients);
    renderDashboard();
  }, err => {
    console.error(err);
    const tbody = document.getElementById('clients-tbody');
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Erreur lors du chargement.</td></tr>';
  });
}

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
    showToast('URL du backend non configurée.', 'error');
    return;
  }

  const nom = [client.prenom, client.nom].filter(Boolean).join(' ') || client.entreprise || client.email || clientId;
  const confirmed = await appConfirm(
    `Supprimer définitivement le client « ${nom} » ? Cette action est irréversible.`,
    { title: 'Supprimer le client', confirmLabel: 'Supprimer', cancelLabel: 'Annuler', icon: 'fa-trash' }
  );
  if (!confirmed) return;

  try {
    await apiRequest(`/api/clients/${clientId}`, { method: 'DELETE' });
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
  const inputs = container.querySelectorAll('input, select');
  for (const input of inputs) {
    if (!input.checkValidity()) {
      input.reportValidity();
      input.focus();
      return false;
    }
  }
  return true;
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll('input, select').forEach(input => {
    if (input.name) data[input.name] = input.value.trim();
  });
  // Also store assembled adresse for display/legacy compatibility
  if (data.rue || data.codePostal || data.ville) {
    data.adresse = [data.rue, data.codePostal, data.ville].filter(Boolean).join(', ');
  }
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
  const clientUniqueId = generateClientId();
  const client = { ...data, type, clientId: clientUniqueId };
  await apiRequest('/api/clients', {
    method: 'POST',
    body: JSON.stringify({ client }),
  });
  return clientUniqueId;
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
let unsubscribeProjets = null;

function setupProjetsListener() {
  if (unsubscribeProjets) unsubscribeProjets();
  unsubscribeProjets = db.collection('projets').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allProjets = [];
    snapshot.forEach(doc => {
      allProjets.push({ id: doc.id, ...doc.data() });
    });
    renderAllProjets();
    refreshPlanning(); // Update planning when projects change
    renderDashboard();
    // Refresh open projet page
    if (currentPageProjet) {
      const updated = allProjets.find(p => p.id === currentPageProjet.id);
      if (updated) {
        currentPageProjet = updated;
        openProjetPage(updated);
      }
    }
  }, err => {
    console.error(err);
    const tbody = document.getElementById('projets-tbody');
    if (tbody) tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Erreur lors du chargement.</td></tr>';
  });
}

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

let unsubscribeUsers = null;

function setupUsersListener() {
  if (unsubscribeUsers) unsubscribeUsers();
  unsubscribeUsers = db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
    allTeamMembers = sortByRole(allUsers.map(u => ({ uid: u.uid, name: u.displayName || u.email || u.uid, role: getRoleLabel(u.role) })));
    renderEquipeTable();
  }, err => {
    console.error('Error loading team members:', err);
  });
}

async function loadTeamMembers() {
  // Kept for backward compatibility — the real-time listener handles updates
  // but we ensure data is loaded if listener hasn't fired yet
  if (allUsers.length === 0) {
    try {
      const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
      allUsers = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
      allTeamMembers = sortByRole(allUsers.map(u => ({ uid: u.uid, name: u.displayName || u.email || u.uid, role: getRoleLabel(u.role) })));
      renderEquipeTable();
    } catch (err) {
      console.error('Error loading team members:', err);
    }
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
  if (!canEditProjectDetails()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }
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
    logActivity({ action: 'projet_create', projetName: nom });
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
const detailSitesContainer = document.getElementById('detail-sites');
const detailClientIdEl = document.getElementById('detail-client-id');

let currentDetailClient = null;

function openClientDetail(client) {
  currentDetailClient = client;
  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client';
  detailModalTitle.textContent = name;
  detailClientIdEl.textContent = client.clientId || '—';

  renderDetailFields(client);
  loadClientProjets(client.id);
  loadClientSites(client.id);
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
    fields.push({ key: 'tva', label: 'Numéro de TVA' });
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
          // Sync to Qonto
          if (isManager()) {
            apiRequest(`/api/clients/${currentDetailClient.id}`, {
              method: 'PUT',
              body: JSON.stringify({ client: { [key]: newValue } }),
            }).catch(err => console.warn('Qonto sync error:', err.message));
          }
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

async function loadClientSites(clientDocId) {
  detailSitesContainer.innerHTML = '<p class="detail-projets-empty">Chargement...</p>';

  try {
    const snapshot = await db.collection('sitesWeb').where('clientId', '==', clientDocId).get();
    if (snapshot.empty) {
      detailSitesContainer.innerHTML = '<p class="detail-projets-empty">Aucun site Web associé.</p>';
      return;
    }

    const sites = [];
    snapshot.forEach(doc => sites.push({ id: doc.id, ...doc.data() }));

    detailSitesContainer.innerHTML = `<ul class="detail-projets-list">
      ${sites.map(s => {
        const status = getEffectiveSiteStatus(s);
        const statusClass = getSiteStatusClass(status);
        return `<li><i class="fa-solid fa-globe"></i> <span>${escapeHtml(s.domain || '—')}</span> <span class="site-status-badge ${statusClass}" style="margin-left:auto;">${status}</span></li>`;
      }).join('')}
    </ul>`;
  } catch (err) {
    console.error(err);
    detailSitesContainer.innerHTML = '<p class="detail-projets-empty">Erreur lors du chargement.</p>';
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

  // Manager-only project-level controls
  const isProjManager = canEditProjectDetails();
  const addFileBtn = document.getElementById('btn-add-file');
  const deleteProjetBtn = document.getElementById('btn-delete-projet');
  if (addFileBtn) {
    addFileBtn.style.display = (isProjManager || getAllowedFolders().length > 0) ? '' : 'none';
  }
  if (deleteProjetBtn) {
    deleteProjetBtn.style.display = isProjManager ? '' : 'none';
  }

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

  const canEdit = isManager();

  editableFields.forEach(f => {
    const displayVal = f.display || f.value || '—';
    html += `<div class="detail-info-item-editable" data-field="${f.key}">
      <div class="detail-info-content">
        <span class="detail-info-label">${f.label}</span>
        <span class="detail-info-value">${displayVal}</span>
        <input class="detail-field-input" type="${f.type}" value="${f.value}" />
      </div>
      ${canEdit ? `<button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>` : ''}
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
    ${canEdit ? `<button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>` : ''}
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
    ${canEdit ? `<button class="detail-field-edit" title="Modifier"><i class="fa-solid fa-pencil"></i></button>` : ''}
  </div>`;

  projetPageInfo.innerHTML = html;

  // Attach edit handlers
  projetPageInfo.querySelectorAll('.detail-info-item-editable').forEach(item => {
    const editBtn = item.querySelector('.detail-field-edit');
    const input = item.querySelector('.detail-field-input');

    if (!editBtn) return;
    editBtn.addEventListener('click', async () => {
      if (!isManager()) {
        showToast('Action réservée aux managers.', 'error');
        return;
      }
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
            const previousValue = currentPageProjet[key];
            await db.collection('projets').doc(currentPageProjet.id).update({ [key]: newValue });
            currentPageProjet[key] = newValue;
            
            // If delivery date changed, refresh file tree and notify team
            if (key === 'dateLivraison' && newValue !== previousValue) {
              renderProjetPageFiles(currentPageProjet);
              notifyProjectDateChange('Livraison projet', newValue);
              logActivity({ action: 'date_change', projetName: currentPageProjet?.nom });
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

  // Hide edit controls for non-managers
  if (!canEditProjectDetails()) {
    projetPageInfo.querySelectorAll('.detail-field-edit').forEach(btn => btn.style.display = 'none');
  }
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

  // Hide edit control for non-managers
  if (projetPageResumeEdit) {
    projetPageResumeEdit.style.display = canEditProjectDetails() ? '' : 'none';
  }
}

projetPageResumeEdit.addEventListener('click', async () => {
  if (!canEditProjectDetails()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }
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

  // Hide edit control for non-managers
  if (projetPageTeamEditBtn) {
    projetPageTeamEditBtn.style.display = canEditProjectDetails() ? '' : 'none';
  }
}

projetPageTeamEditBtn.addEventListener('click', async () => {
  if (!canEditProjectDetails()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }

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
  if (!canEditProjectDetails()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }
  const confirmed = confirm(`Supprimer le projet « ${currentPageProjet.nom} » ? Cette action est irréversible.`);
  if (!confirmed) return;

  try {
    const deletedNom = currentPageProjet.nom;
    await db.collection('projets').doc(currentPageProjet.id).delete();
    logActivity({ action: 'projet_delete', projetName: deletedNom });
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
    'Devis': { required: true }
  },
  '02 - Analyse': {
    'Cahier des charges': { required: true },
    'Arborescence': { required: true }
  },
  '03 - Design': {
    'Maquette': { required: true },
    'Charte graphique': { required: true },
    'Assets': { required: true }
  },
  '04 - Développement': {
    'Site Web': { required: true }
  },
  '05 - Tests': {
    'Rapport QA': { required: true }
  },
  '06 - Livraison': {
    'Documentation': { required: true },
    'Identifiants': { required: true },
    'Guide utilisateur': { required: true }
  }
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
    // Check project delivery date (managers only)
    if (projet.dateLivraison && isManager()) {
      planningProjects.push({
        projet,
        date: projet.dateLivraison,
        type: 'project',
        folder: null
      });
    }

    // Check folder delivery dates (filtered by role)
    if (projet.folderDates) {
      const allowedFolders = getAllowedFolders();
      Object.keys(projet.folderDates).forEach(folder => {
        if (projet.folderDates[folder] && allowedFolders.includes(folder)) {
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

  // Site expiration events (managers only)
  if (isManager()) {
    allSites.forEach(site => {
      if (site.expirationDate) {
        const exp = new Date(site.expirationDate);
        const offsets = [
          { days: -90, label: '90 jours' },
          { days: -30, label: '30 jours' },
          { days: -7, label: '7 jours' },
          { days: 0, label: 'Jour J' }
        ];
        offsets.forEach(o => {
          const date = new Date(exp);
          date.setDate(date.getDate() + o.days);
          planningProjects.push({
            site,
            date: date.toISOString().split('T')[0],
            type: 'site_expiration',
            label: `Expiration ${o.label}`,
            folder: null
          });
        });
      }
    });
  }

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
  if (item.type === 'site_expiration') {
    const site = item.site;
    return `
      <div class="planning-project planning-site-expiration" onclick="openSiteFromPlanning('${site.id}')">
        <div class="planning-project-title">${escapeHtml(site.domain || '—')}</div>
        <div class="planning-project-id">${item.label}</div>
        <div class="planning-project-company">${escapeHtml(site.clientName || '—')}</div>
      </div>
    `;
  }

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

function openSiteFromPlanning(siteId) {
  const site = allSites.find(s => s.id === siteId);
  if (!site) return;

  // Navigate to Sites Web section
  navItems.forEach(i => i.classList.remove('active'));
  sections.forEach(s => s.classList.remove('active'));
  const navItem = Array.from(navItems).find(i => i.dataset.label === 'Sites Web');
  const section = document.getElementById('section-sitesweb');
  if (navItem) navItem.classList.add('active');
  if (section) section.classList.add('active');

  openSitePage(site);
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

  // If specific folder is provided, only show that folder (but still respect role permissions)
  const allowedFolders = getAllowedFolders();
  const foldersToShow = specificFolder
    ? (allowedFolders.includes(specificFolder) ? [specificFolder] : [])
    : allowedFolders;
  
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
        
        const folderEditable = canEditFolder(folder);
        const uploadIcon = !isUploaded
          ? (folderEditable
            ? `<button class="task-upload-icon" onclick="uploadTaskFile('${projet.id}', '${folder}', '${fileName}')" title="Importer ce fichier">
                <i class="fa-solid fa-cloud-upload-alt"></i>
              </button>`
            : `<div class="task-upload-icon" style="opacity:0;cursor:default;" title="Lecture seule"></div>`)
          : `<div class="task-uploaded-icon" title="Fichier importé">
                <i class="fa-solid fa-check-circle"></i>
              </div>`;
        
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
  if (!canEditFolder(folder)) {
    showToast('Action réservée aux rôles autorisés.', 'error');
    return;
  }
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
      const filePath = sanitizeStoragePath(`${projetId}/${folder}/${fullFileName}`);
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

      // Notify all project members
      const recipients = getAllProjectMemberEmails(projet);
      console.log('[TASK UPLOAD] projet.team:', projet.team, '| allUsers.length:', allUsers.length, '| recipients:', recipients);
      if (recipients.length > 0) {
        const userName = currentUserProfile?.displayName || auth.currentUser?.displayName || 'Un utilisateur';
        const projetName = projet.nom || 'Projet';
        sendNotificationEmail({
          to: recipients,
          subject: `[Karbonn] Fichier déposé – ${projetName}`,
          text: `${userName} a déposé un fichier dans le projet « ${projetName} ».\n\nDossier : ${folder}\nFichier : ${fullFileName}\n`,
          html: buildEmailHtml({
            title: 'Fichier déposé',
            intro: `${userName} a déposé un fichier dans le projet ${projetName}.`,
            lines: [`Dossier : ${folder}`, `Fichier : ${fullFileName}`],
            buttonText: 'Voir le projet',
            buttonHref: `${window.location.origin}/intranet.html`
          })
        });
      } else {
        console.warn('[TASK UPLOAD] No recipients found — check team members and allUsers.');
      }
      logActivity({ action: 'file_upload', projetName: projet.nom, fileName: fullFileName, folderName: folder });

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
    const folderEditable = canEditFolder(folder);
    const folderReadOnlyClass = folderEditable ? '' : 'folder-read-only';

    // Get folder delivery date
    const folderDates = currentPageProjet.folderDates || {};
    let deliveryDate = folderDates[folder];
    const isLivraisonFolder = folder === '06 - Livraison';

    // For Livraison folder, use project's delivery date if no specific date is set
    if (isLivraisonFolder && !deliveryDate && currentPageProjet.dateLivraison) {
      deliveryDate = currentPageProjet.dateLivraison;
    }

    const deliveryDateDisplay = deliveryDate ? new Date(deliveryDate).toLocaleDateString('fr-FR') : '';

    const folderActions = isManager() ? `
      <div class="tree-node-actions">
        <button onclick="openFolderDateModal('${folder}')" title="Définir la date de livraison">
          <i class="fa-solid fa-calendar"></i>
        </button>
      </div>
    ` : '';

    html += `<div class="tree-node ${hasFiles ? 'expanded' : 'empty'} ${folderReadOnlyClass}" data-folder="${folder}">
      <div class="tree-node-content">
        <i class="fa-solid ${hasFiles ? 'fa-folder-open' : 'fa-folder'}"></i>
        <span>${folder}</span>
        ${deliveryDateDisplay ? `<span class="folder-date">${deliveryDateDisplay}</span>` : ''}
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
        </button>`;
        if (folderEditable) {
          html += `<button onclick="editFile('${folder}', '${uploaded.filename}')" title="Modifier">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button onclick="deleteFile('${folder}', '${uploaded.filename}')" title="Supprimer">
            <i class="fa-solid fa-trash"></i>
          </button>`;
        }
      } else if (folderEditable) {
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
              </button>`;
        if (folderEditable) {
          html += `<button onclick="editFile('${folder}', '${fileData.filename}')" title="Modifier">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button onclick="deleteFile('${folder}', '${fileData.filename}')" title="Supprimer">
                <i class="fa-solid fa-trash"></i>
              </button>`;
        }
        html += `</div>
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
  if (!canEditFolder(folder)) {
    showToast('Action réservée aux rôles autorisés.', 'error');
    return;
  }

  // Filter dropdown options to only allowed folders
  const allowedFolders = getAllowedFolders();
  fileUploadFolder.innerHTML = allowedFolders.map(f => `<option value="${f}">${f}</option>`).join('');
  fileUploadFolder.value = allowedFolders.includes(folder) ? folder : allowedFolders[0];

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
  const allowedFolders = getAllowedFolders();
  openFileUploadModal(allowedFolders[0] || '');
});

fileUploadClose.addEventListener('click', () => fileUploadModal.classList.remove('visible'));
fileUploadModal.addEventListener('click', e => {
  if (e.target === fileUploadModal) fileUploadModal.classList.remove('visible');
});

// Folder date modal functions
function openFolderDateModal(folder) {
  if (!isManager()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }
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
  if (!isManager()) {
    showToast('Action réservée aux managers.', 'error');
    return;
  }
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
    notifyProjectDateChange('Livraison dossier', deliveryDate, folder);
    logActivity({ action: 'date_change', projetName: currentPageProjet?.nom, folderName: folder });
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
  if (!canEditFolder(folder)) {
    fileUploadError.textContent = 'Vous n\'avez pas la permission d\'ajouter un fichier dans ce dossier.';
    return;
  }
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
      const filePath = sanitizeStoragePath(`${currentPageProjet.id}/${folder}/${customName}`);
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
              notifyFileChange(folder, customName, isEditing);
              logActivity({ action: isEditing ? 'file_edit' : 'file_upload', projetName: currentPageProjet?.nom, fileName: customName, folderName: folder });
              
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
      notifyFileChange(folder, customName, isEditing);
      logActivity({ action: isEditing ? 'file_edit' : 'file_upload', projetName: currentPageProjet?.nom, fileName: customName, folderName: folder });
      
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
  if (!canEditFolder(folder)) {
    showToast('Action réservée aux rôles autorisés.', 'error');
    return;
  }
  openFileUploadModal(folder, filename);
}

// Upload required file function
function uploadRequiredFile(folder, filename) {
  if (!canEditFolder(folder)) {
    showToast('Action réservée aux rôles autorisés.', 'error');
    return;
  }
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
  if (!canEditFolder(folder)) {
    showToast('Action réservée aux rôles autorisés.', 'error');
    return;
  }
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
    logActivity({ action: 'file_delete', projetName: currentPageProjet?.nom, fileName: filename, folderName: folder });
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
const userRoleInput = document.getElementById('user-role-select');
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

const FOLDER_ROLE_PERMISSIONS = {
  '01 - Administration': ['Manager'],
  '02 - Analyse': ['Manager'],
  '03 - Design': ['Manager', 'Designer Graphique'],
  '04 - Développement': ['Manager', 'Développeur'],
  '05 - Tests': ['Manager', 'Développeur'],
  '06 - Livraison': ['Manager', 'Développeur']
};

function canEditFolder(folderName, role = currentUserRole) {
  if (role === 'Manager') return true;
  const allowed = FOLDER_ROLE_PERMISSIONS[folderName] || [];
  return allowed.includes(role);
}

function getAllowedFolders(role = currentUserRole) {
  if (role === 'Manager') return Object.keys(FOLDER_ROLE_PERMISSIONS);
  return Object.keys(FOLDER_ROLE_PERMISSIONS).filter(folder => {
    const allowed = FOLDER_ROLE_PERMISSIONS[folder] || [];
    return allowed.includes(role);
  });
}

function canEditProjectDetails() {
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
      logActivity({ action: 'member_create', projetName: displayName || email });
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
    await apiRequest(`/api/users/${uid}`, { method: 'DELETE' });
    const deletedMember = allUsers.find(u => u.uid === uid);
    await db.collection('users').doc(uid).delete();
    logActivity({ action: 'member_delete', projetName: deletedMember?.displayName || uid });
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

