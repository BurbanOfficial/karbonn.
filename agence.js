// agence.js

// Load saved accent color from localStorage
const savedAccent = localStorage.getItem('carbonAccent');
if (savedAccent) {
  document.documentElement.style.setProperty('--accent', savedAccent);
}

const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');

let mouseRawX = 0, mouseRawY = 0;
let ringX = 0, ringY = 0;

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

// Footer logic
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

document.getElementById('footerYear').textContent = new Date().getFullYear();

// Apple-style 3D Grid for CTA
const ctaAppleGrid = document.getElementById('ctaAppleGrid');
if (ctaAppleGrid) {
  const cols = 43;
  const rows = 31;
  const cells = [];
  
  // Get complementary color of --accent dynamically (prefer localStorage)
  function getComplementaryColor() {
    // Use saved color from localStorage for consistency
    let accent = localStorage.getItem('carbonAccent') || '#0c04ff';
    
    // Handle hex format
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
    
    return 'rgb(243, 251, 0)'; // fallback yellow complementary of blue
  }
  
  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div');
    row.className = 'cta-apple-row';
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cta-apple-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      row.appendChild(cell);
      cells.push(cell);
    }
    ctaAppleGrid.appendChild(row);
  }
  
  // Trail effect on hover - only single cell with complementary color
  ctaAppleGrid.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('cta-apple-cell')) {
      const cell = e.target;
      const compColor = getComplementaryColor(); // Calculate fresh each time
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

const navOverlay = document.getElementById('navOverlay');
const menuBtn = document.querySelector('.menu-btn');
const navClose = document.getElementById('navClose');

menuBtn.addEventListener('click', () => {
  navOverlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
});
navClose.addEventListener('click', () => {
  navOverlay.classList.remove('is-open');
  document.body.style.overflow = '';
});

// Parallax hero on mousemove — applied to non-italic elements only
const heroInner = document.querySelector('.agence-hero__inner');
const heroScroll = document.querySelector('.agence-hero__scroll-btn');
let rafId = null;
let mx = 0, my = 0;

const manifesteLines = document.querySelectorAll('.manifeste-line');
const manifesteTraits = document.querySelectorAll('.manifeste-trait');
const valuesAccent = document.getElementById('valuesAccent');
const valueItems = document.querySelectorAll('.value-item');
const teamAccent = document.getElementById('teamAccent');
const teamMembers = document.querySelectorAll('.team-member');

document.addEventListener('mousemove', (e) => {
  mx = (e.clientX / window.innerWidth - 0.5);
  my = (e.clientY / window.innerHeight - 0.5);
  if (!rafId) rafId = requestAnimationFrame(() => {
    if (window.innerWidth <= 768) {
      rafId = null;
      return;
    }
    if (heroInner) heroInner.style.transform = `translate(${mx * -12}px, ${my * -8}px)`;
    if (heroScroll) heroScroll.style.transform = `translateX(-50%) translate(${mx * -6}px, ${my * -4}px)`;
    
    // Manifeste section parallax
    manifesteLines.forEach(line => {
      const factor = parseFloat(line.dataset.parallax) || 0;
      line.style.transform = `translate(${mx * factor}px, ${my * factor * 0.6}px)`;
    });
    manifesteTraits.forEach(trait => {
      const factor = parseFloat(trait.dataset.parallax) || 0;
      trait.style.transform = `translate(${mx * factor}px, ${my * factor * 0.6}px)`;
    });
    
    // Values section parallax
    if (valuesAccent) {
      valuesAccent.style.transform = `translate(${mx * -18}px, ${my * -12}px)`;
    }
    valueItems.forEach(item => {
      const factor = parseFloat(item.dataset.parallax) || 0;
      item.style.transform = `translate(${mx * factor}px, ${my * factor * 0.6}px)`;
    });
    
    // Team section parallax
    if (teamAccent) {
      teamAccent.style.transform = `translate(${mx * -18}px, ${my * -12}px)`;
    }
    teamMembers.forEach(member => {
      const factor = parseFloat(member.dataset.parallax) || 0;
      member.style.transform = `translate(${mx * factor}px, ${my * factor * 0.6}px)`;
    });
    
    rafId = null;
  });
});

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
