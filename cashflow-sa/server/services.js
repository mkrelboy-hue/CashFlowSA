import { transaction } from './db.js';
import { parseRandsToCents, ValidationError } from './money.js';
import { todayIn, addDays, daysBetween, isValidYmd } from './dates.js';

const OPEN = `status IN ('active','disputed')`;           // agreements that can still be owed
const nowIso = () => new Date().toISOString();

export class NotFoundError extends Error {
  constructor(what = 'Record') { super(`${what} not found.`); this.name = 'NotFoundError'; this.status = 404; }
}

export function getBusiness(db, businessId) {
  const b = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  if (!b) throw new NotFoundError('Business');
  return b;
}

export function getMe(db, businessId, now = new Date()) {
  const b = getBusiness(db, businessId);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE business_id = ? AND read_at IS NULL').get(businessId).n;
  return {
    today: todayIn(b.timezone, now), timezone: b.timezone, unreadNotifications: unread,
    business: { id: b.id, name: b.name, owner_name: b.owner_name, owner_role: b.owner_role, avatar_path: b.avatar_path },
  };
}

const initials = (first, last) => `${(first || '')[0] ?? ''}${(last || '')[0] ?? ''}`.toUpperCase();

/* ------------------------------------------------------------------ dashboard */

export function getDashboard(db, businessId, now = new Date()) {
  const business = getBusiness(db, businessId);
  const today = todayIn(business.timezone, now);

  const outstanding = db.prepare(
    `SELECT COALESCE(SUM(outstanding_cents),0) AS cents, COUNT(DISTINCT customer_id) AS customers
       FROM agreement_balances WHERE business_id = ? AND ${OPEN} AND outstanding_cents > 0`).get(businessId);

  const dueToday = db.prepare(
    `SELECT COALESCE(SUM(outstanding_cents),0) AS cents, COUNT(*) AS agreements
       FROM agreement_balances WHERE business_id = ? AND ${OPEN} AND outstanding_cents > 0 AND due_date = ?`)
    .get(businessId, today);

  const overdue = db.prepare(
    `SELECT COALESCE(SUM(outstanding_cents),0) AS cents, COUNT(*) AS agreements
       FROM agreement_balances WHERE business_id = ? AND ${OPEN} AND outstanding_cents > 0 AND due_date < ?`)
    .get(businessId, today);

  const upcomingCount = db.prepare(
    `SELECT COUNT(*) AS n FROM scheduled_jobs j
       JOIN agreement_balances a ON a.id = j.agreement_id
      WHERE j.business_id = ? AND j.status = 'scheduled' AND j.run_at >= ?
        AND a.status = 'active' AND a.outstanding_cents > 0`).get(businessId, now.toISOString()).n;

  const activity = db.prepare(
    `SELECT l.id, l.event_type, l.title, l.detail, l.created_at,
            c.first_name, c.surname, l.agreement_id
       FROM audit_logs l LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.business_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 6`).all(businessId)
    .map((r) => ({ ...r, customer: r.first_name ? `${r.first_name} ${r.surname}` : null }));

  const followUps = db.prepare(
    `SELECT t.id AS task_id, t.status AS task_status, t.attempts, a.id AS agreement_id, a.reference,
            a.due_date, a.status AS agreement_status, a.outstanding_cents,
            c.id AS customer_id, c.first_name, c.surname, c.cellphone, c.whatsapp
       FROM follow_up_tasks t
       JOIN agreement_balances a ON a.id = t.agreement_id
       JOIN customers c ON c.id = a.customer_id
      WHERE t.business_id = ? AND t.status = 'pending' AND t.due_date = ?
      ORDER BY a.outstanding_cents DESC, t.id`).all(businessId, today)
    .map((r) => ({ ...r, name: `${r.first_name} ${r.surname}`, initials: initials(r.first_name, r.surname) }));

  const overdueRows = db.prepare(
    `SELECT a.id AS agreement_id, a.reference, a.due_date, a.status, a.outstanding_cents,
            c.id AS customer_id, c.first_name, c.surname
       FROM agreement_balances a JOIN customers c ON c.id = a.customer_id
      WHERE a.business_id = ? AND a.${OPEN} AND a.outstanding_cents > 0 AND a.due_date < ?
      ORDER BY a.due_date DESC, a.id LIMIT 5`).all(businessId, today)
    .map((r) => ({ ...r, name: `${r.first_name} ${r.surname}`, days_overdue: daysBetween(r.due_date, today) }));

  const upcomingRows = db.prepare(
    `SELECT j.id AS job_id, j.kind, j.run_at, a.id AS agreement_id, a.due_date, a.outstanding_cents,
            c.first_name, c.surname
       FROM scheduled_jobs j
       JOIN agreement_balances a ON a.id = j.agreement_id
       JOIN customers c ON c.id = a.customer_id
      WHERE j.business_id = ? AND j.status = 'scheduled' AND j.run_at >= ?
        AND a.status = 'active' AND a.outstanding_cents > 0
      ORDER BY j.run_at, j.id LIMIT 5`).all(businessId, now.toISOString())
    .map((r) => ({
      ...r, name: `${r.first_name} ${r.surname}`,
      in_days: Math.max(0, daysBetween(today, todayIn(business.timezone, new Date(r.run_at)))),
    }));

  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE business_id = ? AND read_at IS NULL').get(businessId).n;

  return {
    today, timezone: business.timezone,
    business: { id: business.id, name: business.name, owner_name: business.owner_name, owner_role: business.owner_role, avatar_path: business.avatar_path },
    cards: {
      outstanding: { cents: outstanding.cents, customers: outstanding.customers },
      dueToday: { cents: dueToday.cents, agreements: dueToday.agreements },
      overdue: { cents: overdue.cents, agreements: overdue.agreements },
      upcomingReminders: { count: upcomingCount },
    },
    activity, followUps, overdue: overdueRows, upcomingReminders: upcomingRows, unreadNotifications: unread,
  };
}

/* ---------------------------------------------------------------- list views */

export function listAgreements(db, businessId, filter, now = new Date()) {
  const business = getBusiness(db, businessId);
  const today = todayIn(business.timezone, now);
  const extra = {
    due_today: 'AND a.due_date = ?',
    overdue: 'AND a.due_date < ?',
  }[filter] ?? '';
  const params = extra ? [businessId, today] : [businessId];
  return db.prepare(
    `SELECT a.id AS agreement_id, a.reference, a.description, a.due_date, a.status, a.original_cents,
            a.paid_cents, a.outstanding_cents, c.id AS customer_id, c.first_name, c.surname
       FROM agreement_balances a JOIN customers c ON c.id = a.customer_id
      WHERE a.business_id = ? AND a.status IN ('active','disputed') AND a.outstanding_cents > 0 ${extra}
      ORDER BY a.due_date, a.id`).all(...(extra ? [businessId, today] : [businessId]))
    .map((r) => ({ ...r, name: `${r.first_name} ${r.surname}`, days_overdue: Math.max(0, daysBetween(r.due_date, today)) }));
}

export function listCustomers(db, businessId, search = '') {
  const q = `%${search.trim().toLowerCase()}%`;
  return db.prepare(
    `SELECT c.id, c.first_name, c.surname, c.cellphone, c.whatsapp, c.email, c.status,
            COALESCE((SELECT SUM(a.outstanding_cents) FROM agreement_balances a
                       WHERE a.customer_id = c.id AND a.${OPEN} AND a.outstanding_cents > 0), 0) AS outstanding_cents,
            (SELECT COUNT(*) FROM payment_agreements a WHERE a.customer_id = c.id) AS agreements
       FROM customers c
      WHERE c.business_id = ?
        AND (? = '%%' OR lower(c.first_name || ' ' || c.surname) LIKE ? OR c.cellphone LIKE ? OR lower(COALESCE(c.email,'')) LIKE ?)
      ORDER BY c.first_name, c.surname`).all(businessId, q, q, q, q)
    .map((r) => ({ ...r, name: `${r.first_name} ${r.surname}`, initials: initials(r.first_name, r.surname) }));
}

export function listActivity(db, businessId) {
  return db.prepare(
    `SELECT l.id, l.event_type, l.title, l.detail, l.created_at, c.first_name, c.surname, l.agreement_id
       FROM audit_logs l LEFT JOIN customers c ON c.id = l.customer_id
      WHERE l.business_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 100`).all(businessId)
    .map((r) => ({ ...r, customer: r.first_name ? `${r.first_name} ${r.surname}` : null }));
}

export function listScheduledReminders(db, businessId, now = new Date()) {
  const business = getBusiness(db, businessId);
  const today = todayIn(business.timezone, now);
  return db.prepare(
    `SELECT j.id AS job_id, j.kind, j.run_at, j.status, a.id AS agreement_id, a.reference, a.due_date, a.outstanding_cents,
            c.first_name, c.surname
       FROM scheduled_jobs j JOIN agreement_balances a ON a.id = j.agreement_id JOIN customers c ON c.id = a.customer_id
      WHERE j.business_id = ? AND j.status = 'scheduled' ORDER BY j.run_at, j.id`).all(businessId)
    .map((r) => ({ ...r, name: `${r.first_name} ${r.surname}`,
      in_days: Math.max(0, daysBetween(today, todayIn(business.timezone, new Date(r.run_at)))) }));
}

/* --------------------------------------------------------------- agreements */

export function getAgreement(db, businessId, agreementId) {
  const a = db.prepare(
    `SELECT a.*, c.first_name, c.surname, c.cellphone, c.whatsapp
       FROM agreement_balances a JOIN customers c ON c.id = a.customer_id
      WHERE a.id = ? AND a.business_id = ?`).get(agreementId, businessId);   // tenant scoped
  if (!a) return null;
  const payments = db.prepare(
    `SELECT id, amount_cents, received_date, method, reference, notes, recorded_by, reversed_at, created_at
       FROM payments WHERE agreement_id = ? AND business_id = ? ORDER BY received_date, id`).all(agreementId, businessId);
  const dueHistory = db.prepare(
    `SELECT old_due_date, new_due_date, reason, created_at FROM agreement_due_date_history
      WHERE agreement_id = ? AND business_id = ? ORDER BY id`).all(agreementId, businessId);
  return { ...a, name: `${a.first_name} ${a.surname}`, payments, dueHistory };
}

function logAudit(db, businessId, { type, customerId = null, agreementId = null, title, detail = null, actor = 'owner' }) {
  db.prepare(
    `INSERT INTO audit_logs (business_id, event_type, customer_id, agreement_id, title, detail, actor, created_at)
     VALUES (?,?,?,?,?,?,?,?)`).run(businessId, type, customerId, agreementId, title, detail, actor, nowIso());
}

function cancelAgreementJobs(db, businessId, agreementId) {
  db.prepare(`UPDATE scheduled_jobs SET status='cancelled' WHERE business_id=? AND agreement_id=? AND status='scheduled'`)
    .run(businessId, agreementId);
}

const METHODS = ['EFT', 'Cash', 'Card', 'SnapScan', 'Other'];

/**
 * Record a customer payment against an agreement. Runs in a transaction and is idempotent on
 * (business, idempotencyKey). Does NOT touch PayFast subscription billing.
 */
export function recordPayment(db, businessId, agreementId, input, actor = 'owner', now = new Date()) {
  const business = getBusiness(db, businessId);
  const key = String(input.idempotencyKey ?? '').trim();
  if (key.length < 8 || key.length > 100) throw new ValidationError('Missing idempotency key.', 'idempotencyKey');
  const cents = parseRandsToCents(input.amount, 'amount');
  const received = input.receivedDate || todayIn(business.timezone, now);
  if (!isValidYmd(received)) throw new ValidationError('Enter a valid date received.', 'receivedDate');
  if (received > todayIn(business.timezone, now)) throw new ValidationError('Date received cannot be in the future.', 'receivedDate');
  const method = METHODS.includes(input.method) ? input.method : null;
  if (!method) throw new ValidationError('Choose a payment method.', 'method');
  const reference = String(input.reference ?? '').trim().slice(0, 100) || null;
  const notes = String(input.notes ?? '').trim().slice(0, 1000) || null;

  return transaction(db, () => {
    const dup = db.prepare('SELECT id, agreement_id FROM payments WHERE business_id=? AND idempotency_key=?').get(businessId, key);
    if (dup) return { duplicate: true, paymentId: dup.id, agreement: getAgreement(db, businessId, dup.agreement_id) };

    const a = getAgreement(db, businessId, agreementId);
    if (!a) throw new NotFoundError('Agreement');
    if (!['active', 'disputed'].includes(a.status)) throw new ValidationError(`This agreement is ${a.status} and cannot take payments.`, 'agreement');
    if (cents > a.outstanding_cents) throw new ValidationError('Amount is more than the outstanding balance.', 'amount');

    const res = db.prepare(
      `INSERT INTO payments (business_id, agreement_id, amount_cents, received_date, method, reference, notes, recorded_by, idempotency_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`).run(businessId, agreementId, cents, received, method, reference, notes, actor, key, nowIso());

    const remaining = a.outstanding_cents - cents;
    if (remaining === 0) {
      db.prepare(`UPDATE payment_agreements SET status='paid', updated_at=? WHERE id=? AND business_id=?`).run(nowIso(), agreementId, businessId);
      cancelAgreementJobs(db, businessId, agreementId);
      db.prepare(`UPDATE follow_up_tasks SET status='completed', outcome='paid_full', completed_at=? WHERE agreement_id=? AND business_id=? AND status='pending'`)
        .run(nowIso(), agreementId, businessId);
    } else {
      db.prepare(`UPDATE payment_agreements SET updated_at=? WHERE id=? AND business_id=?`).run(nowIso(), agreementId, businessId);
    }
    logAudit(db, businessId, {
      type: 'payment_received', customerId: a.customer_id, agreementId,
      title: remaining === 0 ? 'Payment received - paid in full' : 'Partial payment received',
      detail: `${a.reference}: ${(cents / 100).toFixed(2)} via ${method}`, actor,
    });
    return { duplicate: false, paymentId: Number(res.lastInsertRowid), agreement: getAgreement(db, businessId, agreementId) };
  });
}

/* ---------------------------------------------------------------- follow-ups */

export const OUTCOMES = ['paid_full', 'partial_payment', 'promise_new_date', 'no_answer', 'disputed', 'other'];

/** Persist the owner's outcome for a payment-date follow-up. Contact alone never marks an agreement paid. */
export function recordFollowUpOutcome(db, businessId, taskId, input, actor = 'owner', now = new Date()) {
  const business = getBusiness(db, businessId);
  const today = todayIn(business.timezone, now);
  const outcome = input.outcome;
  if (!OUTCOMES.includes(outcome)) throw new ValidationError('Choose an outcome.', 'outcome');
  const key = String(input.idempotencyKey ?? '').trim();
  if (key.length < 8 || key.length > 100) throw new ValidationError('Missing idempotency key.', 'idempotencyKey');
  const notes = String(input.notes ?? '').trim().slice(0, 1000) || null;
  if (outcome === 'other' && !notes) throw new ValidationError('Add a note describing the outcome.', 'notes');

  // Validate inputs before opening a write transaction.
  let amountCents = null;
  if (outcome === 'partial_payment') amountCents = parseRandsToCents(input.amount, 'amount');
  let newDate = null;
  if (outcome === 'promise_new_date') {
    newDate = input.newDate;
    if (!isValidYmd(newDate)) throw new ValidationError('Choose the date the customer promised to pay.', 'newDate');
    if (newDate <= today) throw new ValidationError('The new date must be after today.', 'newDate');
  }

  return transaction(db, () => {
    const prior = db.prepare('SELECT id FROM follow_up_events WHERE business_id=? AND idempotency_key=?').get(businessId, key);
    const task = db.prepare('SELECT * FROM follow_up_tasks WHERE id=? AND business_id=?').get(taskId, businessId);   // tenant scoped
    if (!task) throw new NotFoundError('Follow-up');
    if (prior) return { duplicate: true, task, agreement: getAgreement(db, businessId, task.agreement_id) };
    if (task.status !== 'pending') throw new ValidationError('This follow-up has already been completed.', 'outcome');

    const a = getAgreement(db, businessId, task.agreement_id);
    const completeTask = () => db.prepare(`UPDATE follow_up_tasks SET status='completed', outcome=?, completed_at=? WHERE id=?`).run(outcome, nowIso(), taskId);
    const event = (cents) => db.prepare(
      `INSERT INTO follow_up_events (business_id, task_id, outcome, notes, amount_cents, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(businessId, taskId, outcome, notes, cents, key, nowIso());

    if (outcome === 'paid_full' || outcome === 'partial_payment') {
      const cents = outcome === 'paid_full' ? a.outstanding_cents : amountCents;
      if (outcome === 'partial_payment' && cents >= a.outstanding_cents) {
        throw new ValidationError('That covers the full balance. Choose "Customer paid in full" instead.', 'amount');
      }
      // Payment goes through the same transactional path (nested use of an open transaction is avoided by inlining).
      const payKey = `followup-${taskId}-${key}`;
      db.prepare(
        `INSERT INTO payments (business_id, agreement_id, amount_cents, received_date, method, reference, notes, recorded_by, idempotency_key, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`).run(businessId, a.id, cents, today, METHODS.includes(input.method) ? input.method : 'EFT',
        String(input.paymentReference ?? '').trim().slice(0, 100) || null, notes, actor, payKey, nowIso());
      if (outcome === 'paid_full') {
        db.prepare(`UPDATE payment_agreements SET status='paid', updated_at=? WHERE id=? AND business_id=?`).run(nowIso(), a.id, businessId);
        cancelAgreementJobs(db, businessId, a.id);
      } else {
        db.prepare(`UPDATE payment_agreements SET updated_at=? WHERE id=? AND business_id=?`).run(nowIso(), a.id, businessId);
      }
      completeTask(); event(cents);
      logAudit(db, businessId, { type: 'payment_received', customerId: a.customer_id, agreementId: a.id,
        title: outcome === 'paid_full' ? 'Payment received - paid in full' : 'Partial payment received',
        detail: `${a.reference}: ${(cents / 100).toFixed(2)}`, actor });
    } else if (outcome === 'promise_new_date') {
      db.prepare(`INSERT INTO agreement_due_date_history (business_id, agreement_id, old_due_date, new_due_date, reason, created_at) VALUES (?,?,?,?,?,?)`)
        .run(businessId, a.id, a.due_date, newDate, notes ?? 'Customer promised a new payment date', nowIso());
      db.prepare(`UPDATE payment_agreements SET due_date=?, updated_at=? WHERE id=? AND business_id=?`).run(newDate, nowIso(), a.id, businessId);
      cancelAgreementJobs(db, businessId, a.id);    // old reminder schedule no longer applies; Stage 4 reschedules
      completeTask(); event(null);
      db.prepare(`INSERT OR IGNORE INTO follow_up_tasks (business_id, agreement_id, due_date, created_at) VALUES (?,?,?,?)`)
        .run(businessId, a.id, newDate, nowIso());
      logAudit(db, businessId, { type: 'agreement_updated', customerId: a.customer_id, agreementId: a.id,
        title: 'Payment date changed', detail: `${a.reference}: ${a.due_date} to ${newDate}`, actor });
    } else if (outcome === 'disputed') {
      db.prepare(`UPDATE payment_agreements SET status='disputed', updated_at=? WHERE id=? AND business_id=?`).run(nowIso(), a.id, businessId);
      cancelAgreementJobs(db, businessId, a.id);
      completeTask(); event(null);
      logAudit(db, businessId, { type: 'agreement_updated', customerId: a.customer_id, agreementId: a.id,
        title: 'Agreement marked disputed', detail: a.reference, actor });
    } else if (outcome === 'no_answer') {
      db.prepare(`UPDATE follow_up_tasks SET attempts = attempts + 1 WHERE id=?`).run(taskId);   // task stays pending
      event(null);
      logAudit(db, businessId, { type: 'follow_up_completed', customerId: a.customer_id, agreementId: a.id,
        title: 'Follow-up attempt: no answer', detail: a.reference, actor });
    } else {   // other - note only, task stays pending
      event(null);
      logAudit(db, businessId, { type: 'follow_up_completed', customerId: a.customer_id, agreementId: a.id,
        title: 'Follow-up note added', detail: notes, actor });
    }
    return { duplicate: false, task: db.prepare('SELECT * FROM follow_up_tasks WHERE id=?').get(taskId), agreement: getAgreement(db, businessId, a.id) };
  });
}

/* -------------------------------------------------------------- notifications */

export function listNotifications(db, businessId) {
  return db.prepare(
    `SELECT id, kind, title, detail, agreement_id, read_at, created_at FROM notifications
      WHERE business_id = ? ORDER BY created_at DESC, id DESC LIMIT 20`).all(businessId);
}

export function markNotificationRead(db, businessId, id) {
  const r = db.prepare(`UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND business_id = ?`).run(nowIso(), id, businessId);
  if (!r.changes) throw new NotFoundError('Notification');
}
