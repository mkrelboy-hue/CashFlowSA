import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/index.js';

let server, base;
before(async () => {
  const db = openDb(':memory:');
  seed(db);
  server = createApp(db);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('API serves live dashboard data and security headers', async () => {
  const res = await fetch(`${base}/api/dashboard`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const d = await res.json();
  assert.equal(d.cards.outstanding.cents, 4875000);
});

test('errors do not leak internals; unknown records are 404; bad input is 422', async () => {
  assert.equal((await fetch(`${base}/api/agreements/99999`)).status, 404);
  const bad = await fetch(`${base}/api/agreements/1/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 'x' }) });
  assert.equal(bad.status, 422);
  const malformed = await fetch(`${base}/api/agreements/1/payments`, { method: 'POST', body: '{not json' });
  assert.equal(malformed.status, 422);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

test('static server blocks path traversal', async () => {
  const res = await fetch(`${base}/..%2F..%2Fpackage.json`);
  assert.notEqual(res.status, 200);
});

test('the approved navigation is exactly Dashboard, Customers, Reminders', () => {
  const src = readFileSync(new URL('../public/js/shell.js', import.meta.url), 'utf8');
  const nav = src.slice(src.indexOf('export const NAV'), src.indexOf('export const ACCOUNT_MENU'));
  assert.deepEqual([...nav.matchAll(/label: '([^']+)'/g)].map((m) => m[1]), ['Dashboard', 'Customers', 'Reminders']);
});

test('prohibited dashboard elements are absent from the source', () => {
  const dash = readFileSync(new URL('../public/js/dashboard.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../public/js/shell.js', import.meta.url), 'utf8');
  for (const banned of [/Quick Actions/i, /Debt Trend/i, /type: 'search'/, /<canvas/i, /R99/, /pricing/i]) {
    assert.doesNotMatch(dash + shell, banned);
  }
});
