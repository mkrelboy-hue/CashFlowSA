import { h, icon, avatar, pill, plural, formatRand, formatDate, relTime, inDays, emptyState } from './dom.js';
import { api } from './api.js';
import { statusPill } from './dialogs.js';

const td = (label, ...c) => h('td', { 'data-label': label }, ...c);
const initialsOf = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function pageHead(title, extra) { return h('div', { class: 'page-head' }, h('h1', {}, title), extra ?? null); }
function rowLink(ctx, id, label, cells) {
  const tr = h('tr', { class: 'row-link', tabindex: '0', role: 'link', 'aria-label': label }, cells);
  tr.addEventListener('click', () => ctx.openAgreement(id));
  tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.openAgreement(id); } });
  return tr;
}
const notice = (text) => h('p', { class: 'callout' }, text);

/* Customers ---------------------------------------------------------------- */
export async function renderCustomers() {
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search customers by name, phone or email', 'aria-label': 'Search customers' });
  const tableHost = h('div', { class: 'panel-body' });
  async function load() {
    const rows = await api(`/api/customers?q=${encodeURIComponent(search.value)}`);
    tableHost.replaceChildren(rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Customer', 'Cellphone', 'Email', 'Agreements', 'Outstanding'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, rows.map((r) => h('tr', {},
        td('Customer', h('span', { class: 'cell-person' }, avatar({ initials: r.initials, size: 32 }), h('strong', {}, r.name))),
        td('Cellphone', r.cellphone ?? '-'), td('Email', r.email ?? '-'),
        td('Agreements', String(r.agreements)),
        td('Outstanding', h('strong', { class: r.outstanding_cents ? '' : 'muted' }, formatRand(r.outstanding_cents)))))))) : emptyState('users', 'No customers found', 'Try a different search.'));
  }
  let t; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  await load();
  return h('div', { class: 'page' }, pageHead('Customers'),
    notice('Adding, editing and archiving customers, and full customer profiles, are built in Stage 3. This list is read from the database.'),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, search), tableHost));
}

/* Filtered agreements (from summary cards and View all links) --------------- */
const TITLES = { outstanding: 'Total Outstanding', due_today: 'Due Today', overdue: 'Overdue Balances' };
export async function renderAccounts(ctx, filter) {
  const rows = await api(`/api/agreements?filter=${encodeURIComponent(filter)}`);
  const today = ctx.me.today;
  const body = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['Customer', 'Reference', 'Description', 'Due Date', 'Outstanding', 'Status'].map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, rows.map((r) => rowLink(ctx, r.agreement_id, `Open ${r.name}, ${r.reference}`, [
      td('Customer', h('span', { class: 'cell-person' }, avatar({ initials: initialsOf(r.name), size: 32 }), h('strong', {}, r.name))),
      td('Reference', r.reference), td('Description', r.description), td('Due Date', formatDate(r.due_date)),
      td('Outstanding', h('strong', { class: r.due_date < today ? 'text-danger' : '' }, formatRand(r.outstanding_cents))),
      td('Status', statusPill(r, today))])))))
    : emptyState('check', 'Nothing here', 'No agreements match this view.');
  return h('div', { class: 'page' }, pageHead(TITLES[filter] ?? 'Agreements', h('a', { class: 'link', href: '#/customers' }, 'All customers')),
    h('section', { class: 'panel' }, body));
}

/* Reminders ---------------------------------------------------------------- */
export async function renderReminders() {
  const rows = await api('/api/reminders');
  const body = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, ['Customer', 'Amount', 'Due Date', 'Type', 'Reminder'].map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, rows.map((r) => h('tr', {},
      td('Customer', h('span', { class: 'cell-person' }, avatar({ initials: initialsOf(r.name), size: 32 }), h('strong', {}, r.name))),
      td('Amount', h('strong', {}, formatRand(r.outstanding_cents))), td('Due Date', formatDate(r.due_date)),
      td('Type', r.kind.replace('reminder_', '').replace('_', ' ')), td('Reminder', pill(inDays(r.in_days), 'info')))))))
    : emptyState('bellRing', 'No reminders scheduled', 'Scheduled reminder jobs will be listed here.');
  return h('div', { class: 'page' }, pageHead('Reminders'),
    notice('Reminder settings, message templates and real WhatsApp/SMS sending are built in Stage 4. Nothing is sent yet: the jobs below are scheduled records only, and no provider is connected.'),
    h('section', { class: 'panel' }, body));
}

/* Activity ----------------------------------------------------------------- */
export async function renderActivity() {
  const rows = await api('/api/activity');
  const body = rows.length ? h('ul', { class: 'activity padded' }, rows.map((a) => h('li', { class: 'activity-item' },
    h('div', { class: 'act-body' }, h('strong', {}, a.title), h('span', { class: 'muted' }, [a.customer, a.detail].filter(Boolean).join(' · '))),
    h('span', { class: 'muted small' }, relTime(a.created_at)))))
    : emptyState('inbox', 'No activity yet');
  return h('div', { class: 'page' }, pageHead('Recent Activity', h('a', { class: 'link', href: '#/dashboard' }, 'Back to dashboard')), h('section', { class: 'panel' }, body));
}

/* Account sections (built in later stages) --------------------------------- */
const ACCOUNT = {
  'business-profile': ['Business profile', 'Editing the business profile and uploading a profile photo arrive in Stage 2.'],
  details: ['Account details', 'Account details arrive in Stage 2, with authentication.'],
  communication: ['Communication settings', 'Reminder channels, templates and sending windows arrive in Stage 4.'],
  security: ['Security settings', 'Password and security settings arrive in Stage 2.'],
  billing: ['Subscription and billing', 'R99/month PayFast billing arrives in Stage 5. Billing stays reachable even if an account is suspended.'],
  recovery: ['Account recovery', 'Password and account recovery arrive in Stage 2.'],
  logout: ['Log out', 'Sign-in and sign-out arrive in Stage 2. This development build has no login yet.'],
};
export function renderAccountSection(section) {
  const [title, text] = ACCOUNT[section] ?? ['Account', 'This section is not available yet.'];
  return h('div', { class: 'page' }, pageHead(title), h('section', { class: 'panel' }, emptyState('shield', title, text)));
}
