// Small DOM helpers. Text is always inserted as text nodes (never HTML) to avoid XSS.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

const P = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  bellRing: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M2 8c0-2.2.7-4.3 2-6M22 8a10 10 0 0 0-2-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 3.9 11.5 8.5 8.5 0 0 1 12.4 3a8.4 8.4 0 0 1 8.6 8.5z"/>',
  more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.2"/><path d="M6 12h.01M18 12h.01"/>',
  building: '<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9h.01M9 13h.01M9 17h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
};

export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${P[name] ?? ''}</svg>`;   // static strings only
  return span;
}

export function logoMark(size = 36) {
  const span = document.createElement('span');
  span.className = 'logo-mark';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 40 40" width="${size}" height="${size}" focusable="false"><rect width="40" height="40" rx="11" fill="#087F5B"/><path d="M9 25.5l7-7 5 4.5 10-11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 12h7v7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="29" width="22" height="3" rx="1.5" fill="#fff" opacity=".55"/></svg>`;
  return span;
}

/** Avatar: uploaded image, initials, or a neutral silhouette placeholder. */
export function avatar({ src, initials, size = 40, label = '' }) {
  const el = h('span', { class: `avatar avatar-${size}`, role: label ? 'img' : null, 'aria-label': label || null });
  if (src) { el.append(h('img', { src, alt: '' })); return el; }
  if (initials) { el.classList.add('avatar-initials'); el.append(initials); return el; }
  el.classList.add('avatar-placeholder');
  el.innerHTML = '<svg viewBox="0 0 40 40" focusable="false" aria-hidden="true"><circle cx="20" cy="15" r="7" fill="#9AABBB"/><path d="M5 40c0-8.3 6.7-14 15-14s15 5.7 15 14z" fill="#9AABBB"/></svg>';
  return el;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function formatRand(cents) {
  const neg = cents < 0, abs = Math.abs(cents);
  const rands = Math.floor(abs / 100), c = abs % 100;
  return `${neg ? '-' : ''}R${String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${c ? '.' + String(c).padStart(2, '0') : ''}`;
}

const ymdDate = (ymd) => new Date(`${ymd}T00:00:00Z`);
export const formatDate = (ymd) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(ymdDate(ymd));
export const formatLongDate = (ymd) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(ymdDate(ymd));

export function relTime(iso) {
  const text = relTimeRaw(iso);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function relTimeRaw(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return 'Just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  return formatDate(iso.slice(0, 10));
}

export const inDays = (n) => (n <= 0 ? 'Today' : `In ${plural(n, 'day')}`);

export const pill = (text, tone) => h('span', { class: `pill pill-${tone}` }, text);

/* Popover menus ---------------------------------------------------------- */
export function closeAllMenus(except) {
  document.querySelectorAll('[data-menu]:not([hidden])').forEach((m) => {
    if (m === except) return;
    m.hidden = true;
    m.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) closeAllMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllMenus(); });

/** Returns a wrapper containing a trigger button and a menu panel. */
export function menuButton({ trigger, panel, label, align = 'right' }) {
  const btn = h('button', { type: 'button', class: trigger.class, 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': label }, trigger.children);
  const pnl = h('div', { class: `menu menu-${align}`, 'data-menu': '', hidden: true }, panel);
  btn.addEventListener('click', () => {
    const open = pnl.hidden;
    closeAllMenus(pnl);
    pnl.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  return h('div', { class: 'menu-wrap' }, btn, pnl);
}

/* Toast ------------------------------------------------------------------ */
export function toast(message, tone = 'ok') {
  let region = document.getElementById('toasts');
  if (!region) { region = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
  const t = h('div', { class: `toast toast-${tone}` }, message);
  region.append(t);
  setTimeout(() => t.remove(), 4500);
}

/* Modal ------------------------------------------------------------------ */
export function modal({ title, subtitle }) {
  const body = h('div', { class: 'modal-body' });
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close' }, icon('x', 20));
  const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-title' },
    h('div', { class: 'modal-head' },
      h('div', {}, h('h2', { id: 'modal-title' }, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
      closeBtn),
    body);
  const close = () => { dlg.close(); dlg.remove(); };
  closeBtn.addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });   // backdrop click
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dialog: dlg, body, close, setTitle: (t, s) => { dlg.querySelector('h2').textContent = t; const p = dlg.querySelector('.modal-head p'); if (p && s != null) p.textContent = s; } };
}

export function emptyState(iconName, title, hint) {
  return h('div', { class: 'empty' }, h('span', { class: 'empty-icon' }, icon(iconName, 26)), h('strong', {}, title), hint ? h('p', { class: 'muted' }, hint) : null);
}

export function whatsappUrl(number, text) {
  const digits = String(number ?? '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
