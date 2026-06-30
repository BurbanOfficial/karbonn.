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

function showApp(client) {
  loginScreen.classList.add('hidden');
  appContent.classList.remove('hidden');

  const name = [client.prenom, client.nom].filter(Boolean).join(' ') || 'Client';
  if (clientNameEl) clientNameEl.textContent = name;
  if (clientBadgeEl) clientBadgeEl.textContent = client.clientId;
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
