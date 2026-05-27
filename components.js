/* ─────────────────────────────────────────
   COMPONENTS.JS
   Loads nav.html and footer.html into every
   page, then sets the active nav link and
   wires up scroll + burger behaviour.
───────────────────────────────────────── */

async function loadComponent(selector, file) {
  try {
    const res  = await fetch(file);
    const html = await res.text();
    document.querySelector(selector).innerHTML = html;
  } catch (e) {
    console.warn(`Could not load ${file}:`, e);
  }
}

async function initComponents() {
  // 1. inject nav and footer
  await loadComponent('#nav-placeholder',    'nav.html');
  await loadComponent('#footer-placeholder', 'footer.html');

  // 2. mark the current page link as active
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#nav a, .nav-mobile a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page) a.classList.add('nav-active');
  });

  // 3. show order button only on menu page
  if (page === 'menu.html') {
    const nb = document.getElementById('navOrderBtn');
    const mb = document.getElementById('mobOrderBtn');
    if (nb) nb.style.display = 'flex';
    if (mb) mb.style.display = 'block';
  }

  // 4. sticky nav on scroll
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('nav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
  });
}

// ── Hamburger toggle ──────────────────────
function toggleNav() {
  document.getElementById('burger')?.classList.toggle('open');
  document.getElementById('mobileNav')?.classList.toggle('open');
  document.body.classList.toggle('no-scroll');
}

// ── Cart drawer (menu page only) ─────────
function toggleDrawer() {
  document.getElementById('drawer')?.classList.toggle('on');
  document.getElementById('dim')?.classList.toggle('on');
  document.body.classList.toggle('no-scroll');
}

// run on DOM ready
document.addEventListener('DOMContentLoaded', initComponents);