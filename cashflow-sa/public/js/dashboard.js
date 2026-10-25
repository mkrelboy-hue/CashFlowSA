import { h, icon, avatar, pill, plural, formatRand, formatDate, formatLongDate, relTime, inDays, menuButton, closeAllMenus, emptyState, whatsappUrl } from './dom.js';
import { api } from './api.js';
import { openOutcomeDialog } from './dialogs.js';

const ACTIVITY = {
  payment_received:    { icon: 'banknote', tone: 'ok',     label: 'Paid' },
  reminder_sent:       { icon: 'send',     tone: 'info',   label: 'Sent' },
  customer_added:      { icon: 'userPlus', tone: 'info',   label: 'New' },
  agreement_overdue:   { icon: 'alert',    tone: 'danger', label: 'Overdue' },
  agreement_updated:   { icon: 'edit',     tone: 'warn',   label: 'Updated' },
  follow_up_completed: { icon: 'check',    tone: 'ok',     label: 'Done' },
};

export async function renderDashboard(ctx) {
  const d = await api('/api/dashboard');
  ctx.me.today = d.today;   // keep the shell's notion of "today" in step with the server

  const cards = [
    { title: 'Total Outstanding', value: formatRand(d.cards.outstanding.cents), sub: plural(d.cards.outstanding.customers, 'customer'), icon: 'wallet', tone: 'emerald', href: '#/customers/accounts/outstanding' },
    { title: 'Due Today', value: formatRand(d.cards.dueToday.cents), sub: plural(d.cards.dueToday.agreements, 'agreement'), icon: 'clock', tone: 'amber', href: '#/customers/accounts/due_today' },
    { title: 'Overdue Balances', value: formatRand(d.cards.overdue.cents), sub: plural(d.cards.overdue.agreements, 'agreement'), icon: 'alert', tone: 'red', href: '#/customers/accounts/overdue' },
    { title: 'Upcoming Reminders', value: String(d.cards.upcomingReminders.count), sub: 'scheduled', icon: 'bellRing', tone: 'blue', href: '#/reminders' },
  ];

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('h1', {}, 'Dashboard'),
      h('p', { class: 'date-chip' }, icon('calendar', 18), h('span', {}, formatLongDate(d.today)), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), h('span', {}, d.timezone))),
    h('section', { class: 'cards', 'aria-label': 'Financial summary' },
      cards.map((c) => h('a', { class: 'stat-card', href: c.href },
        h('span', { class: `stat-icon tone-${c.tone}` }, icon(c.icon, 24)),
        h('span', { class: 'stat-body' }, h('span', { class: 'stat-title' }, c.title), h('strong', { class: 'stat-value' }, c.value), h('span', { class: 'stat-sub' }, c.sub))))),
    h('div', { class: 'grid-2' }, activityPanel(d), followUpsPanel(ctx, d)),
    h('div', { class: 'grid-2' }, overduePanel(ctx, d), remindersPanel(ctx, d)));
}

const panel = (title, headExtra, content, id) =>
  h('section', { class: 'panel', 'aria-labelledby': id },
    h('div', { class: 'panel-head' }, h('h2', { id }, title, headExtra?.badge ?? null), headExtra?.link ?? null),
    content);
const viewAll = (href) => h('a', { class: 'link', href }, 'View all');

function activityPanel(d) {
  const list = d.activity.length
    ? h('ul', { class: 'activity' }, d.activity.map((a) => {
      const t = ACTIVITY[a.event_type] ?? ACTIVITY.agreement_updated;
      return h('li', { class: 'activity-item' },
        h('span', { class: `act-icon tone-${t.tone}` }, icon(t.icon, 18)),
        h('div', { class: 'act-body' }, h('strong', {}, a.title), h('span', { class: 'muted' }, [a.customer, a.detail].filter(Boolean).join(' · '))),
        h('div', { class: 'act-meta' }, pill(t.label, t.tone), h('span', { class: 'muted small' }, relTime(a.created_at))));
    }))
    : emptyState('inbox', 'No activity yet', 'Payments, reminders and updates will appear here as they happen.');
  return panel('Recent Activity', { link: viewAll('#/activity') }, list, 'h-activity');
}

function followUpsPanel(ctx, d) {
  const count = d.followUps.length;
  const badge = h('span', { class: 'count-badge' }, `${count} pending`);
  const body = count
    ? h('ul', { class: 'followups' }, d.followUps.map((f) => followUpRow(ctx, f, d)))
    : emptyState('check', 'Nothing to follow up today', 'Agreements due today will appear here so you can confirm whether they were paid.');
  return panel('Today’s Follow-ups', { badge, link: null }, body, 'h-followups');
}

function followUpRow(ctx, f, d) {
  const phone = f.cellphone;
  const wa = whatsappUrl(f.whatsapp || f.cellphone, `Hi ${f.first_name}, a reminder from ${d.business.name} about ${formatRand(f.outstanding_cents)} due today (${f.reference}).`);
  const menu = menuButton({
    trigger: { class: 'icon-btn', children: [icon('more', 20)] }, label: `More actions for ${f.name}`,
    panel: [
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closeAllMenus(); openOutcomeDialog(ctx, f, 'promise_new_date'); } }, icon('calendar', 18), 'Reschedule'),
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closeAllMenus(); openOutcomeDialog(ctx, f, 'other'); } }, icon('edit', 18), 'Add a note'),
      h('button', { type: 'button', class: 'menu-item', role: 'menuitem', onclick: () => { closeAllMenus(); openOutcomeDialog(ctx, f, 'disputed'); } }, icon('alert', 18), 'Mark as disputed'),
    ],
  });
  return h('li', { class: 'followup' },
    h('div', { class: 'fu-main' },
      avatar({ initials: f.initials, size: 44 }),
      h('div', { class: 'fu-text' },
        h('strong', {}, f.name),
        h('span', { class: 'muted' }, `${formatRand(f.outstanding_cents)} · Due ${formatDate(f.due_date)}`),
        f.attempts ? h('span', { class: 'muted small' }, `${plural(f.attempts, 'attempt')} so far`) : null),
      pill(f.agreement_status === 'disputed' ? 'Disputed' : 'Due today', f.agreement_status === 'disputed' ? 'muted' : 'warn')),
    h('div', { class: 'fu-actions' },
      phone ? h('a', { class: 'icon-btn bordered', href: `tel:${phone}`, 'aria-label': `Call ${f.name}`, title: 'Call' }, icon('phone', 20))
            : h('button', { type: 'button', class: 'icon-btn bordered', disabled: true, 'aria-label': 'No phone number' }, icon('phone', 20)),
      wa ? h('a', { class: 'icon-btn bordered wa', href: wa, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `WhatsApp ${f.name}`, title: 'WhatsApp' }, icon('message', 20))
         : h('button', { type: 'button', class: 'icon-btn bordered', disabled: true, 'aria-label': 'No WhatsApp number' }, icon('message', 20)),
      h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => openOutcomeDialog(ctx, f) }, 'Record Outcome'),
      menu));
}

function clickableRow(ctx, id, label, cells) {
  const tr = h('tr', { class: 'row-link', tabindex: '0', role: 'link', 'aria-label': label }, cells);
  const open = () => ctx.openAgreement(id);
  tr.addEventListener('click', open);
  tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return tr;
}
const td = (label, ...c) => h('td', { 'data-label': label }, ...c);

function overduePanel(ctx, d) {
  const content = d.overdue.length
    ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Customer', 'Amount Due', 'Due Date', 'Days Overdue', 'Status'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, d.overdue.map((r) => clickableRow(ctx, r.agreement_id, `Open ${r.name}, ${r.reference}`, [
        td('Customer', h('span', { class: 'cell-person' }, avatar({ initials: r.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), size: 32 }), h('strong', {}, r.name))),
        td('Amount Due', h('strong', { class: 'text-danger' }, formatRand(r.outstanding_cents))),
        td('Due Date', formatDate(r.due_date)),
        td('Days Overdue', h('span', { class: 'text-danger' }, plural(r.days_overdue, 'day'))),
        td('Status', r.status === 'disputed' ? pill('Disputed', 'warn') : pill('Overdue', 'danger')),
      ])))))
    : emptyState('check', 'No overdue accounts', 'Nothing is past its payment date right now.');
  return panel('Recent Overdue Accounts', { link: viewAll('#/customers/accounts/overdue') }, content, 'h-overdue');
}

function remindersPanel(ctx, d) {
  const content = d.upcomingReminders.length
    ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Customer', 'Amount', 'Due Date', 'Reminder'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, d.upcomingReminders.map((r) => clickableRow(ctx, r.agreement_id, `Open ${r.name}`, [
        td('Customer', h('span', { class: 'cell-person' }, avatar({ initials: r.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), size: 32 }), h('strong', {}, r.name))),
        td('Amount', h('strong', {}, formatRand(r.outstanding_cents))),
        td('Due Date', formatDate(r.due_date)),
        td('Reminder', pill(inDays(r.in_days), 'info')),
      ])))))
    : emptyState('bellRing', 'No reminders scheduled', 'Reminders appear here once an agreement has a scheduled reminder job.');
  return panel('Upcoming Reminders', { link: viewAll('#/reminders') }, content, 'h-reminders');
}
