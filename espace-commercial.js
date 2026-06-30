const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userAvatarEl = document.getElementById('user-avatar');

function updateProfile(user, profile) {
  const name = profile?.displayName || user.displayName || user.email.split('@')[0];
  const role = profile?.role?.label || profile?.role || 'Utilisateur';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  if (userNameEl) userNameEl.textContent = name;
  if (userRoleEl) userRoleEl.textContent = role;
  if (userAvatarEl) userAvatarEl.textContent = initials;
}

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = 'intranet.html';
    return;
  }

  try {
    const doc = await db.collection('users').doc(user.uid).get();
    const profile = doc.exists ? doc.data() : null;
    updateProfile(user, profile);
  } catch (err) {
    console.error(err);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
});

// Modal logic
const modal = document.getElementById('client-modal');
const openModalBtn = document.getElementById('create-client-btn');
const closeModalBtn = document.getElementById('close-modal');
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const btnParticulier = document.getElementById('btn-particulier');
const btnProfessionnel = document.getElementById('btn-professionnel');
const backStep1 = document.getElementById('back-step-1');
const formParticulier = document.getElementById('form-particulier');
const formProfessionnel = document.getElementById('form-professionnel');
const modalError = document.getElementById('modal-error');
const clientTypeInput = document.getElementById('client-type');

let selectedType = null;

function showStep(step) {
  step1.classList.add('hidden');
  step2.classList.add('hidden');
  if (step === 1) step1.classList.remove('hidden');
  if (step === 2) step2.classList.remove('hidden');
  modalError.textContent = '';
}

function openModal() {
  modal.classList.remove('hidden');
  selectedType = null;
  clientTypeInput.value = '';
  formParticulier.reset();
  formProfessionnel.reset();
  formParticulier.classList.add('hidden');
  formProfessionnel.classList.add('hidden');
  showStep(1);
}

function closeModal() {
  modal.classList.add('hidden');
}

openModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);

modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

function selectType(type) {
  selectedType = type;
  clientTypeInput.value = type;
  showStep(2);
  formParticulier.classList.toggle('hidden', type !== 'particulier');
  formProfessionnel.classList.toggle('hidden', type !== 'professionnel');
}

btnParticulier.addEventListener('click', () => selectType('particulier'));
btnProfessionnel.addEventListener('click', () => selectType('professionnel'));
backStep1.addEventListener('click', () => showStep(1));

async function saveClient(data) {
  const user = auth.currentUser;
  if (!user) throw new Error('Non authentifié');

  await db.collection('clients').add({
    ...data,
    type: selectedType,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdBy: user.uid
  });
}

async function handleFormSubmit(e, form) {
  e.preventDefault();
  modalError.textContent = '';

  const data = {};
  const inputs = form.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (input.name) data[input.name] = input.value.trim();
  });

  try {
    await saveClient(data);
    closeModal();
    alert('Client créé avec succès.');
  } catch (err) {
    console.error(err);
    modalError.textContent = 'Erreur lors de la création du client.';
  }
}

formParticulier.addEventListener('submit', e => handleFormSubmit(e, formParticulier));
formProfessionnel.addEventListener('submit', e => handleFormSubmit(e, formProfessionnel));
