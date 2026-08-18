// script.js

// Global FAQ Toggle Function
function toggleFaq(header) {
  const item = header.parentElement;
  const answer = item.querySelector('.faq-answer');
  const icon = header.querySelector('.faq-toggle i');
  const isOpen = item.classList.contains('is-open');
  
  // Close all other items
  document.querySelectorAll('.faq-item.is-open').forEach(openItem => {
    if (openItem !== item) {
      openItem.classList.remove('is-open');
      const openAnswer = openItem.querySelector('.faq-answer');
      const openIcon = openItem.querySelector('.faq-toggle i');
      if (openAnswer) openAnswer.style.maxHeight = null;
      if (openIcon) {
        openIcon.classList.remove('fa-minus');
        openIcon.classList.add('fa-plus');
      }
    }
  });
  
  // Toggle current item
  if (isOpen) {
    item.classList.remove('is-open');
    answer.style.maxHeight = null;
    icon.classList.remove('fa-minus');
    icon.classList.add('fa-plus');
  } else {
    item.classList.add('is-open');
    answer.style.maxHeight = answer.scrollHeight + 'px';
    icon.classList.remove('fa-plus');
    icon.classList.add('fa-minus');
  }
}

// Update accent color from localStorage immediately
const accentColor = localStorage.getItem('carbonAccent') || '#0c04ff';
document.documentElement.style.setProperty('--accent', accentColor);
let hex = accentColor.replace('#', '');
if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
if (hex.length === 6) {
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
}

const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');

let mouseRawX = 0, mouseRawY = 0;
let ringX = 0, ringY = 0;

const heroCoords = document.getElementById('heroCoords');

if (!isTouchDevice && dot && ring) {
  document.addEventListener('mousemove', (e) => {
    mouseRawX = e.clientX;
    mouseRawY = e.clientY;
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  });

  function lerpCursor() {
    ringX += (mouseRawX - ringX) * 0.1;
    ringY += (mouseRawY - ringY) * 0.1;
    ring.style.left = ringX + 'px';
    ring.style.top = ringY + 'px';
    requestAnimationFrame(lerpCursor);
  }

  lerpCursor();
}

document.addEventListener('mousemove', (e) => {
  if (heroCoords) {
    heroCoords.textContent = `${e.clientX.toString().padStart(4, '0')}, ${e.clientY.toString().padStart(4, '0')}`;
  }
});

// Mise à l'échelle proportionnelle de la composition hero (même construction qu'en grand écran)
const HERO_DESIGN_WIDTH = 1200;
const heroStage = document.querySelector('.hero-stage');
const heroWrapper = document.querySelector('.tagline-wrapper');

function updateHeroScale() {
  if (!heroStage || !heroWrapper) return;
  if (window.innerWidth >= HERO_DESIGN_WIDTH) {
    document.documentElement.style.removeProperty('--hero-scale');
    heroStage.style.height = '';
    return;
  }
  const scale = window.innerWidth / HERO_DESIGN_WIDTH;
  document.documentElement.style.setProperty('--hero-scale', scale);
  heroStage.style.height = (heroWrapper.offsetHeight * scale) + 'px';
}

updateHeroScale();
window.addEventListener('resize', updateHeroScale);
window.addEventListener('load', updateHeroScale);

const navOverlay = document.getElementById('navOverlay');
const menuBtn = document.querySelector('.menu-btn');
const navClose = document.getElementById('navClose');

function generateCaptcha(questionEl, answerId) {
  const a = Math.floor(Math.random() * 10) + 1;
  const b = Math.floor(Math.random() * 10) + 1;
  questionEl.textContent = `= Combien font ${a} + ${b} ?`;
  questionEl.dataset.answer = a + b;
  document.getElementById(answerId).dataset.expected = a + b;
}

const captchaQ1 = document.getElementById('captcha-q1');
const captchaQ2 = document.getElementById('captcha-q2');
if (captchaQ1) generateCaptcha(captchaQ1, 'captcha-a1');
if (captchaQ2) generateCaptcha(captchaQ2, 'captcha-a2');

document.querySelectorAll('.contact-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.contact-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.contact-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('form-' + tab.dataset.tab).classList.add('active');
  });
});

const FORMSPREE_INDEX = {
  'form-particulier': 'https://formspree.io/f/xdarvypz',
  'form-professionnel': 'https://formspree.io/f/mjgqdjpw',
};

document.querySelectorAll('.contact-form').forEach(form => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const captchaInput = form.querySelector('[name="captcha"]');
    const expected = parseInt(captchaInput.dataset.expected);
    if (parseInt(captchaInput.value) !== expected) {
      captchaInput.style.borderColor = '#ff0000';
      captchaInput.focus();
      return;
    }
    captchaInput.style.borderColor = '';

    const submitBtn = form.querySelector('.form-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours…';

    const endpoint = FORMSPREE_INDEX[form.id];
    const data = new FormData(form);
    data.delete('captcha');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        form.innerHTML = '<p style="color:#22c55e;font-family:Space Grotesk,sans-serif;padding:16px 0">Message envoyé ! Nous vous répondrons dans les 24h. À très vite.</p>';
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Envoyer le message';
        alert('Une erreur est survenue. Merci de réessayer.');
      }
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer le message';
      alert('Erreur réseau. Merci de réessayer.');
    }
  });
});

const typewriterEl = document.getElementById('typewriter');
if (typewriterEl) {
const typewriterPhrases = [
  'Le digital sans compromis',
  'Développement Web',
  'Design UI/UX',
  'Communication Digitale',
  'Automatisation & IA',
  'Outils Métiers',
  'Hébergement & Infrastructure',
  'Accompagnement',
];
let twIndex = 0;
let twChar = 0;
let twDeleting = false;

function twRender(phrase, done) {
  const text = phrase.slice(0, twChar);
  if (done) {
    typewriterEl.innerHTML = `<span class="tw-prefix">_</span>${text}`;
  } else {
    typewriterEl.textContent = '_' + text;
  }
}

function typewriterTick() {
  const phrase = typewriterPhrases[twIndex];
  if (!twDeleting) {
    twChar++;
    const done = twChar === phrase.length;
    twRender(phrase, done);
    if (done) {
      setTimeout(() => { twDeleting = true; typewriterTick(); }, 2000);
      return;
    }
    setTimeout(typewriterTick, 55);
  } else {
    twChar--;
    twRender(phrase, false);
    if (twChar === 0) {
      twDeleting = false;
      twIndex = (twIndex + 1) % typewriterPhrases.length;
      setTimeout(typewriterTick, 400);
      return;
    }
    setTimeout(typewriterTick, 30);
  }
}

typewriterTick();
}

const ACCENT_COLORS = [
  '#0c04ff', '#6600cc', '#cc0066', '#ff0044',
  '#ff4400', '#cc6600', '#00aa44', '#00bbcc',
  '#8800cc', '#dd0099', '#00cc88', '#ff6600',
  '#aa0044', '#0044bb', '#009933', '#cc3300',
];

const logoEl = document.querySelector('.logo-text');
let currentAccent = localStorage.getItem('carbonAccent') || '#0c04ff';

// Apply saved color on load
document.documentElement.style.setProperty('--accent', currentAccent);

if (logoEl) {
logoEl.addEventListener('mouseenter', () => {
  const others = ACCENT_COLORS.filter(c => c !== currentAccent);
  currentAccent = others[Math.floor(Math.random() * others.length)];
  document.documentElement.style.setProperty('--accent', currentAccent);
  localStorage.setItem('carbonAccent', currentAccent);
});
}

const parallaxTargets = [
  { el: document.querySelector('.hero-image'),       fx: -40, fy: -24, base: 'translate(-75%, -39.9%)' },
  { el: document.querySelector('.hero-image-small'), fx:  28, fy:  18, base: '' },
  { el: document.querySelector('.hero-coords'),      fx: -14, fy:  30, base: 'rotate(-90deg)' },
  { el: document.querySelector('.hero-caption'),     fx:  18, fy: -14, base: '' },
  { el: document.querySelector('.logo-text'),        fx: -10, fy:  -8, base: '' },
  { el: document.querySelector('#typewriter'),       fx:  12, fy:  10, base: '' },
  { el: document.querySelector('.hero-descriptor'),  fx:  -8, fy:  -6, base: '' },
  { el: document.querySelector('.formules-header'),  fx:  -6, fy:  -4, base: '' },
  { el: document.querySelector('.formules-grid'),    fx:   6, fy:   4, base: '' },
  { el: document.querySelector('.formules-compare'), fx:  -4, fy:  -3, base: '' },
  { el: document.querySelector('.hosting-info'),     fx:   4, fy:   3, base: '' },
  { el: document.querySelector('.faq-hero__label'),  fx:  -4, fy:  -3, base: '' },
  { el: document.querySelector('.faq-hero__title'),  fx:  -6, fy:  -4, base: '' },
  { el: document.querySelector('.faq-hero__subtitle'), fx: -2, fy: -2, base: '' },
  { el: document.querySelector('.faq-section'),      fx:   4, fy:   3, base: '' },
  { el: document.querySelector('.projets-hero__label'),   fx:  -4, fy:  -3, base: '' },
  { el: document.querySelector('.projets-hero__title'),   fx:  -6, fy:  -4, base: '' },
  { el: document.querySelector('.projets-hero__subtitle'), fx: -2, fy: -2, base: '' },
];

let rafId = null;
let mouseX = 0, mouseY = 0;

if (!isTouchDevice) {
  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth  - 0.5);
    mouseY = (e.clientY / window.innerHeight - 0.5);
    if (!rafId) {
      rafId = requestAnimationFrame(applyParallax);
    }
  });
}

function applyParallax() {
  if (window.innerWidth <= 768) {
    parallaxTargets.forEach(({ el, base }) => {
      if (!el) return;
      el.style.transform = base || '';
    });
    rafId = null;
    return;
  }
  parallaxTargets.forEach(({ el, fx, fy, base }) => {
    if (!el) return;
    const dx = mouseX * fx;
    const dy = mouseY * fy;
    el.style.transform = base
      ? `${base} translate(${dx}px, ${dy}px)`
      : `translate(${dx}px, ${dy}px)`;
  });
  rafId = null;
}

document.getElementById('footerYear').textContent = new Date().getFullYear();

const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;
const TEL = '+33 7 76 69 16 06';

function updateFooterStatus() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const dot = document.getElementById('footerStatusDot');
  const text = document.getElementById('footerStatusText');
  const hoursEl = document.getElementById('footerHours');
  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
  const isSoon = !isWeekend && hour >= CLOSE_HOUR - 1 && hour < CLOSE_HOUR;

  if (isWeekend || (!isOpen && !isSoon)) {
    dot.className = 'footer-status-dot closed';
    text.className = 'footer-status-text closed';
    text.textContent = 'Agence fermée';
    hoursEl.textContent = `Lun–Ven ${OPEN_HOUR}h–${CLOSE_HOUR}h`;
  } else if (isSoon) {
    dot.className = 'footer-status-dot soon';
    text.className = 'footer-status-text soon';
    text.textContent = 'Bientôt fermée';
    hoursEl.textContent = `Ferme à ${CLOSE_HOUR}h`;
  } else {
    dot.className = 'footer-status-dot open';
    text.className = 'footer-status-text open';
    text.textContent = 'Agence ouverte';
    hoursEl.textContent = `Jusqu'à ${CLOSE_HOUR}h`;
  }
}

updateFooterStatus();
setInterval(updateFooterStatus, 60000);

const telBtn = document.getElementById('footerTelBtn');
const telLabel = document.getElementById('footerTelLabel');

telBtn.addEventListener('click', () => {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;
  const isOpen = !isWeekend && hour >= OPEN_HOUR && hour < CLOSE_HOUR;

  if (!isOpen) {
    telLabel.textContent = 'Agence fermée';
    telBtn.style.color = '#ef4444';
    telBtn.style.borderColor = '#ef4444';
    return;
  }
  telLabel.textContent = TEL;
  telBtn.classList.add('revealed');
});

menuBtn.addEventListener('click', () => {
  navOverlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
});

navClose.addEventListener('click', () => {
  navOverlay.classList.remove('is-open');
  document.body.style.overflow = '';
});

// Apple-style 3D Grid for Sur-mesure section
const surmesureGrid = document.getElementById('surmesureGrid');
if (surmesureGrid) {
  const cols = 43;
  const rows = 31;
  
  function getComplementaryColor() {
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    let hex = accent.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const compR = 255 - r;
      const compG = 255 - g;
      const compB = 255 - b;
      return `rgb(${compR}, ${compG}, ${compB})`;
    }
    return 'rgb(243, 251, 0)';
  }
  
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'surmesure-grid-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'surmesure-grid-cell';
      row.appendChild(cell);
    }
    surmesureGrid.appendChild(row);
  }
  
  surmesureGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('surmesure-grid-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColor();
      cell.style.background = compColor.replace('rgb', 'rgba').replace(')', ', 0.6)');
      cell.style.borderColor = compColor.replace('rgb', 'rgba').replace(')', ', 0.8)');
      cell.style.boxShadow = `0 0 15px ${compColor.replace('rgb', 'rgba').replace(')', ', 0.5)')}`;
      
      setTimeout(() => {
        cell.style.background = '';
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }, 300);
    }
  });
}

// Smooth hover dim effect for nav menu
const navMenu = document.querySelector('.nav-menu');
if (navMenu) {
  navMenu.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    navMenu.classList.add('has-hover');
    link.classList.add('is-hovered');
  });
  
  navMenu.addEventListener('mouseout', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    
    const relatedLink = e.relatedTarget?.closest('a');
    const stillInMenu = relatedLink && navMenu.contains(relatedLink);
    
    if (!stillInMenu) {
      navMenu.classList.remove('has-hover');
    }
    link.classList.remove('is-hovered');
  });
}

// FAQ Accordion functionality is handled by global toggleFaq() function in HTML onclick

// Apple-style 3D Grid for FAQ Hero section
const faqHeroGrid = document.getElementById('faqHeroGrid');
if (faqHeroGrid) {
  const cols = 42;
  const rows = 30;

  function getComplementaryColorHero() {
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    let hex = accent.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const compR = 255 - r;
      const compG = 255 - g;
      const compB = 255 - b;
      return `rgb(${compR}, ${compG}, ${compB})`;
    }
    return 'rgb(243, 251, 0)';
  }

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'faq-hero__grid-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'faq-hero__grid-cell';
      row.appendChild(cell);
    }
    faqHeroGrid.appendChild(row);
  }

  faqHeroGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('faq-hero__grid-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColorHero();
      cell.style.background = compColor.replace('rgb', 'rgba').replace(')', ', 0.5)');
      cell.style.borderColor = compColor.replace('rgb', 'rgba').replace(')', ', 0.7)');
      cell.style.boxShadow = `0 0 12px ${compColor.replace('rgb', 'rgba').replace(')', ', 0.4)')}`;

      setTimeout(() => {
        cell.style.background = '';
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }, 250);
    }
  });
}

// Apple-style 3D Grid for Expertises Hero section
const expertisesHeroGrid = document.getElementById('expertisesHeroGrid');
if (expertisesHeroGrid) {
  const cols = 42;
  const rows = 30;

  function getComplementaryColorExpertises() {
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    let hex = accent.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const compR = 255 - r;
      const compG = 255 - g;
      const compB = 255 - b;
      return `rgb(${compR}, ${compG}, ${compB})`;
    }
    return 'rgb(243, 251, 0)';
  }

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'expertises-hero__grid-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'expertises-hero__grid-cell';
      row.appendChild(cell);
    }
    expertisesHeroGrid.appendChild(row);
  }

  expertisesHeroGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('expertises-hero__grid-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColorExpertises();
      cell.style.background = compColor.replace('rgb', 'rgba').replace(')', ', 0.5)');
      cell.style.borderColor = compColor.replace('rgb', 'rgba').replace(')', ', 0.7)');
      cell.style.boxShadow = `0 0 12px ${compColor.replace('rgb', 'rgba').replace(')', ', 0.4)')}`;

      setTimeout(() => {
        cell.style.background = '';
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }, 250);
    }
  });
}

// Apple-style 3D Grid for Expertises CTA section
const expertisesCtaGrid = document.getElementById('expertisesCtaGrid');
if (expertisesCtaGrid) {
  const cols = 42;
  const rows = 30;

  function getComplementaryColorExpertisesCta() {
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    let hex = accent.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const compR = 255 - r;
      const compG = 255 - g;
      const compB = 255 - b;
      return `rgb(${compR}, ${compG}, ${compB})`;
    }
    return 'rgb(243, 251, 0)';
  }

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'expertises-cta__grid-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'expertises-cta__grid-cell';
      row.appendChild(cell);
    }
    expertisesCtaGrid.appendChild(row);
  }

  expertisesCtaGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('expertises-cta__grid-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColorExpertisesCta();
      cell.style.background = compColor.replace('rgb', 'rgba').replace(')', ', 0.5)');
      cell.style.borderColor = compColor.replace('rgb', 'rgba').replace(')', ', 0.7)');
      cell.style.boxShadow = `0 0 12px ${compColor.replace('rgb', 'rgba').replace(')', ', 0.4)')}`;

      setTimeout(() => {
        cell.style.background = '';
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }, 250);
    }
  });
}

// Apple-style 3D Grid for FAQ CTA section
const faqCtaGrid = document.getElementById('faqCtaGrid');
if (faqCtaGrid) {
  const cols = 43;
  const rows = 31;
  
  function getComplementaryColor() {
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    let hex = accent.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      const compR = 255 - r;
      const compG = 255 - g;
      const compB = 255 - b;
      return `rgb(${compR}, ${compG}, ${compB})`;
    }
    return 'rgb(243, 251, 0)';
  }
  
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'faq-cta__grid-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'faq-cta__grid-cell';
      row.appendChild(cell);
    }
    faqCtaGrid.appendChild(row);
  }
  
  faqCtaGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('faq-cta__grid-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColor();
      cell.style.background = compColor.replace('rgb', 'rgba').replace(')', ', 0.6)');
      cell.style.borderColor = compColor.replace('rgb', 'rgba').replace(')', ', 0.8)');
      cell.style.boxShadow = `0 0 15px ${compColor.replace('rgb', 'rgba').replace(')', ', 0.5)')}`;
      
      setTimeout(() => {
        cell.style.background = '';
        cell.style.borderColor = '';
        cell.style.boxShadow = '';
      }, 300);
    }
  });
}

// Legal modals
document.addEventListener('DOMContentLoaded', function () {
  const legalModal = document.getElementById('legalModal');
  const legalModalTitle = document.getElementById('legalModalTitle');
  const legalModalBody = document.getElementById('legalModalBody');
  const legalModalClose = document.getElementById('legalModalClose');

  if (!legalModal) return;

  const legalContent = {
    mentions: {
      title: 'Mentions légales',
      body: `<h3>Site internet karbonn.fr</h3>
        <p>Dernière mise à jour : août 2026</p>
        <h3>1. Éditeur du site</h3>
        <p>Le présent site internet accessible à l’adresse <a href='https://www.karbonn.fr' target='_blank' rel='noopener noreferrer' style='color:#fff;text-decoration:underline;'>https://www.karbonn.fr</a> est édité par :</p>
        <p><strong>Karbonn.</strong><br>Entreprise Individuelle (micro-entreprise)<br>Représentée par : Rémy CORMON, Gérant<br>Représentant légal : Axel CORMON<br>Siège social : 11 Rue De Dauvet, 27150 Mainneville, France<br>Numéro SIRET : 942 917 113 00014<br>Activité : Agence de communication digitale et développement web.<br>Adresse électronique : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a><br>Téléphone : <a href='tel:+33776691606' style='color:#fff;text-decoration:underline;'>+33 7 76 69 16 06</a><br>TVA : Karbonn. bénéficie du régime de franchise en base de TVA conformément aux dispositions applicables du Code général des impôts. À ce titre : TVA non applicable, article 293 B du Code général des impôts.</p>
        <h3>2. Directeur de publication</h3>
        <p>Le directeur de publication du site est : <strong>Rémy CORMON</strong>, en qualité de responsable de l’entreprise Karbonn.</p>
        <h3>3. Hébergement du site</h3>
        <p>Le site internet est hébergé par :<br><strong>OVH SAS</strong><br>Adresse : 2 rue Kellermann, 59100 Roubaix, France<br>Forme juridique : Société par actions simplifiée (SAS)<br>Capital social : 50 000 000 €<br>RCS : Lille Métropole 424 761 419<br>Site : <a href='https://www.ovhcloud.com' target='_blank' rel='noopener noreferrer' style='color:#fff;text-decoration:underline;'>https://www.ovhcloud.com</a></p>
        <h3>4. Solutions techniques utilisées</h3>
        <p>Dans le cadre de ses services, Karbonn. peut utiliser différentes solutions techniques fournies par des prestataires tiers, notamment :</p>
        <ul>
          <li>OVHcloud pour certains services d’hébergement et domaines ;</li>
          <li>GitHub pour certains environnements techniques et infrastructures de développement ;</li>
          <li>Firebase pour certains outils internes de gestion et CRM.</li>
        </ul>
        <p>Ces prestataires disposent de leurs propres conditions d’utilisation et politiques de confidentialité. Karbonn. ne pourra être tenue responsable des interruptions, indisponibilités ou dysfonctionnements provenant directement de ces services tiers.</p>
        <h3>5. Propriété intellectuelle</h3>
        <p>L’ensemble des éléments présents sur le site karbonn.fr, notamment :</p>
        <ul>
          <li>textes,</li>
          <li>graphismes,</li>
          <li>logos,</li>
          <li>illustrations,</li>
          <li>interfaces,</li>
          <li>éléments visuels,</li>
          <li>code informatique,</li>
          <li>animations,</li>
        </ul>
        <p>sont protégés par les dispositions relatives à la propriété intellectuelle. Toute reproduction, représentation, modification ou exploitation sans autorisation préalable écrite de Karbonn. est interdite.</p>
        <h3>6. Responsabilité</h3>
        <p>Karbonn. s’efforce de fournir des informations fiables et régulièrement mises à jour. Cependant, l’entreprise ne peut garantir : l’absence totale d’erreurs ; la disponibilité permanente du site ; l’absence d’interruptions techniques ; la compatibilité avec tous les équipements.</p>
        <p>Karbonn. ne pourra être tenue responsable : des dommages liés à l’utilisation du site ; des contenus fournis par des tiers ; des interruptions provenant de prestataires externes ; des pertes indirectes.</p>
        <h3>7. Liens externes</h3>
        <p>Le site peut contenir des liens vers des sites externes. Karbonn. n’exerce aucun contrôle sur ces sites et ne saurait être responsable : de leur contenu ; de leur disponibilité ; de leurs pratiques en matière de données personnelles.</p>
        <h3>8. Contact</h3>
        <p>Pour toute question concernant le site ou les services proposés :<br>Email : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a></p>`
    },
    confidentialite: {
      title: 'Politique de confidentialité',
      body: `<h3>Politique de confidentialité RGPD de Karbonn.</h3>
        <p>Dernière mise à jour : août 2026</p>
        <h3>1. Introduction</h3>
        <p>La présente Politique de confidentialité décrit la manière dont Karbonn., entreprise individuelle spécialisée dans la communication digitale et le développement web, collecte, utilise, conserve et protège les données personnelles des utilisateurs, prospects et clients.</p>
        <p>Karbonn. s’engage à respecter la réglementation applicable en matière de protection des données personnelles, notamment :</p>
        <ul>
          <li>le Règlement Général sur la Protection des Données (RGPD – Règlement UE 2016/679) ;</li>
          <li>la loi française Informatique et Libertés modifiée.</li>
        </ul>
        <p>La présente politique concerne :</p>
        <ul>
          <li>le site internet <a href='https://www.karbonn.fr' target='_blank' rel='noopener noreferrer' style='color:#fff;text-decoration:underline;'>https://www.karbonn.fr</a> ;</li>
          <li>les formulaires de contact ;</li>
          <li>les demandes de devis ;</li>
          <li>l’espace client ;</li>
          <li>les prestations réalisées par Karbonn. ;</li>
          <li>les échanges commerciaux et contractuels.</li>
        </ul>
        <h3>2. Responsable du traitement</h3>
        <p>Le responsable du traitement des données personnelles est :</p>
        <p><strong>Karbonn.</strong><br>Entreprise Individuelle (micro-entreprise)<br>Représentée par : Rémy CORMON<br>Siège social : 11 Rue De Dauvet, 27150 Mainneville, France<br>Email : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a><br>Téléphone : <a href='tel:+33776691606' style='color:#fff;text-decoration:underline;'>+33 7 76 69 16 06</a></p>
        <h3>3. Principes appliqués au traitement des données</h3>
        <p>Karbonn. applique les principes fondamentaux du RGPD :</p>
        <ul>
          <li><strong>Licéité</strong> : les données sont collectées uniquement lorsque leur traitement repose sur une base légale.</li>
          <li><strong>Minimisation</strong> : Karbonn. collecte uniquement les données nécessaires aux objectifs poursuivis.</li>
          <li><strong>Transparence</strong> : les utilisateurs sont informés de l’utilisation faite de leurs données.</li>
          <li><strong>Sécurité</strong> : Karbonn. met en œuvre des mesures techniques et organisationnelles adaptées afin de protéger les données.</li>
        </ul>
        <h3>4. Données personnelles collectées</h3>
        <h4>4.1 Formulaire de contact — Particuliers</h4>
        <p>Lorsqu’un particulier contacte Karbonn., les données suivantes peuvent être collectées :</p>
        <ul>
          <li>Nom ;</li>
          <li>Prénom ;</li>
          <li>Adresse email ;</li>
          <li>Numéro de téléphone (facultatif mais recommandé) ;</li>
          <li>Adresse postale (facultative mais recommandée) ;</li>
          <li>Type de projet ;</li>
          <li>Description du besoin ;</li>
          <li>Budget estimé ;</li>
          <li>Résultat d’une vérification anti-spam.</li>
        </ul>
        <h4>4.2 Formulaire de contact — Professionnels</h4>
        <p>Pour les entreprises, Karbonn. peut collecter :</p>
        <ul>
          <li>Nom, prénom, email professionnel, téléphone professionnel ;</li>
          <li>Nom de l’entreprise, numéro SIRET, type d’activité ;</li>
          <li>Type de projet, description du besoin, budget estimé ;</li>
          <li>Informations nécessaires à la compréhension du projet ;</li>
          <li>Vérification anti-spam.</li>
        </ul>
        <h4>4.3 Données clients</h4>
        <p>Dans le cadre d’une prestation, Karbonn. peut collecter :</p>
        <p><strong>Informations personnelles</strong> : nom, prénom, email, téléphone, adresse professionnelle ou personnelle.</p>
        <p><strong>Informations professionnelles</strong> : société, numéro SIRET, numéro TVA intracommunautaire lorsque applicable, adresse du siège social, informations liées au projet.</p>
        <p><strong>Informations contractuelles</strong> : devis, factures, contrats, historique des prestations, échanges commerciaux.</p>
        <h4>4.4 Données liées à l’espace client</h4>
        <p>L’espace client Karbonn. peut contenir : identité du client, informations de contact, projets associés, sites internet associés, noms de domaine, factures, devis, documents contractuels, historique des échanges, informations nécessaires au suivi des prestations.</p>
        <p>Les comptes clients sont créés exclusivement par Karbonn. Les utilisateurs ne peuvent pas créer librement un compte.</p>
        <h3>5. Finalités des traitements</h3>
        <h4>Gestion des demandes</h4>
        <p><strong>Base légale :</strong> Mesures précontractuelles<br><strong>Objectifs :</strong> répondre aux demandes, analyser les besoins, préparer une proposition commerciale, établir un devis.</p>
        <h4>Gestion des clients</h4>
        <p><strong>Base légale :</strong> Exécution contractuelle<br><strong>Objectifs :</strong> réaliser les prestations, assurer le suivi projet, gérer l’espace client, communiquer avec le client.</p>
        <h4>Facturation</h4>
        <p><strong>Base légale :</strong> Obligation légale<br><strong>Objectifs :</strong> création des factures, suivi comptable, conservation des documents obligatoires.</p>
        <h4>Support technique</h4>
        <p><strong>Base légale :</strong> Exécution contractuelle<br><strong>Objectifs :</strong> répondre aux demandes, assurer la maintenance, effectuer les corrections nécessaires.</p>
        <h4>Sécurité</h4>
        <p><strong>Base légale :</strong> Intérêt légitime<br><strong>Objectifs :</strong> prévenir les fraudes, protéger les infrastructures, sécuriser les comptes.</p>
        <h3>6. Stockage des données</h3>
        <h4>Firebase</h4>
        <p>Utilisation : CRM interne, gestion de l’espace client, stockage des informations nécessaires au suivi client. Les données sont protégées par des mesures de sécurité adaptées.</p>
        <h4>Qonto</h4>
        <p>Utilisation : gestion financière, création des factures, suivi administratif. Les données financières sont traitées conformément aux conditions du prestataire.</p>
        <h4>OVHcloud</h4>
        <p>Utilisation possible : hébergement, infrastructure technique, services liés aux domaines.</p>
        <h4>GitHub</h4>
        <p>Utilisation possible : hébergement technique, gestion de projets de développement, déploiement d’applications.</p>
        <h3>7. Sous-traitants et prestataires</h3>
        <p>Karbonn. peut faire appel à des prestataires techniques nécessaires au fonctionnement de ses services. Ces prestataires peuvent agir comme sous-traitants au sens du RGPD. Karbonn. veille à privilégier des prestataires offrant des garanties appropriées en matière de sécurité et de protection des données.</p>
        <h3>8. Conservation des données</h3>
        <p><strong>Prospects</strong> : les données collectées lors d’une demande de contact sont conservées uniquement pendant la durée nécessaire au traitement de la demande.</p>
        <p><strong>Clients</strong> : les données clients sont conservées pendant toute la durée de collaboration et pendant les durées nécessaires aux obligations légales après la fin de collaboration.</p>
        <p><strong>Documents comptables</strong> : les factures et documents comptables sont conservés conformément aux obligations légales applicables.</p>
        <h3>9. Sécurité des données</h3>
        <p>Karbonn. met en place plusieurs mesures : accès limité aux données, authentification sécurisée, limitation des accès internes, stockage sécurisé auprès de prestataires spécialisés, surveillance des accès, protection contre les utilisations frauduleuses.</p>
        <h3>10. Transmission des données</h3>
        <p>Karbonn. ne vend, ne loue et ne commercialise jamais les données personnelles de ses utilisateurs. Les données peuvent uniquement être transmises aux prestataires techniques nécessaires, aux administrations lorsque la loi l’impose, ou aux organismes légalement habilités.</p>
        <h3>11. Droits des utilisateurs</h3>
        <p>Conformément au RGPD, toute personne dispose des droits suivants :</p>
        <ul>
          <li><strong>Droit d’accès</strong> : obtenir une copie des données détenues.</li>
          <li><strong>Droit de rectification</strong> : demander la correction d’informations incorrectes.</li>
          <li><strong>Droit à l’effacement</strong> : demander la suppression des données lorsque cela est possible.</li>
          <li><strong>Droit à la limitation</strong> : demander une limitation temporaire du traitement.</li>
          <li><strong>Droit d’opposition</strong> : s’opposer à certains traitements.</li>
          <li><strong>Droit à la portabilité</strong> : recevoir certaines données dans un format exploitable.</li>
        </ul>
        <p>Pour exercer ces droits : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a>. Une demande pourra nécessiter une vérification d’identité afin d’éviter toute demande frauduleuse.</p>
        <h3>12. Gestion des violations de données</h3>
        <p>En cas de violation susceptible de présenter un risque pour les personnes concernées, Karbonn. appliquera les procédures prévues par le RGPD. Lorsque cela est obligatoire, la violation pourra être signalée à la CNIL et aux personnes concernées.</p>
        <h3>13. Réclamation auprès de la CNIL</h3>
        <p>Toute personne estimant que ses droits ne sont pas respectés peut déposer une réclamation auprès de la Commission nationale de l'informatique et des libertés : <a href='https://www.cnil.fr' target='_blank' rel='noopener noreferrer' style='color:#fff;text-decoration:underline;'>https://www.cnil.fr</a>.</p>
        <h3>14. Modification de la politique de confidentialité</h3>
        <p>Karbonn. peut modifier cette politique afin de tenir compte d’évolutions réglementaires, de modifications techniques ou de l’évolution des services proposés. La version applicable est celle publiée sur le site.</p>
        <h3>Registre interne des traitements RGPD</h3>
        <h4>Traitement 1 — Gestion des prospects</h4>
        <p><strong>Finalité :</strong> Gestion des demandes commerciales.<br><strong>Données :</strong> Nom, prénom, email, téléphone, projet, budget estimé.<br><strong>Base légale :</strong> Mesures précontractuelles.<br><strong>Durée :</strong> Durée nécessaire au traitement de la demande.<br><strong>Stockage :</strong> CRM interne Firebase.</p>
        <h4>Traitement 2 — Gestion des clients</h4>
        <p><strong>Finalité :</strong> Suivi des projets et prestations.<br><strong>Données :</strong> Identité, coordonnées, informations professionnelles, documents contractuels.<br><strong>Base légale :</strong> Contrat.<br><strong>Durée :</strong> Durée de collaboration + obligations légales.<br><strong>Stockage :</strong> Firebase, outils administratifs.</p>
        <h4>Traitement 3 — Facturation</h4>
        <p><strong>Finalité :</strong> Gestion comptable.<br><strong>Données :</strong> Informations client, factures, paiements.<br><strong>Base légale :</strong> Obligation légale.<br><strong>Durée :</strong> Durées légales applicables.</p>
        <h4>Traitement 4 — Espace client</h4>
        <p><strong>Finalité :</strong> Fourniture d’un espace sécurisé de suivi.<br><strong>Données :</strong> Informations projet, documents, facturation.<br><strong>Base légale :</strong> Contrat.</p>`
    },
    cookies: {
      title: 'Politique de cookies',
      body: `<h3>Politique cookies de Karbonn.</h3>
        <p>Dernière mise à jour : août 2026</p>
        <h3>1. Introduction</h3>
        <p>La présente politique cookies explique comment Karbonn. utilise les cookies et technologies similaires lors de la navigation sur son site internet <a href='https://www.karbonn.fr' target='_blank' rel='noopener noreferrer' style='color:#fff;text-decoration:underline;'>https://www.karbonn.fr</a>.</p>
        <p>Cette politique a pour objectif d’informer les utilisateurs sur :</p>
        <ul>
          <li>les cookies utilisés ;</li>
          <li>leur finalité ;</li>
          <li>leur durée de conservation ;</li>
          <li>les moyens permettant de les gérer.</li>
        </ul>
        <h3>2. Qu’est-ce qu’un cookie ?</h3>
        <p>Un cookie est un petit fichier texte enregistré sur le terminal de l’utilisateur (ordinateur, smartphone, tablette) lors de la consultation d’un site internet. Les cookies permettent notamment :</p>
        <ul>
          <li>d’assurer le fonctionnement du site ;</li>
          <li>d’améliorer l’expérience utilisateur ;</li>
          <li>de mesurer l’audience ;</li>
          <li>d’analyser l’utilisation du site.</li>
        </ul>
        <p>Les cookies ne permettent pas d’identifier directement une personne physique.</p>
        <h3>3. Responsable du traitement</h3>
        <p>Le responsable des traitements liés aux cookies est :<br><strong>Karbonn.</strong><br>Entreprise Individuelle<br>Représentée par : Rémy CORMON<br>Adresse : 11 Rue De Dauvet, 27150 Mainneville, France<br>Email : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a></p>
        <h3>4. Types de cookies utilisés</h3>
        <p>Le site karbonn.fr utilise principalement des cookies nécessaires au fonctionnement du site. À ce jour, Karbonn. utilise les catégories suivantes :</p>
        <h4>4.1 Cookies strictement nécessaires</h4>
        <p>Ces cookies sont indispensables au fonctionnement du site. Ils permettent notamment :</p>
        <ul>
          <li>l’affichage correct des pages ;</li>
          <li>l’adaptation de certains éléments techniques ;</li>
          <li>la mémorisation de paramètres nécessaires à l’expérience utilisateur ;</li>
          <li>le fonctionnement de certaines animations.</li>
        </ul>
        <p>Ces cookies ne nécessitent pas de consentement préalable conformément aux recommandations de la CNIL lorsqu’ils sont strictement nécessaires.</p>
        <p><strong>Exemple :</strong> Cookie d’orientation écran mobile.<br><strong>Finalité :</strong> Permettre l’adaptation de certains effets visuels, notamment les effets de parallaxe et éléments interactifs selon l’orientation du terminal.<br><strong>Données utilisées :</strong> informations techniques liées au terminal, orientation de l’écran.<br>Aucune donnée personnelle directement identifiable n’est collectée.</p>
        <h4>4.2 Cookies de mesure d’audience</h4>
        <p>Karbonn. peut utiliser des outils permettant d’analyser la fréquentation du site. Ces outils permettent notamment de connaître :</p>
        <ul>
          <li>le nombre de visiteurs ;</li>
          <li>les pages consultées ;</li>
          <li>les parcours de navigation ;</li>
          <li>les performances du site.</li>
        </ul>
        <p><strong>Google Analytics</strong><br>Outil : Google Analytics<br>Finalités : mesure d’audience, analyse du comportement général des visiteurs, amélioration du site. Les données collectées peuvent inclure : informations techniques du navigateur, appareil utilisé, pages consultées, données statistiques de navigation.</p>
        <p><strong>Microsoft Clarity</strong><br>Outil : Microsoft Clarity<br>Finalités : analyse de l’expérience utilisateur, compréhension des interactions avec les pages, amélioration ergonomique du site. Microsoft Clarity peut enregistrer des informations relatives aux interactions générales avec le site.</p>
        <h3>5. Consentement des utilisateurs</h3>
        <p>Lorsque des cookies nécessitent un consentement préalable conformément à la réglementation applicable, Karbonn. met en place un mécanisme permettant à l’utilisateur :</p>
        <ul>
          <li>d’accepter les cookies ;</li>
          <li>de refuser les cookies ;</li>
          <li>de modifier ses préférences.</li>
        </ul>
        <p>L’utilisateur peut retirer son consentement à tout moment.</p>
        <h3>6. Gestion des cookies</h3>
        <p>L’utilisateur peut gérer ou supprimer les cookies directement depuis son navigateur. Les méthodes varient selon le navigateur utilisé.</p>
        <ul>
          <li><strong>Google Chrome :</strong> Paramètres → Confidentialité et sécurité → Cookies.</li>
          <li><strong>Mozilla Firefox :</strong> Paramètres → Vie privée et sécurité.</li>
          <li><strong>Safari :</strong> Réglages → Confidentialité.</li>
          <li><strong>Microsoft Edge :</strong> Paramètres → Cookies et autorisations du site.</li>
        </ul>
        <h3>7. Refus des cookies</h3>
        <p>Le refus de certains cookies peut entraîner :</p>
        <ul>
          <li>une expérience moins personnalisée ;</li>
          <li>la désactivation de certaines fonctionnalités non essentielles ;</li>
          <li>une limitation de certaines analyses statistiques.</li>
        </ul>
        <p>Les cookies strictement nécessaires au fonctionnement du site ne peuvent pas être désactivés.</p>
        <h3>8. Durée de conservation</h3>
        <p>La durée de conservation des cookies dépend de leur nature. À titre indicatif :</p>
        <table style='width:100%;border-collapse:collapse;margin:16px 0;color:rgba(255,255,255,0.7);'>
          <thead>
            <tr style='border-bottom:1px solid rgba(255,255,255,0.2);'>
              <th style='text-align:left;padding:8px;font-weight:500;color:#fff;'>Type de cookie</th>
              <th style='text-align:left;padding:8px;font-weight:500;color:#fff;'>Durée maximale</th>
            </tr>
          </thead>
          <tbody>
            <tr style='border-bottom:1px solid rgba(255,255,255,0.1);'>
              <td style='padding:8px;'>Cookies techniques</td>
              <td style='padding:8px;'>Durée nécessaire au fonctionnement</td>
            </tr>
            <tr style='border-bottom:1px solid rgba(255,255,255,0.1);'>
              <td style='padding:8px;'>Cookies statistiques</td>
              <td style='padding:8px;'>Selon la configuration des outils utilisés</td>
            </tr>
            <tr>
              <td style='padding:8px;'>Cookies tiers</td>
              <td style='padding:8px;'>Selon les politiques des prestataires concernés</td>
            </tr>
          </tbody>
        </table>
        <h3>9. Cookies tiers</h3>
        <p>Certains cookies peuvent être déposés par des prestataires externes utilisés par Karbonn. Ces prestataires disposent de leurs propres politiques relatives aux cookies et données personnelles.</p>
        <p>Principaux prestataires : Google Analytics ; Microsoft Clarity ; OVHcloud ; Firebase.</p>
        <h3>10. Données collectées via les cookies</h3>
        <p>Les informations pouvant être collectées comprennent notamment :</p>
        <ul>
          <li>adresse IP (pouvant être anonymisée selon configuration) ;</li>
          <li>type d’appareil ;</li>
          <li>navigateur utilisé ;</li>
          <li>système d’exploitation ;</li>
          <li>pages consultées ;</li>
          <li>durée de navigation ;</li>
          <li>interactions générales avec le site.</li>
        </ul>
        <p>Karbonn. ne collecte pas volontairement de données personnelles sensibles via les cookies.</p>
        <h3>11. Base légale</h3>
        <p>Les traitements liés aux cookies reposent sur :</p>
        <p><strong>Cookies nécessaires</strong> : base légale Intérêt légitime / nécessité technique du service.</p>
        <p><strong>Cookies statistiques ou analytiques</strong> : base légale Consentement de l’utilisateur lorsque celui-ci est requis.</p>
        <h3>12. Évolution de la politique cookies</h3>
        <p>Karbonn. peut modifier cette politique cookies afin de prendre en compte :</p>
        <ul>
          <li>les évolutions réglementaires ;</li>
          <li>l’ajout ou la suppression d’outils ;</li>
          <li>les modifications techniques du site.</li>
        </ul>
        <p>La version applicable est celle publiée sur <a href='https://www.karbonn.fr' target='_blank' rel='noopener noreferrer' style='color:#fff;text-decoration:underline;'>karbonn.fr</a>.</p>
        <h3>13. Contact</h3>
        <p>Pour toute question concernant l’utilisation des cookies :<br><strong>Karbonn.</strong><br>Email : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a></p>`
    },
    cgu: {
      title: 'Conditions Générales d’Utilisation (CGU)',
      body: `<h3>CONDITIONS GÉNÉRALES D’UTILISATION (CGU)</h3>
        <p>Dernière mise à jour : août 2026</p>
        <h3>Article 1 — Objet</h3>
        <p>Les présentes Conditions Générales d’Utilisation définissent les règles d’accès et d’utilisation du site internet karbonn.fr. L’utilisation du site implique l’acceptation pleine et entière des présentes CGU.</p>
        <h3>Article 2 — Accès au site</h3>
        <p>Le site est accessible gratuitement à tout utilisateur disposant d’un accès internet. Karbonn. peut suspendre temporairement l’accès au site notamment pour :</p>
        <ul>
          <li>maintenance ;</li>
          <li>mise à jour ;</li>
          <li>amélioration technique ;</li>
          <li>raisons de sécurité.</li>
        </ul>
        <h3>Article 3 — Services présentés</h3>
        <p>Le site présente les activités proposées par Karbonn., notamment :</p>
        <ul>
          <li>communication digitale ;</li>
          <li>développement web ;</li>
          <li>création de sites internet ;</li>
          <li>design UI/UX ;</li>
          <li>audits numériques ;</li>
          <li>automatisations ;</li>
          <li>solutions basées sur l’intelligence artificielle ;</li>
          <li>hébergement et support technique.</li>
        </ul>
        <p>Les informations présentes sur le site sont données à titre indicatif. Les prestations finales sont définies dans un devis et un contrat personnalisé.</p>
        <h3>Article 4 — Demandes de contact</h3>
        <p>L’utilisateur peut contacter Karbonn. via les formulaires disponibles. Les informations transmises doivent être : exactes ; sincères ; licites.</p>
        <p>Karbonn. se réserve le droit de ne pas donner suite aux demandes incomplètes, frauduleuses ou incompatibles avec ses services.</p>
        <h3>Article 5 — Espace client</h3>
        <p>Karbonn. peut fournir à certains clients un accès personnel à un espace client sécurisé. Cet accès est : créé exclusivement par Karbonn. ; associé à un identifiant unique ; réservé au client concerné.</p>
        <p>Le client est responsable de la confidentialité de ses informations de connexion. Toute utilisation frauduleuse devra être signalée immédiatement à : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a></p>
        <h3>Article 6 — Obligations de l’utilisateur</h3>
        <p>L’utilisateur s’engage à :</p>
        <ul>
          <li>respecter les lois applicables ;</li>
          <li>ne pas tenter de compromettre la sécurité du site ;</li>
          <li>ne pas utiliser le site à des fins frauduleuses ;</li>
          <li>ne pas collecter illégalement des informations.</li>
        </ul>
        <h3>Article 7 — Données personnelles</h3>
        <p>L’utilisation du site implique la collecte éventuelle de données personnelles. Les modalités de traitement sont détaillées dans la Politique de confidentialité RGPD de Karbonn.</p>
        <h3>Article 8 — Cookies</h3>
        <p>Le site peut utiliser certains cookies nécessaires à son fonctionnement. Les informations relatives aux cookies sont détaillées dans la Politique cookies de Karbonn.</p>
        <h3>Article 9 — Modification des CGU</h3>
        <p>Karbonn. se réserve le droit de modifier les présentes CGU à tout moment. Les nouvelles versions seront applicables dès leur publication sur le site.</p>
        <h3>Article 10 — Droit applicable</h3>
        <p>Les présentes CGU sont soumises au droit français. En cas de litige, les parties rechercheront prioritairement une solution amiable.</p>`
    },
    cgv: {
      title: 'Conditions Générales de Vente (CGV)',
      body: `<h3>CONDITIONS GÉNÉRALES DE VENTE (CGV)</h3>
        <p>Prestations numériques — Karbonn.<br>Dernière mise à jour : août 2026</p>
        <h3>1. Objet</h3>
        <p>Les présentes Conditions Générales de Vente (ci-après « CGV ») définissent les conditions applicables aux prestations proposées par :</p>
        <p><strong>Karbonn.</strong><br>Entreprise Individuelle (micro-entreprise)<br>Représentée par : Rémy CORMON<br>Siège social : 11 Rue De Dauvet, 27150 Mainneville, France<br>SIRET : 942 917 113 00014<br>Email : <a href='mailto:hello@karbonn.fr' style='color:#fff;text-decoration:underline;'>hello@karbonn.fr</a><br>Téléphone : <a href='tel:+33776691606' style='color:#fff;text-decoration:underline;'>+33 7 76 69 16 06</a></p>
        <p>Les présentes CGV encadrent les relations commerciales entre Karbonn. et ses clients dans le cadre de prestations numériques comprenant notamment :</p>
        <ul>
          <li>création de sites internet ;</li>
          <li>développement web ;</li>
          <li>communication digitale ;</li>
          <li>design UI/UX ;</li>
          <li>audits numériques ;</li>
          <li>automatisations ;</li>
          <li>intégration de solutions d’intelligence artificielle ;</li>
          <li>hébergement ;</li>
          <li>maintenance ;</li>
          <li>support technique.</li>
        </ul>
        <h3>2. Acceptation des CGV</h3>
        <p>Toute commande passée auprès de Karbonn. implique l’acceptation pleine et entière des présentes CGV. Le Client reconnaît avoir pris connaissance :</p>
        <ul>
          <li>des présentes CGV ;</li>
          <li>du devis correspondant ;</li>
          <li>du contrat cadre de prestation de services numériques lorsque celui-ci est applicable.</li>
        </ul>
        <p>En cas de contradiction entre plusieurs documents, l’ordre de priorité suivant s’applique :</p>
        <ul>
          <li>Contrat signé entre les parties ;</li>
          <li>Devis accepté ;</li>
          <li>Présentes CGV ;</li>
          <li>Documents commerciaux ou échanges informatifs.</li>
        </ul>
        <h3>3. Description des prestations</h3>
        <p>Karbonn. propose des prestations personnalisées adaptées aux besoins du Client. Les prestations peuvent notamment comprendre :</p>
        <h4>Création et développement web</h4>
        <ul>
          <li>conception de sites vitrines ;</li>
          <li>sites professionnels ;</li>
          <li>interfaces web personnalisées ;</li>
          <li>intégrations techniques ;</li>
          <li>optimisation responsive ;</li>
          <li>mise en ligne.</li>
        </ul>
        <h4>Communication digitale</h4>
        <ul>
          <li>création de contenus ;</li>
          <li>stratégie digitale ;</li>
          <li>identité visuelle ;</li>
          <li>accompagnement communication.</li>
        </ul>
        <h4>Design</h4>
        <ul>
          <li>conception UI/UX ;</li>
          <li>maquettes ;</li>
          <li>interfaces graphiques ;</li>
          <li>éléments visuels.</li>
        </ul>
        <h4>Automatisation et intelligence artificielle</h4>
        <ul>
          <li>automatisation de tâches ;</li>
          <li>intégration d’outils numériques ;</li>
          <li>solutions basées sur l’intelligence artificielle.</li>
        </ul>
        <h4>Hébergement et support</h4>
        <ul>
          <li>gestion technique ;</li>
          <li>maintenance corrective ;</li>
          <li>suivi technique ;</li>
          <li>accompagnement client.</li>
        </ul>
        <p>Les prestations réellement fournies sont celles définies dans le devis accepté par le Client.</p>
        <h3>4. Devis et commande</h3>
        <p>Toute prestation fait l’objet d’un devis personnalisé. Le devis précise notamment : la nature des prestations, les délais estimatifs, le prix, les modalités de paiement, les éventuelles options. Le devis est valable pendant la durée indiquée sur celui-ci. À défaut de précision, le devis est valable trente (30) jours à compter de son émission.</p>
        <p>La commande est considérée comme définitive uniquement après :</p>
        <ul>
          <li>acceptation du devis ;</li>
          <li>signature du contrat lorsque nécessaire ;</li>
          <li>paiement de l’acompte prévu.</li>
        </ul>
        <h3>5. Prix des prestations</h3>
        <p>Les prix sont exprimés en euros. Karbonn. bénéficiant du régime de franchise en base de TVA : TVA non applicable, article 293 B du Code général des impôts.</p>
        <p>Les tarifs indiqués peuvent varier selon : la complexité du projet, les fonctionnalités demandées, les besoins spécifiques, les prestations supplémentaires.</p>
        <h3>6. Modalités de paiement</h3>
        <p>Sauf disposition contraire indiquée sur le devis, le paiement d’une création de projet s’effectue comme suit :</p>
        <p><strong>À la commande</strong> : 30 % du montant total. Cette somme correspond à l’acompte de démarrage. Elle permet notamment la réservation du temps de production, le lancement du projet, la préparation technique.</p>
        <p><strong>À la livraison</strong> : 70 % du montant total. Le solde est dû après réalisation de la prestation conformément au devis.</p>
        <h3>7. Paiement des abonnements</h3>
        <p>Un abonnement mensuel est obligatoire pour toute formule. Les abonnements proposés sont les suivants :</p>
        <h4>ESSENTIEL — 9,99 € / mois</h4>
        <p>Hébergement du site, SSL / HTTPS, maintenance technique de base, surveillance du site, sauvegardes, assistance technique.</p>
        <h4>SÉRÉNITÉ — 19,99 € / mois</h4>
        <p>Tout ESSENTIEL + maintenance corrective, mises à jour techniques, sauvegardes renforcées, surveillance renforcée, support prioritaire, petites interventions techniques.</p>
        <h4>PERFORMANCE — 39,99 € / mois</h4>
        <p>Tout SÉRÉNITÉ + évolutions régulières du site, optimisations performances, optimisations SEO techniques, analyse des performances, automatisations simples, support prioritaire.</p>
        <h4>PREMIUM — 69,99 € / mois</h4>
        <p>Tout PERFORMANCE + accompagnement mensuel, modifications de contenu, optimisation continue, automatisations avancées, conseil digital, priorité maximale.</p>
        <p><strong>Nom de domaine</strong> (.fr / .com) : facturé séparément selon le domaine choisi.</p>
        <p><strong>Durée</strong> : L'abonnement est conclu jusqu'à résiliation du contrat ou résiliation par le Client. Il est renouvelé automatiquement par des périodes successives d'un (1) mois. ; si l'abonnement est résilié par le Client, alors l'intégralité des services peuvent être désactivés car il ne peut pas bénéficier des services gratuitement.</p>
        <h3>8. Paiement et facturation</h3>
        <p>Les factures sont générées manuellement par Karbonn. via son outil de facturation professionnel. Les factures sont disponibles dans l’espace client sécurisé. Le Client est responsable de consulter régulièrement son espace client.</p>
        <p>Le paiement peut être effectué :</p>
        <ul>
          <li>par virement bancaire ;</li>
          <li>via les solutions de paiement proposées dans l’espace client.</li>
        </ul>
        <h3>9. Retard de paiement</h3>
        <p>En cas de retard de paiement, Karbonn. pourra : adresser une relance amiable au Client, accorder exceptionnellement un délai de régularisation, ou appliquer les mesures prévues ci-dessous.</p>
        <p>En cas de non-régularisation, Karbonn. pourra : suspendre temporairement les services, interrompre l’accès aux prestations concernées, appliquer des pénalités de retard conformément à la réglementation applicable.</p>
        <p>Pour les clients professionnels, des pénalités de retard pourront être appliquées conformément à l’article L441-10 du Code de commerce. Une indemnité forfaitaire pour frais de recouvrement de 40 euros pourra également être appliquée.</p>
        <h3>10. Délais de réalisation</h3>
        <p>Les délais annoncés par Karbonn. sont indicatifs. Ils dépendent notamment : de la disponibilité du Client, de la transmission des contenus nécessaires, des validations intermédiaires, des éventuels changements demandés. Tout retard causé par le Client pourra entraîner un décalage du calendrier initial.</p>
        <h3>11. Obligations du Client</h3>
        <p>Le Client s’engage à :</p>
        <ul>
          <li>fournir des informations exactes ;</li>
          <li>transmettre les contenus nécessaires ;</li>
          <li>effectuer les validations dans des délais raisonnables ;</li>
          <li>disposer des droits nécessaires sur les contenus transmis.</li>
        </ul>
        <p>Le Client reste responsable : des textes fournis, des images fournies, des marques utilisées, des informations publiées.</p>
        <h3>12. Modifications et demandes supplémentaires</h3>
        <p>Toute demande ne correspondant pas au périmètre initial défini dans le devis pourra faire l’objet d’une modification du devis ou d’une facturation complémentaire. Sont notamment concernés :</p>
        <ul>
          <li>nouvelles fonctionnalités ;</li>
          <li>modifications importantes ;</li>
          <li>nouvelles pages ;</li>
          <li>changement complet de direction graphique ;</li>
          <li>demandes supplémentaires après validation.</li>
        </ul>
        <h3>13. Livraison et validation</h3>
        <p>La livraison intervient lorsque les éléments prévus au devis sont réalisés. Le Client dispose d’un délai raisonnable pour signaler d’éventuelles anomalies. Les demandes d’évolution ou modifications supplémentaires ne constituent pas des réserves de livraison.</p>
        <h3>14. Maintenance corrective</h3>
        <p>Lorsque la maintenance est incluse, Karbonn. intervient uniquement pour : corriger les anomalies liées à la prestation réalisée, maintenir le fonctionnement général.</p>
        <p>Ne sont pas inclus : ajout de fonctionnalités, refonte graphique, modifications importantes, création de nouveaux contenus. Ces prestations feront l’objet d’un devis complémentaire.</p>
        <h3>15. Hébergement et prestataires tiers</h3>
        <p>Karbonn. peut utiliser des services tiers tels que : OVHcloud, GitHub, Firebase, autres solutions techniques nécessaires.</p>
        <p>Karbonn. fournit une solution technique mais dépend du fonctionnement de prestataires externes. Karbonn. ne garantit pas : une disponibilité permanente à 100 %, l’absence totale d’interruption, l’absence d’évolution des conditions des prestataires tiers.</p>
        <h3>16. Responsabilité</h3>
        <p>Karbonn. est tenue à une obligation de moyens. Karbonn. ne pourra être responsable : des pannes provenant de services tiers, des erreurs causées par des éléments fournis par le Client, des pertes indirectes, des pertes commerciales, des dommages résultant d’une mauvaise utilisation.</p>
        <h3>17. Propriété intellectuelle</h3>
        <p>Les règles relatives à la propriété intellectuelle sont définies dans une clause spécifique. Après paiement intégral, le Client bénéficie des droits prévus au contrat. Karbonn. conserve : ses méthodes, ses outils internes, ses composants réutilisables, son savoir-faire, ses bibliothèques techniques.</p>
        <h3>18. Portfolio et communication</h3>
        <p>Sauf opposition écrite préalable du Client, Karbonn. pourra présenter les réalisations effectuées dans son portfolio, son site internet, ses supports professionnels. Cette utilisation ne porte pas atteinte aux droits du Client sur ses propres contenus.</p>
        <h3>19. Résiliation</h3>
        <p>En cas de manquement grave par l’une des parties, le contrat pourra être résilié après notification écrite. Peuvent notamment constituer un manquement : défaut de paiement, utilisation frauduleuse, non-respect des obligations contractuelles. Les sommes dues restent exigibles malgré la résiliation.</p>
        <h3>20. Médiation et règlement des litiges</h3>
        <p>En cas de difficulté, les parties rechercheront prioritairement une solution amiable. Pour les consommateurs particuliers, le Client peut recourir gratuitement à un médiateur de la consommation conformément aux dispositions applicables.</p>
        <h3>21. Droit applicable</h3>
        <p>Les présentes CGV sont soumises au droit français.</p>
        <h3>22. Acceptation</h3>
        <p>Le Client reconnaît avoir pris connaissance des présentes CGV et les accepter avant toute commande auprès de Karbonn.</p>`
    }
  };

  document.querySelectorAll('[data-legal]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const key = link.getAttribute('data-legal');
      const content = legalContent[key];
      if (!content) return;
      legalModalTitle.textContent = content.title;
      legalModalBody.innerHTML = content.body;
      legalModal.classList.add('is-open');
      legalModal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('no-scroll');
      document.body.classList.add('no-scroll');
    });
  });

  function closeLegalModal() {
    legalModal.classList.remove('is-open');
    legalModal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
  }

  if (legalModalClose) {
    legalModalClose.addEventListener('click', closeLegalModal);
  }

  legalModal.addEventListener('click', (e) => {
    if (e.target === legalModal) closeLegalModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && legalModal.classList.contains('is-open')) {
      closeLegalModal();
    }
  });
});
