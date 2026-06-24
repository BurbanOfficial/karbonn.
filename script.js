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

document.querySelectorAll('.contact-form').forEach(form => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const captchaInput = form.querySelector('[name="captcha"]');
    const expected = parseInt(captchaInput.dataset.expected);
    if (parseInt(captchaInput.value) !== expected) {
      captchaInput.style.borderColor = '#ff0000';
      return;
    }
    captchaInput.style.borderColor = '';
    alert('Message envoyé !');
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
