import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import * as svc from '../server/services.js';
import { parseRandsToCents, formatRand } from '../server/money.js';
import { addDays, daysBetween } from '../server/dates.js';

const NOW = new Date('2026-10-25T10:00:00Z');   // 12:00 in Johannesburg

function fresh() {
  const db = openDb(':memory:');
  const { businessId } = seed(db, NOW);
  return { db, biz: businessId };
}
const agreementByRef = (db, biz, desc) => db.prepare('SELECT id FROM payment_agreements WHERE business_id=? AND description=?').get(biz, desc).id;
const pay = (extra = {}) => ({ amount: '100', method: 'EFT', idempotencyKey: crypto.randomUUID(), ...extra });

test('money: exact cents parsing, no floating point drift', () => {
  assert.equal(parseRandsToCents('0.10') + parseRandsToCents('0.20'), 30);
  assert.equal(parseRandsToCents('R1,500.50'), 150050);
  assert.equal(parseRandsToCents('1 500,5'), 150050);
  assert.equal(parseRandsToCents('19.99'), 1999);
  assert.throws(() => parseRandsToCents('0'), /greater than zero/);
  assert.throws(() => parseRandsToCents('-5'));
  assert.throws(() => parseRandsToCents('12.345'));
  assert.throws(() => parseRandsToCents('abc'));
  assert.equal(formatRand(4875000), 'R48,750');
  assert.equal(formatRand(150050), 'R1,500.50');
});

test('dates: day arithmetic', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysBetween('2026-10-04', '2026-10-25'), 21);
});

test('dashboard totals are computed from database rows', () => {
  const { db, biz } = fresh();
  const d = svc.getDashboard(db, biz, NOW);
  assert.equal(d.today, '2026-10-25');
  assert.deepEqual(d.cards.outstanding, { cents: 4875000, customers: 7 });
  assert.deepEqual(d.cards.dueToday, { cents: 650000, agreements: 2 });
  assert.deepEqual(d.cards.overdue, { cents: 1830000, agreements: 4 });
  assert.equal(d.cards.upcomingReminders.count, 5);
  assert.equal(d.followUps.length, 2);
  assert.ok(d.overdue.every((r) => r.days_overdue > 0 && r.outstanding_cents > 0));
});

test('a partial payment reduces the balance exactly and keeps the agreement open', () => {
  const { db, biz } = fresh();
  const id = agreementByRef(db, biz, 'Stock order #118');   // R5,200
  const r = svc.recordPayment(db, biz, id, pay({ amount: '1200.50' }), 'owner', NOW);
  assert.equal(r.agreement.outstanding_cents, 520000 - 120050);
  assert.equal(r.agreement.status, 'active');
});

test('a full payment marks paid, leaves debt totals and cancels reminder jobs', () => {
  const { db, biz } = fresh();
  const id = agreementByRef(db, biz, 'Stock order #118');
  const r = svc.recordPayment(db, biz, id, pay({ amount: '5200' }), 'owner', NOW);
  assert.equal(r.agreement.status, 'paid');
  assert.equal(r.agreement.outstanding_cents, 0);
  const d = svc.getDashboard(db, biz, NOW);
  assert.equal(d.cards.overdue.cents, 1830000 - 520000);
  assert.equal(d.cards.upcomingReminders.count, 4);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM scheduled_jobs WHERE agreement_id=? AND status='scheduled'`).get(id).n, 0);
  assert.equal(r.agreement.payments.length, 1);   // history retained
});

test('overpayment and invalid input are rejected on the server', () => {
  const { db, biz } = fresh();
  const id = agreementByRef(db, biz, 'Stock order #118');
  assert.throws(() => svc.recordPayment(db, biz, id, pay({ amount: '5200.01' }), 'owner', NOW), /more than the outstanding/);
  assert.throws(() => svc.recordPayment(db, biz, id, pay({ amount: '0' }), 'owner', NOW));
  assert.throws(() => svc.recordPayment(db, biz, id, pay({ method: 'Bitcoin' }), 'owner', NOW), /payment method/);
  assert.throws(() => svc.recordPayment(db, biz, id, pay({ receivedDate: '2026-12-01' }), 'owner', NOW), /future/);
  assert.throws(() => svc.recordPayment(db, biz, id, { amount: '10', method: 'EFT' }, 'owner', NOW), /idempotency/i);
  assert.equal(svc.getAgreement(db, biz, id).paid_cents, 0);
});

test('a repeated submission with the same idempotency key is not double-counted', () => {
  const { db, biz } = fresh();
  const id = agreementByRef(db, biz, 'Stock order #118');
  const body = pay({ amount: '1000' });
  const a = svc.recordPayment(db, biz, id, body, 'owner', NOW);
  const b = svc.recordPayment(db, biz, id, body, 'owner', NOW);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(svc.getAgreement(db, biz, id).paid_cents, 100000);
});

test('a paid agreement cannot take further payments', () => {
  const { db, biz } = fresh();
  const id = agreementByRef(db, biz, 'Stock order #118');
  svc.recordPayment(db, biz, id, pay({ amount: '5200' }), 'owner', NOW);
  assert.throws(() => svc.recordPayment(db, biz, id, pay(), 'owner', NOW), /paid and cannot take payments/);
});

test('tenant isolation: another business cannot read or change this business records', () => {
  const { db, biz } = fresh();
  const other = Number(db.prepare(`INSERT INTO businesses (name, owner_name, created_at) VALUES ('Other Co','Someone','2026-01-01')`).run().lastInsertRowid);
  const id = agreementByRef(db, biz, 'Stock order #118');
  const taskId = db.prepare('SELECT id FROM follow_up_tasks LIMIT 1').get().id;
  assert.equal(svc.getAgreement(db, other, id), null);
  assert.throws(() => svc.recordPayment(db, other, id, pay(), 'owner', NOW), /not found/i);
  assert.throws(() => svc.recordFollowUpOutcome(db, other, taskId, { outcome: 'disputed', idempotencyKey: crypto.randomUUID() }, 'owner', NOW), /not found/i);
  assert.equal(svc.getDashboard(db, other, NOW).cards.outstanding.cents, 0);
  assert.equal(svc.listCustomers(db, other).length, 0);
  assert.equal(svc.listAgreements(db, other, 'overdue', NOW).length, 0);
  assert.throws(() => svc.markNotificationRead(db, other, 1), /not found/i);
});

test('follow-up: contacting a customer (no answer) never marks the agreement paid', () => {
  const { db, biz } = fresh();
  const task = svc.getDashboard(db, biz, NOW).followUps[0];
  const before = task.outstanding_cents;
  const r = svc.recordFollowUpOutcome(db, biz, task.task_id, { outcome: 'no_answer', idempotencyKey: crypto.randomUUID() }, 'owner', NOW);
  assert.equal(r.task.status, 'pending');
  assert.equal(r.task.attempts, 1);
  assert.equal(r.agreement.outstanding_cents, before);
  assert.equal(r.agreement.status, 'active');
});

test('follow-up: paid in full records a real payment; partial must be less than the balance', () => {
  const { db, biz } = fresh();
  const [t1, t2] = svc.getDashboard(db, biz, NOW).followUps;
  assert.throws(() => svc.recordFollowUpOutcome(db, biz, t1.task_id, { outcome: 'partial_payment', amount: String(t1.outstanding_cents / 100), idempotencyKey: crypto.randomUUID() }, 'owner', NOW), /paid in full/);
  const part = svc.recordFollowUpOutcome(db, biz, t1.task_id, { outcome: 'partial_payment', amount: '500', method: 'Cash', idempotencyKey: crypto.randomUUID() }, 'owner', NOW);
  assert.equal(part.agreement.outstanding_cents, t1.outstanding_cents - 50000);
  assert.equal(part.task.status, 'completed');
  const full = svc.recordFollowUpOutcome(db, biz, t2.task_id, { outcome: 'paid_full', idempotencyKey: crypto.randomUUID() }, 'owner', NOW);
  assert.equal(full.agreement.status, 'paid');
  assert.equal(full.agreement.outstanding_cents, 0);
  assert.equal(svc.getDashboard(db, biz, NOW).followUps.length, 0);
});

test('follow-up: promise to pay on a new date keeps history and creates one new task', () => {
  const { db, biz } = fresh();
  const t = svc.getDashboard(db, biz, NOW).followUps[0];
  assert.throws(() => svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'promise_new_date', newDate: '2026-10-25', idempotencyKey: crypto.randomUUID() }, 'owner', NOW), /after today/);
  const key = crypto.randomUUID();
  const r = svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'promise_new_date', newDate: '2026-11-03', notes: 'Paid on payday', idempotencyKey: key }, 'owner', NOW);
  assert.equal(r.agreement.due_date, '2026-11-03');
  assert.deepEqual(r.agreement.dueHistory.map((h) => [h.old_due_date, h.new_due_date]), [['2026-10-25', '2026-11-03']]);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM follow_up_tasks WHERE agreement_id=? AND due_date='2026-11-03'`).get(t.agreement_id).n, 1);
  const again = svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'promise_new_date', newDate: '2026-11-03', idempotencyKey: key }, 'owner', NOW);
  assert.equal(again.duplicate, true);
});

test('follow-up: disputed stops reminders and removes the agreement from scheduled reminders', () => {
  const { db, biz } = fresh();
  const t = svc.getDashboard(db, biz, NOW).followUps[0];
  const r = svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'disputed', idempotencyKey: crypto.randomUUID() }, 'owner', NOW);
  assert.equal(r.agreement.status, 'disputed');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM scheduled_jobs WHERE agreement_id=? AND status='scheduled'`).get(t.agreement_id).n, 0);
  assert.equal(svc.getDashboard(db, biz, NOW).followUps.length, 1);
});

test('follow-up: "other" requires a note; completed tasks cannot be completed twice', () => {
  const { db, biz } = fresh();
  const t = svc.getDashboard(db, biz, NOW).followUps[0];
  assert.throws(() => svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'other', idempotencyKey: crypto.randomUUID() }, 'owner', NOW), /note/i);
  svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'disputed', idempotencyKey: crypto.randomUUID() }, 'owner', NOW);
  assert.throws(() => svc.recordFollowUpOutcome(db, biz, t.task_id, { outcome: 'disputed', idempotencyKey: crypto.randomUUID() }, 'owner', NOW), /already been completed/);
});

test('database rejects duplicate follow-up tasks and duplicate scheduled jobs', () => {
  const { db, biz } = fresh();
  const t = db.prepare('SELECT agreement_id, due_date FROM follow_up_tasks LIMIT 1').get();
  assert.throws(() => db.prepare('INSERT INTO follow_up_tasks (business_id, agreement_id, due_date, created_at) VALUES (?,?,?,?)').run(biz, t.agreement_id, t.due_date, 'x'));
  assert.throws(() => db.prepare(`INSERT INTO scheduled_jobs (business_id, agreement_id, kind, run_at, idempotency_key, created_at) VALUES (?,?,?,?,?,?)`).run(biz, t.agreement_id, 'reminder_due', 'x', 'seed-job-1', 'x'));
});

test('payments are append-only in practice: balances ignore reversed payments', () => {
  const { db, biz } = fresh();
  const id = agreementByRef(db, biz, 'Stock order #118');
  const r = svc.recordPayment(db, biz, id, pay({ amount: '1000' }), 'owner', NOW);
  db.prepare(`UPDATE payments SET reversed_at='2026-10-25T11:00:00Z' WHERE id=?`).run(r.paymentId);
  assert.equal(svc.getAgreement(db, biz, id).outstanding_cents, 520000);
  assert.equal(svc.getAgreement(db, biz, id).payments.length, 1);   // record retained
});
