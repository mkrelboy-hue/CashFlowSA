// Synthetic DEVELOPMENT data only. Run with `npm run seed`. Never run against production.
// All dates are generated relative to "today" in the business timezone so the dashboard always looks current.
import { rmSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDb, transaction, DEFAULT_DB_PATH } from './db.js';
import { todayIn, addDays } from './dates.js';

const iso = (ymd, hh = 8, mm = 0) => `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`;

export function seed(db, now = new Date()) {
  return transaction(db, () => {
    const tz = 'Africa/Johannesburg';
    const today = todayIn(tz, now);
    const d = (n) => addDays(today, n);
    const created = now.toISOString();

    const biz = Number(db.prepare(
      `INSERT INTO businesses (name, owner_name, owner_role, timezone, created_at) VALUES (?,?,?,?,?)`)
      .run('Tsuprise Trading (Pty) Ltd', 'Thabo Mokoena', 'Owner', tz, created).lastInsertRowid);

    const customers = {};
    const addCustomer = (key, first, surname, phone, email, daysAgo) => {
      customers[key] = Number(db.prepare(
        `INSERT INTO customers (business_id, first_name, surname, cellphone, whatsapp, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(biz, first, surname, phone, phone, email, iso(d(-daysAgo)), iso(d(-daysAgo))).lastInsertRowid);
    };
    addCustomer('sipho', 'Sipho', 'Dlamini', '+27715550101', 'sipho@example.com', 60);
    addCustomer('naledi', 'Naledi', 'Khumalo', '+27715550102', 'naledi@example.com', 55);
    addCustomer('pieter', 'Pieter', 'van der Merwe', '+27715550103', 'pieter@example.com', 50);
    addCustomer('ayesha', 'Ayesha', 'Patel', '+27715550104', 'ayesha@example.com', 45);
    addCustomer('lerato', 'Lerato', 'Mahlangu', '+27715550105', 'lerato@example.com', 3);
    addCustomer('johan', 'Johan', 'Botha', '+27715550106', 'johan@example.com', 40);
    addCustomer('zanele', 'Zanele', 'Ndlovu', '+27715550107', 'zanele@example.com', 35);

    let seq = 0;
    const agreements = {};
    const addAgreement = (key, cust, desc, rand, dueOffset) => {
      seq += 1;
      const ref = `AGR-${today.slice(0, 4)}-${String(seq).padStart(4, '0')}`;
      agreements[key] = Number(db.prepare(
        `INSERT INTO payment_agreements (business_id, customer_id, reference, description, original_cents, due_date, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`).run(biz, customers[cust], ref, desc, rand * 100, d(dueOffset), iso(d(-30)), iso(d(-30))).lastInsertRowid);
    };
    // Due today: R4,000 + R2,500 = R6,500
    addAgreement('naledi1', 'naledi', 'Catering deposit balance', 4000, 0);
    addAgreement('pieter1', 'pieter', 'Equipment hire', 2500, 0);
    // Overdue: 5,200 + 3,600 + (8,100 less 2,000 paid) 6,100 + 3,400 = R18,300
    addAgreement('sipho1', 'sipho', 'Stock order #118', 5200, -12);
    addAgreement('ayesha1', 'ayesha', 'Fabric supply', 3600, -5);
    addAgreement('johan1', 'johan', 'Delivery contract', 8100, -21);
    addAgreement('zanele1', 'zanele', 'Printing services', 3400, -8);
    // Upcoming: 7,000 + 7,000 + 9,950 = R23,950
    addAgreement('pieter2', 'pieter', 'Shopfitting instalment', 7000, 5);
    addAgreement('naledi2', 'naledi', 'Event supplies', 7000, 7);
    addAgreement('lerato1', 'lerato', 'Bulk order', 9950, 12);

    db.prepare(
      `INSERT INTO payments (business_id, agreement_id, amount_cents, received_date, method, reference, recorded_by, idempotency_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`).run(biz, agreements.johan1, 200000, d(-2), 'EFT', 'SEED-EFT-001', 'owner', 'seed-payment-0001', iso(d(-2), 9, 15));

    const followUp = db.prepare(`INSERT INTO follow_up_tasks (business_id, agreement_id, due_date, created_at) VALUES (?,?,?,?)`);
    followUp.run(biz, agreements.naledi1, today, created);
    followUp.run(biz, agreements.pieter1, today, created);

    // Scheduled reminder jobs (rows only; the Stage 4 worker will execute them).
    const job = db.prepare(`INSERT INTO scheduled_jobs (business_id, agreement_id, kind, run_at, idempotency_key, created_at) VALUES (?,?,?,?,?,?)`);
    job.run(biz, agreements.sipho1, 'reminder_overdue', iso(d(1), 7, 0), 'seed-job-1', created);
    job.run(biz, agreements.pieter2, 'reminder_before', iso(d(2), 7, 0), 'seed-job-2', created);
    job.run(biz, agreements.johan1, 'reminder_overdue', iso(d(3), 7, 0), 'seed-job-3', created);
    job.run(biz, agreements.naledi2, 'reminder_before', iso(d(4), 7, 0), 'seed-job-4', created);
    job.run(biz, agreements.lerato1, 'reminder_before', iso(d(9), 7, 0), 'seed-job-5', created);

    const log = db.prepare(`INSERT INTO audit_logs (business_id, event_type, customer_id, agreement_id, title, detail, created_at) VALUES (?,?,?,?,?,?,?)`);
    log.run(biz, 'customer_added', customers.lerato, null, 'Customer added', 'Lerato Mahlangu', iso(d(-3), 10, 5));
    log.run(biz, 'payment_received', customers.johan, agreements.johan1, 'Partial payment received', 'R2,000.00 via EFT', iso(d(-2), 9, 15));
    log.run(biz, 'agreement_updated', customers.pieter, agreements.pieter2, 'Payment date changed', 'Moved to ' + new Intl.DateTimeFormat('en-ZA', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d(5) + 'T00:00:00Z')), iso(d(-1), 14, 30));
    log.run(biz, 'agreement_overdue', customers.ayesha, agreements.ayesha1, 'Agreement overdue', '5 days overdue', iso(d(-1), 6, 0));
    log.run(biz, 'follow_up_completed', customers.sipho, agreements.sipho1, 'Follow-up attempt: no answer', 'Left a voicemail', iso(d(-1), 11, 20));

    const note = db.prepare(`INSERT INTO notifications (business_id, kind, title, detail, agreement_id, created_at) VALUES (?,?,?,?,?,?)`);
    note.run(biz, 'follow_up', 'Follow-up due today', 'Naledi Khumalo - R4,000', agreements.naledi1, created);
    note.run(biz, 'follow_up', 'Follow-up due today', 'Pieter van der Merwe - R2,500', agreements.pieter1, created);
    note.run(biz, 'overdue', 'Agreement overdue', 'Johan Botha - 21 days overdue', agreements.johan1, iso(d(-1), 6, 0));

    return { businessId: biz, today };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--reset')) {
    for (const suffix of ['', '-wal', '-shm']) if (existsSync(DEFAULT_DB_PATH + suffix)) rmSync(DEFAULT_DB_PATH + suffix);
  }
  const db = openDb();
  const exists = db.prepare('SELECT COUNT(*) AS n FROM businesses').get().n;
  if (exists) { console.log('Database already has data. Use --reset to recreate it.'); process.exit(0); }
  const r = seed(db);
  console.log(`Seeded synthetic development data for business ${r.businessId} (today = ${r.today}).`);
}
