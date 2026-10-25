import { h, icon, modal, pill, formatRand, formatDate, plural, whatsappUrl, toast } from './dom.js';
import { api } from './api.js';

const METHODS = ['EFT', 'Cash', 'Card', 'SnapScan', 'Other'];

function field(label, input, { hint, id } = {}) {
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null, h('p', { class: 'field-error', role: 'alert', 'data-error-for': id }));
}

function showError(form, err) {
  form.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
  const target = err.field && form.querySelector(`[data-error-for="${err.field}"]`);
  if (target) { target.textContent = err.message; form.querySelector(`#${err.field}`)?.focus(); }
  else form.querySelector('.form-error').textContent = err.message;
}

export function statusPill(a, today) {
  if (a.status === 'paid') return pill('Paid', 'ok');
  if (a.status === 'disputed') return pill('Disputed', 'warn');
  if (a.status === 'cancelled') return pill('Cancelled', 'muted');
  return a.due_date < today ? pill('Overdue', 'danger') : pill('Active', 'ok');
}

/* ----------------------------------------------------------- agreement view */
export async function openAgreementDialog(ctx, agreementId) {
  const m = modal({ title: 'Agreement', subtitle: 'Loading…' });
  const paymentKey = crypto.randomUUID();   // one key per open form: a double-click or retry cannot double-count

  async function load() {
    let a;
    try { a = await api(`/api/agreements/${agreementId}`); }
    catch (err) { m.body.replaceChildren(h('p', { class: 'form-error', role: 'alert' }, err.message)); return; }
    m.setTitle(a.reference, `${a.name} · ${a.description}`);
    m.body.replaceChildren(view(a));
  }

  function view(a) {
    const phone = a.cellphone;
    const wa = whatsappUrl(a.whatsapp || a.cellphone, `Hi ${a.first_name}, a reminder from ${ctx.me.business.name} about ${formatRand(a.outstanding_cents)} (${a.reference}).`);
    const canPay = ['active', 'disputed'].includes(a.status) && a.outstanding_cents > 0;
    return h('div', { class: 'stack' },
      h('div', { class: 'stat-row' },
        stat('Agreed amount', formatRand(a.original_cents)),
        stat('Paid so far', formatRand(a.paid_cents)),
        stat('Outstanding', formatRand(a.outstanding_cents), a.outstanding_cents > 0 && a.due_date < ctx.me.today ? 'danger' : ''),
        stat('Due date', formatDate(a.due_date))),
      h('div', { class: 'row gap' }, statusPill(a, ctx.me.today),
        phone ? h('a', { class: 'btn btn-ghost btn-sm', href: `tel:${phone}` }, icon('phone', 16), 'Call') : null,
        wa ? h('a', { class: 'btn btn-ghost btn-sm', href: wa, target: '_blank', rel: 'noopener noreferrer' }, icon('message', 16), 'WhatsApp') : null),
      section('Payments', a.payments.length
        ? h('ul', { class: 'plain-list' }, a.payments.map((p) => h('li', { class: 'row between' },
          h('span', {}, `${formatDate(p.received_date)} · ${p.method}${p.reference ? ' · ' + p.reference : ''}`,
            p.reversed_at ? h('span', { class: 'muted' }, ' (reversed)') : null),
          h('strong', {}, formatRand(p.amount_cents)))))
        : h('p', { class: 'muted' }, 'No payments recorded yet.')),
      a.dueHistory.length ? section('Payment date changes', h('ul', { class: 'plain-list' },
        a.dueHistory.map((d) => h('li', {}, `${formatDate(d.old_due_date)} → ${formatDate(d.new_due_date)}`, d.reason ? h('span', { class: 'muted' }, ` · ${d.reason}`) : null)))) : null,
      canPay ? paymentForm(a) : null);
  }

  const stat = (label, value, tone = '') => h('div', { class: `mini-stat ${tone ? 'is-' + tone : ''}` }, h('span', { class: 'muted' }, label), h('strong', {}, value));
  const section = (title, content) => h('section', {}, h('h3', {}, title), content);

  function paymentForm(a) {
    const form = h('form', { class: 'form', novalidate: true });
    const amount = h('input', { id: 'amount', name: 'amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', required: true });
    const date = h('input', { id: 'receivedDate', name: 'receivedDate', type: 'date', value: ctx.me.today, max: ctx.me.today, required: true });
    const method = h('select', { id: 'method', name: 'method' }, METHODS.map((x) => h('option', { value: x }, x)));
    const ref = h('input', { id: 'reference', name: 'reference', maxlength: 100, autocomplete: 'off' });
    const notes = h('textarea', { id: 'notes', name: 'notes', rows: 2, maxlength: 1000 });
    const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Record payment');
    form.append(
      h('h3', {}, 'Record a payment'),
      h('div', { class: 'grid-form' },
        field('Amount (R)', amount, { id: 'amount', hint: `Up to ${formatRand(a.outstanding_cents)}` }),
        field('Date received', date, { id: 'receivedDate' }),
        field('Payment method', method, { id: 'method' }),
        field('Transaction reference (optional)', ref, { id: 'reference' })),
      field('Notes (optional)', notes, { id: 'notes' }),
      h('p', { class: 'form-error', role: 'alert' }), submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submit.disabled = true; form.querySelector('.form-error').textContent = '';
      try {
        const out = await api(`/api/agreements/${a.id}/payments`, { method: 'POST', body: {
          amount: amount.value, receivedDate: date.value, method: method.value, reference: ref.value, notes: notes.value, idempotencyKey: paymentKey } });
        toast(out.duplicate ? 'That payment was already recorded.' : 'Payment recorded.');
        await ctx.refresh(); await load();
      } catch (err) { showError(form, err); submit.disabled = false; }
    });
    return form;
  }

  await load();
}

/* ------------------------------------------------------------ outcome dialog */
const OUTCOMES = [
  ['paid_full', 'Customer paid in full'],
  ['partial_payment', 'Customer made a partial payment'],
  ['promise_new_date', 'Customer promises to pay on a new date'],
  ['no_answer', 'Customer did not answer'],
  ['disputed', 'Agreement disputed'],
  ['other', 'Other outcome (notes required)'],
];

export function openOutcomeDialog(ctx, f, preset = 'paid_full') {
  const m = modal({ title: 'Record outcome', subtitle: `${f.name} · ${f.reference} · ${formatRand(f.outstanding_cents)} outstanding` });
  const key = crypto.randomUUID();
  const form = h('form', { class: 'form', novalidate: true });
  const radios = OUTCOMES.map(([value, label]) => h('label', { class: 'radio' },
    h('input', { type: 'radio', name: 'outcome', value, checked: value === preset }), h('span', {}, label)));
  const amount = h('input', { id: 'amount', name: 'amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00' });
  const method = h('select', { id: 'method', name: 'method' }, METHODS.map((x) => h('option', { value: x }, x)));
  const tomorrow = new Date(Date.parse(`${ctx.me.today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const newDate = h('input', { id: 'newDate', name: 'newDate', type: 'date', min: tomorrow });
  const notes = h('textarea', { id: 'notes', name: 'notes', rows: 3, maxlength: 1000 });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save outcome');

  const paidNote = h('p', { class: 'callout', 'data-for': 'paid_full' }, `This records a payment of ${formatRand(f.outstanding_cents)} (the full balance), received today, and marks the agreement paid.`);
  const partialBox = h('div', { class: 'grid-form', 'data-for': 'partial_payment' },
    field('Amount received (R)', amount, { id: 'amount', hint: `Less than ${formatRand(f.outstanding_cents)}` }),
    field('Payment method', method, { id: 'method' }));
  const dateBox = h('div', { 'data-for': 'promise_new_date' }, field('New payment date', newDate, { id: 'newDate' }));
  const disputeNote = h('p', { class: 'callout callout-warn', 'data-for': 'disputed' }, 'Disputed agreements stop receiving reminders until you resolve them.');
  const conditional = [paidNote, partialBox, dateBox, disputeNote];

  const sync = () => {
    const sel = form.querySelector('input[name="outcome"]:checked')?.value;
    conditional.forEach((el) => (el.hidden = el.dataset.for !== sel));
  };
  form.addEventListener('change', sync);
  form.append(
    h('fieldset', {}, h('legend', {}, 'What happened?'), h('div', { class: 'radios' }, radios)),
    ...conditional,
    field('Notes', notes, { id: 'notes' }),
    h('p', { class: 'form-error', role: 'alert' }),
    h('div', { class: 'row gap end' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: m.close }, 'Cancel'), submit));
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true; form.querySelector('.form-error').textContent = '';
    const outcome = form.querySelector('input[name="outcome"]:checked').value;
    try {
      const out = await api(`/api/follow-ups/${f.task_id}/outcome`, { method: 'POST', body: {
        outcome, amount: amount.value, method: method.value, newDate: newDate.value, notes: notes.value, idempotencyKey: key } });
      toast(out.duplicate ? 'That outcome was already saved.' : 'Outcome saved.');
      m.close(); await ctx.refresh();
    } catch (err) { showError(form, err); submit.disabled = false; }
  });
  m.body.append(form);
  (form.querySelector('input[name="outcome"]:checked'))?.focus();
}
