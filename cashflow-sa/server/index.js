import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import * as svc from './services.js';
import { ValidationError } from './money.js';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };

// STAGE 1 ONLY: no authentication yet, so the dev server serves a single configured business.
// Stage 2 replaces this with the signed-in user's business membership (and Postgres row-level security).
const DEV_BUSINESS_ID = Number(process.env.DEV_BUSINESS_ID || 1);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, data) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ValidationError('Invalid JSON body.'); }
}

export function createApp(db) {
  const biz = DEV_BUSINESS_ID;

  async function api(req, res, url) {
    const { pathname } = url;
    const method = req.method;
    let m;
    if (method === 'GET' && pathname === '/api/me') return sendJson(res, 200, svc.getMe(db, biz));
    if (method === 'GET' && pathname === '/api/dashboard') return sendJson(res, 200, svc.getDashboard(db, biz));
    if (method === 'GET' && pathname === '/api/agreements') return sendJson(res, 200, svc.listAgreements(db, biz, url.searchParams.get('filter')));
    if (method === 'GET' && pathname === '/api/customers') return sendJson(res, 200, svc.listCustomers(db, biz, url.searchParams.get('q') ?? ''));
    if (method === 'GET' && pathname === '/api/activity') return sendJson(res, 200, svc.listActivity(db, biz));
    if (method === 'GET' && pathname === '/api/reminders') return sendJson(res, 200, svc.listScheduledReminders(db, biz));
    if (method === 'GET' && pathname === '/api/notifications') return sendJson(res, 200, svc.listNotifications(db, biz));
    if (method === 'POST' && (m = /^\/api\/notifications\/(\d+)\/read$/.exec(pathname))) {
      svc.markNotificationRead(db, biz, Number(m[1])); return sendJson(res, 200, { ok: true });
    }
    if (method === 'GET' && (m = /^\/api\/agreements\/(\d+)$/.exec(pathname))) {
      const a = svc.getAgreement(db, biz, Number(m[1]));
      if (!a) throw new svc.NotFoundError('Agreement');
      return sendJson(res, 200, a);
    }
    if (method === 'POST' && (m = /^\/api\/agreements\/(\d+)\/payments$/.exec(pathname))) {
      const out = svc.recordPayment(db, biz, Number(m[1]), await readJson(req));
      return sendJson(res, out.duplicate ? 200 : 201, out);
    }
    if (method === 'POST' && (m = /^\/api\/follow-ups\/(\d+)\/outcome$/.exec(pathname))) {
      const out = svc.recordFollowUpOutcome(db, biz, Number(m[1]), await readJson(req));
      return sendJson(res, out.duplicate ? 200 : 201, out);
    }
    throw new svc.NotFoundError('Endpoint');
  }

  async function serveStatic(res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = normalize(join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      return send(res, 200, body, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    } catch {
      // Single-page app: unknown non-asset paths fall back to the shell.
      if (!extname(pathname)) return send(res, 200, await readFile(join(PUBLIC_DIR, 'index.html')), { 'Content-Type': MIME['.html'] });
      return send(res, 404, 'Not found');
    }
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return await serveStatic(res, decodeURIComponent(url.pathname));
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error(err);   // full detail stays in the server log only
      sendJson(res, status, { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message, field: err.field });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const db = openDb();
  const port = Number(process.env.PORT || 3000);
  createApp(db).listen(port, () => console.log(`CashFlow SA (dev) on http://localhost:${port}`));
}
