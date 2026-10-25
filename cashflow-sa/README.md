# CashFlow SA

Get paid. Stay in control. Payment-agreement tracking for South African small businesses (R99/business/month).

## Status: Stage 1 of 6 (dashboard + working foundations)

| Stage | Scope | State |
|---|---|---|
| 1 | Approved dashboard, responsive design system, real DB-backed totals, follow-up outcomes, record payment | **Built and tested (see below)** |
| 2 | Authentication, business profile + photo upload, PostgreSQL + RLS tenant isolation | Not started |
| 3 | Customer CRUD/profiles, agreement CRUD, adjustments/reversals UI | Not started |
| 4 | Reminder settings, WhatsApp + SMS providers, job worker, delivery webhooks | Not started |
| 5 | PayFast R99 subscription, ITN verification, suspension/restoration | Not started |
| 6 | Hardening, backups, deployment config, launch checklist | Not started |

## Run it (Node >= 22.13, no npm install needed)

    npm run seed      # creates data/dev.db with SYNTHETIC development data (never use in production)
    npm start         # http://localhost:3000
    npm test          # 21 automated tests

## Architecture (Stage 1)

- `server/` Node built-ins only: `node:http`, `node:sqlite`. No third-party packages.
- `server/migrations/001_init.sql` schema. Money is INTEGER cents; balances come from the `agreement_balances` view.
- `server/services.js` all business logic. Every query is scoped by `business_id`. Payments and follow-up outcomes run in transactions and are idempotent (client-supplied key + UNIQUE constraint).
- `public/` vanilla ES modules + CSS. All text is inserted as text nodes; a strict CSP is sent.

## Known limitations (be aware before relying on this)

- **No authentication yet.** The dev server serves one business (`DEV_BUSINESS_ID`, default 1). Do not expose it to the internet.
- **SQLite is a development stand-in.** The spec calls for PostgreSQL with row-level security; that migration is Stage 2. Tenant isolation is currently enforced in the server layer only (and tested), not by the database.
- **No messages are sent.** `scheduled_jobs` rows exist but no worker executes them and no WhatsApp/SMS provider is connected (Stage 4).
- **No PayFast integration yet** (Stage 5). Nothing here unlocks or restricts accounts.
- Customers/Reminders pages are read-only lists for now; the account-menu pages are labelled placeholders.
- The dashboard was built from the written spec because the approved screenshot was not supplied; compare it against your screenshot and report differences.
