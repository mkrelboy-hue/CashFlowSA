import { h, icon, avatar, logoMark, menuButton, closeAllMenus, relTime } from './dom.js';
import { api } from './api.js';

// The ONLY primary navigation. Everything else is reached through panels, customer details,
// the notification bell and the account menu.
export const NAV = [
  { key: 'dashboard', label: 'Dashboard', href: '#/dashboard', icon: 'grid' },
  { key: 'customers', label: 'Customers', href: '#/customers', icon: 'users' },
  { key: 'reminders', label: 'Reminders', href: '#/reminders', icon: 'bellRing' },
];

export const ACCOUNT_MENU = [
  { href: '#/account/business-profile', label: 'Business profile', icon: 'building' },
  { href: '#/account/details', label: 'Account details', icon: 'user' },
  { href: '#/account/communication', label: 'Communication settings', icon: 'message' },
  { href: '#/account/security', label: 'Security settings', icon: 'shield' },
  { href: '#/account/billing', label: 'Subscription and billing', icon: 'card' },
  { href: '#/account/recovery', label: 'Account recovery', icon: 'key' },
];

export function renderShell(ctx) {
  const { business } = ctx.me;
  const avatarSrc = business.avatar_path || null;

  const nav = h('nav', { class: 'nav', 'aria-label': 'Primary' },
    NAV.map((n) => h('a', { class: 'nav-link', href: n.href, 'data-nav': n.key }, icon(n.icon, 22), h('span', {}, n.label))));

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('div', { class: 'profile' },
      h('div', { class: 'profile-ring' }, avatar({ src: avatarSrc, size: 96, label: `${business.owner_name} profile picture` })),
      h('p', { class: 'profile-name' }, business.owner_name),
      h('p', { class: 'profile-business' }, business.name)),
    nav,
    h('div', { class: 'sidebar-foot' },
      h('div', { class: 'brand' }, logoMark(36), h('span', { class: 'brand-name' }, 'CashFlow SA')),
      h('p', { class: 'tagline' }, 'Get paid. Stay in control.')));

  /* Notification bell */
  const badge = h('span', { class: 'bell-badge', hidden: true });
  const bellList = h('ul', { class: 'notif-list' });
  const bell = menuButton({
    trigger: { class: 'icon-btn bell', children: [icon('bell', 22), badge] }, label: 'Notifications',
    panel: [h('div', { class: 'menu-title' }, 'Notifications'), bellList],
  });
  bell.querySelector('.bell').addEventListener('click', async () => {
    if (bell.querySelector('[data-menu]').hidden) return;
    try {
      const items = await api('/api/notifications');
      bellList.replaceChildren(...(items.length ? items.map((n) => h('li', {},
        h('button', { type: 'button', class: `notif ${n.read_at ? '' : 'unread'}`, onclick: async () => {
          closeAllMenus();
          if (!n.read_at) { await api(`/api/notifications/${n.id}/read`, { method: 'POST' }); await ctx.refreshMe(); }
          if (n.agreement_id) ctx.openAgreement(n.agreement_id);
        } }, h('strong', {}, n.title), h('span', { class: 'muted' }, n.detail ?? ''), h('span', { class: 'muted small' }, relTime(n.created_at)))))
        : [h('li', { class: 'muted pad' }, 'You’re all caught up.')]));
    } catch { bellList.replaceChildren(h('li', { class: 'muted pad' }, 'Could not load notifications.')); }
  });

  /* Account menu */
  const account = menuButton({
    trigger: { class: 'account-btn', children: [
      avatar({ src: avatarSrc, size: 40 }),
      h('span', { class: 'account-text' }, h('strong', {}, business.owner_name), h('span', { class: 'muted small' }, business.owner_role)),
      icon('chevron', 18)] },
    label: 'Account menu',
    panel: [
      ...ACCOUNT_MENU.map((i) => h('a', { class: 'menu-item', href: i.href, role: 'menuitem' }, icon(i.icon, 18), i.label)),
      h('hr', { class: 'menu-sep' }),
      h('a', { class: 'menu-item', href: '#/account/logout', role: 'menuitem' }, icon('logout', 18), 'Log out'),
    ],
  });

  const toggle = h('button', { type: 'button', class: 'icon-btn menu-toggle', 'aria-label': 'Open navigation', 'aria-controls': 'sidebar', 'aria-expanded': 'false' }, icon('menu', 24));
  const scrim = h('div', { class: 'scrim' });
  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
  scrim.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  // Top bar: bell, owner photo, name, role, account dropdown - nothing else (no search).
  const topbar = h('header', { class: 'topbar' }, toggle, h('div', { class: 'topbar-right' }, bell, account));
  const view = h('main', { class: 'content', id: 'view', tabindex: '-1' });
  const root = h('div', { class: 'app' }, sidebar, scrim, h('div', { class: 'main' }, topbar, view));

  return {
    root, view,
    setUnread(n) { badge.hidden = !n; badge.textContent = n > 9 ? '9+' : String(n); bell.querySelector('.bell').setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications'); },
    setActive(key) { nav.querySelectorAll('.nav-link').forEach((a) => { const on = a.dataset.nav === key; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); }); },
    closeDrawer: () => setOpen(false),
  };
}
