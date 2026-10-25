-- CashFlow SA - Stage 1 development schema (SQLite via node:sqlite).
-- All money is stored as INTEGER cents. Never use floating point for balances.
-- Every business-owned row carries business_id. Stage 2 adds users, memberships,
-- authentication and the PostgreSQL migration with row-level security.

CREATE TABLE IF NOT EXISTS businesses (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_name    TEXT NOT NULL,
  owner_role    TEXT NOT NULL DEFAULT 'Owner',
  timezone      TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  avatar_path   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY,
  business_id   INTEGER NOT NULL REFERENCES businesses(id),
  first_name    TEXT NOT NULL,
  surname       TEXT NOT NULL,
  cellphone     TEXT,            -- E.164, e.g. +27715550101
  whatsapp      TEXT,            -- E.164
  email         TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id, status);

CREATE TABLE IF NOT EXISTS payment_agreements (
  id             INTEGER PRIMARY KEY,
  business_id    INTEGER NOT NULL REFERENCES businesses(id),
  customer_id    INTEGER NOT NULL REFERENCES customers(id),
  reference      TEXT NOT NULL,
  description    TEXT NOT NULL,
  original_cents INTEGER NOT NULL CHECK (original_cents > 0),
  due_date       TEXT NOT NULL,   -- YYYY-MM-DD in the business timezone
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paid','disputed','cancelled')),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (business_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_agreements_due ON payment_agreements(business_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_agreements_customer ON payment_agreements(customer_id);

CREATE TABLE IF NOT EXISTS agreement_due_date_history (
  id            INTEGER PRIMARY KEY,
  business_id   INTEGER NOT NULL REFERENCES businesses(id),
  agreement_id  INTEGER NOT NULL REFERENCES payment_agreements(id),
  old_due_date  TEXT NOT NULL,
  new_due_date  TEXT NOT NULL,
  reason        TEXT,
  created_at    TEXT NOT NULL
);

-- Payments are append-only. A mistake is corrected by reversing (reversed_at), never by deleting.
CREATE TABLE IF NOT EXISTS payments (
  id               INTEGER PRIMARY KEY,
  business_id      INTEGER NOT NULL REFERENCES businesses(id),
  agreement_id     INTEGER NOT NULL REFERENCES payment_agreements(id),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  received_date    TEXT NOT NULL,
  method           TEXT NOT NULL,
  reference        TEXT,
  notes            TEXT,
  recorded_by      TEXT NOT NULL,
  idempotency_key  TEXT NOT NULL,
  reversed_at      TEXT,
  created_at       TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_payments_agreement ON payments(agreement_id);

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id            INTEGER PRIMARY KEY,
  business_id   INTEGER NOT NULL REFERENCES businesses(id),
  agreement_id  INTEGER NOT NULL REFERENCES payment_agreements(id),
  due_date      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  outcome       TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  completed_at  TEXT,
  UNIQUE (agreement_id, due_date)          -- prevents duplicate tasks
);
CREATE INDEX IF NOT EXISTS idx_followups_day ON follow_up_tasks(business_id, status, due_date);

CREATE TABLE IF NOT EXISTS follow_up_events (
  id               INTEGER PRIMARY KEY,
  business_id      INTEGER NOT NULL REFERENCES businesses(id),
  task_id          INTEGER NOT NULL REFERENCES follow_up_tasks(id),
  outcome          TEXT NOT NULL,
  notes            TEXT,
  amount_cents     INTEGER,
  idempotency_key  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key)
);

-- A row here is a durable job. Stage 4 adds the worker that executes them.
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id               INTEGER PRIMARY KEY,
  business_id      INTEGER NOT NULL REFERENCES businesses(id),
  agreement_id     INTEGER NOT NULL REFERENCES payment_agreements(id),
  kind             TEXT NOT NULL,            -- reminder_before | reminder_due | reminder_overdue
  run_at           TEXT NOT NULL,            -- ISO UTC instant
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','running','sent','failed','cancelled')),
  idempotency_key  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  UNIQUE (business_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_jobs_run ON scheduled_jobs(business_id, status, run_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY,
  business_id   INTEGER NOT NULL REFERENCES businesses(id),
  event_type    TEXT NOT NULL,   -- payment_received | reminder_sent | customer_added | agreement_overdue | agreement_updated | follow_up_completed
  customer_id   INTEGER REFERENCES customers(id),
  agreement_id  INTEGER REFERENCES payment_agreements(id),
  title         TEXT NOT NULL,
  detail        TEXT,
  actor         TEXT NOT NULL DEFAULT 'system',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_logs(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY,
  business_id   INTEGER NOT NULL REFERENCES businesses(id),
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  detail        TEXT,
  agreement_id  INTEGER REFERENCES payment_agreements(id),
  read_at       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(business_id, read_at);

-- Single source of truth for balances: original minus valid (non-reversed) payments.
CREATE VIEW IF NOT EXISTS agreement_balances AS
SELECT a.*,
       COALESCE((SELECT SUM(p.amount_cents) FROM payments p
                 WHERE p.agreement_id = a.id AND p.reversed_at IS NULL), 0) AS paid_cents,
       a.original_cents - COALESCE((SELECT SUM(p.amount_cents) FROM payments p
                 WHERE p.agreement_id = a.id AND p.reversed_at IS NULL), 0) AS outstanding_cents
FROM payment_agreements a;
