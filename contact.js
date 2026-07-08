// contact.js

// ── GRILLE HERO INTERACTIVE ──────────────────────────────
const contactHeroGrid = document.getElementById('contactHeroGrid');
if (contactHeroGrid) {
  const cols = 40;
  const rows = 28;

  function getComplementaryColorContact() {
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    let hex = accent.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
    }
    return 'rgb(243, 251, 0)';
  }

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'contact-hero__grid-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'contact-hero__grid-cell';
      row.appendChild(cell);
    }
    contactHeroGrid.appendChild(row);
  }

  contactHeroGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('contact-hero__grid-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColorContact();
      cell.style.background = compColor.replace('rgb', 'rgba').replace(')', ', 0.12)');
      cell.style.borderColor = compColor.replace('rgb', 'rgba').replace(')', ', 0.25)');
      cell.style.boxShadow = `0 0 20px ${compColor.replace('rgb', 'rgba').replace(')', ', 0.15)')}`;
      setTimeout(() => {
        cell.style.background = '';
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }, 500);
    }
  });
}

// ── TRAIT ANIMÉ CERCLE DÉFILER ───────────────────────────
const ringLine = document.querySelector('.scroll-ring__line');
if (ringLine) {
  const CYCLE_MS = 2000;
  let isAccent = false;

  function getRingColor() {
    return isAccent
      ? (localStorage.getItem('carbonAccent') || '#0c04ff')
      : '#ffffff';
  }

  ringLine.setAttribute('stroke', getRingColor());

  ringLine.addEventListener('animationiteration', () => {
    isAccent = !isAccent;
    ringLine.setAttribute('stroke', getRingColor());
  });
}

// ── SCROLL VERS FORMULAIRE ───────────────────────────────
const scrollBtn = document.getElementById('scrollToForm');
if (scrollBtn) {
  scrollBtn.addEventListener('click', () => {
    document.getElementById('contactForm').scrollIntoView({ behavior: 'smooth' });
  });
}

// ── STATUT AGENCE (BARRE INFOS) ──────────────────────────
const OPEN_HOUR_C = 9;
const CLOSE_HOUR_C = 18;
const TEL_C = '+33 7 76 69 16 06';

function updateContactStatus() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const dot = document.getElementById('contactStatusDot');
  const text = document.getElementById('contactStatusText');
  if (!dot || !text) return;

  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && hour >= OPEN_HOUR_C && hour < CLOSE_HOUR_C;
  const isSoon = !isWeekend && hour >= CLOSE_HOUR_C - 1 && hour < CLOSE_HOUR_C;

  if (isWeekend || (!isOpen && !isSoon)) {
    dot.className = 'contact-infos__dot closed';
    text.className = 'contact-infos__status closed';
    text.textContent = 'Agence fermée';
  } else if (isSoon) {
    dot.className = 'contact-infos__dot soon';
    text.className = 'contact-infos__status soon';
    text.textContent = 'Bientôt fermée';
  } else {
    dot.className = 'contact-infos__dot open';
    text.className = 'contact-infos__status open';
    text.textContent = 'Agence ouverte';
  }
}

updateContactStatus();
setInterval(updateContactStatus, 60000);

// ── REVEAL TÉLÉPHONE ─────────────────────────────────────
const contactTelReveal = document.getElementById('contactTelReveal');
const contactTelLabel = document.getElementById('contactTelLabel');

if (contactTelReveal) {
  contactTelReveal.addEventListener('click', () => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const isWeekend = day === 0 || day === 6;
    const isOpen = !isWeekend && hour >= OPEN_HOUR_C && hour < CLOSE_HOUR_C;

    if (!isOpen) {
      contactTelLabel.textContent = 'Agence fermée';
      contactTelReveal.style.color = '#ef4444';
      contactTelReveal.style.borderColor = '#ef4444';
      return;
    }
    contactTelLabel.textContent = TEL_C;
    contactTelReveal.classList.add('revealed');
  });
}

// ── TABS FORMULAIRE ──────────────────────────────────────
document.querySelectorAll('.contact-main__right .contact-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.contact-main__right .contact-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.contact-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('form-' + tab.dataset.tab).classList.add('active');
  });
});

// ── CAPTCHAS ─────────────────────────────────────────────
function generateCaptchaContact(questionEl, answerId) {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  questionEl.textContent = `= Combien font ${a} + ${b} ?`;
  questionEl.dataset.answer = a + b;
  document.getElementById(answerId).dataset.expected = a + b;
}

const cq1 = document.getElementById('captcha-q1');
const cq2 = document.getElementById('captcha-q2');
if (cq1) generateCaptchaContact(cq1, 'captcha-a1');
if (cq2) generateCaptchaContact(cq2, 'captcha-a2');

// ── SOUMISSION FORMULAIRES ───────────────────────────────
const FORMSPREE_ENDPOINTS = {
  'form-particulier': 'https://formspree.io/f/xdarvypz',
  'form-professionnel': 'https://formspree.io/f/mjgqdjpw',
};

document.querySelectorAll('.contact-form').forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const captchaInput = form.querySelector('[name="captcha"]');
    const expected = parseInt(captchaInput.dataset.expected);
    if (parseInt(captchaInput.value) !== expected) {
      captchaInput.style.borderColor = '#ef4444';
      captchaInput.focus();
      return;
    }
    captchaInput.style.borderColor = '';

    const submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Envoi en cours…';

    const endpoint = FORMSPREE_ENDPOINTS[form.id];
    const data = new FormData(form);
    data.delete('captcha');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        const right = document.querySelector('.contact-main__right');
        right.querySelectorAll('.contact-form').forEach(f => f.classList.remove('active'));
        right.querySelector('.contact-tabs').style.display = 'none';
        document.getElementById('formSuccess').classList.add('is-visible');
      } else {
        const json = await res.json();
        const msg = json?.errors?.map(e => e.message).join(', ') || 'Une erreur est survenue.';
        submitBtn.querySelector('span').textContent = msg;
        submitBtn.style.background = '#ef4444';
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.querySelector('span').textContent = 'Envoyer le message';
          submitBtn.style.background = '';
        }, 3000);
      }
    } catch {
      submitBtn.querySelector('span').textContent = 'Erreur réseau, réessayez.';
      submitBtn.style.background = '#ef4444';
      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = 'Envoyer le message';
        submitBtn.style.background = '';
      }, 3000);
    }
  });
});

// ── SLIDER BUDGET ─────────────────────────────────────────
function initBudgetSlider(sliderId, valueId) {
  const slider = document.getElementById(sliderId);
  const valueEl = document.getElementById(valueId);
  if (!slider || !valueEl) return;

  function updateVal() {
    const v = parseInt(slider.value);
    const min = parseInt(slider.min);
    const max = parseInt(slider.max);
    const pct = (v - min) / (max - min);
    const formatted = v.toLocaleString('fr-FR') + ' €';
    if (v <= min) valueEl.textContent = '− ' + formatted;
    else if (v >= max) valueEl.textContent = formatted + ' +';
    else valueEl.textContent = formatted;

    slider.style.background = `linear-gradient(to right, var(--accent) ${pct * 100}%, rgba(0,0,15,0.12) ${pct * 100}%)`;
  }

  slider.addEventListener('input', updateVal);
  updateVal();
}

initBudgetSlider('p-budget', 'p-budget-val');
initBudgetSlider('b-budget', 'b-budget-val');
