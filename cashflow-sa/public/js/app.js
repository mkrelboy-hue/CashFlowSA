import { h, closeAllMenus, emptyState, toast } from './dom.js';
import { api } from './api.js';
import { renderShell } from './shell.js';
import { renderDashboard } from './dashboard.js';
import { renderCustomers, renderAccounts, renderReminders, renderActivity, renderAccountSection } from './pages.js';
import { openAgreementDialog } from './dialogs.js';

const mount = document.getElementById('app');
let shell;
const ctx = { me: null };
ctx.openAgreement = (id) => openAgreementDialog(ctx, id);
ctx.refreshMe = async () => { ctx.me = await api('/api/me'); shell.setUnread(ctx.me.unreadNotifications); };
ctx.refresh = async () => { await ctx.refreshMe(); await route(); };

function match(hash) {
  const path = (hash.replace(/^#/, '') || '/dashboard').split('?')[0];
  let m;
  if (path === '/' || path === '/dashboard') return { nav: 'dashboard', title: 'Dashboard', render: () => renderDashboard(ctx) };
  if (path === '/customers') return { nav: 'customers', title: 'Customers', render: () => renderCustomers(ctx) };
  if ((m = /^\/customers\/accounts\/(outstanding|due_today|overdue)$/.exec(path))) return { nav: 'customers', title: 'Accounts', render: () => renderAccounts(ctx, m[1]) };
  if (path === '/reminders') return { nav: 'reminders', title: 'Reminders', render: () => renderReminders(ctx) };
  if (path === '/activity') return { nav: 'dashboard', title: 'Recent Activity', render: () => renderActivity(ctx) };
  if ((m = /^\/account\/([a-z-]+)$/.exec(path))) return { nav: null, title: 'Account', render: () => renderAccountSection(m[1]) };
  return { nav: null, title: 'Not found', render: () => h('div', { class: 'page' }, emptyState('inbox', 'Page not found', 'That page does not exist.')) };
}

let routeToken = 0;
async function route() {
  const token = ++routeToken;
  const r = match(location.hash);
  shell.setActive(r.nav);
  shell.closeDrawer();
  closeAllMenus();
  document.title = `${r.title} · CashFlow SA`;
  try {
    const node = await r.render();
    if (token !== routeToken) return;   // a newer navigation won
    shell.view.replaceChildren(node);
  } catch (err) {
    if (token !== routeToken) return;
    shell.view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'panel' }, emptyState('alert', 'Could not load this page', err.message),
      h('div', { class: 'center pad' }, h('button', { class: 'btn btn-outline', type: 'button', onclick: route }, 'Try again')))));
  }
}

async function boot() {
  try {
    ctx.me = await api('/api/me');
  } catch (err) {
    mount.replaceChildren(h('div', { class: 'boot-error' }, h('h1', {}, 'CashFlow SA'), h('p', {}, 'The app could not start. Please refresh the page.'),
      h('p', { class: 'muted' }, err.message)));
    return;
  }
  shell = renderShell(ctx);
  mount.replaceChildren(shell.root);
  shell.setUnread(ctx.me.unreadNotifications);
  let lastNav = location.hash;
  window.addEventListener('hashchange', () => { if (location.hash !== lastNav) { lastNav = location.hash; route().then(() => window.scrollTo(0, 0)); } });
  await route();
}
boot();
