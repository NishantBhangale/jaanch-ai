import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { MemoryStore } from '../src/db/memoryStore.js';
import { sessionMiddleware } from '../src/auth/auth.js';
import { createApiRouter } from '../src/routes/api.js';

let server;
let base;
let store;

before(async () => {
  store = new MemoryStore();
  const app = express();
  app.use(express.json());
  app.use('/api', sessionMiddleware(store));
  app.use('/api', createApiRouter({ store, worker: null }));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (path, { method = 'GET', body, cookie } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.arrayBuffer();
  return { res, json: () => JSON.parse(Buffer.from(text).toString()), bytes: Buffer.from(text) };
};

test('signup, session, history and logout', async () => {
  const bad = await call('/auth/signup', { method: 'POST', body: { email: 'x', password: 'short' } });
  assert.equal(bad.res.status, 400);

  const up = await call('/auth/signup', { method: 'POST', body: { email: 'Asha@Example.in', password: 'password123', name: 'Asha' } });
  assert.equal(up.res.status, 201);
  const cookie = up.res.headers.get('set-cookie').split(';')[0];
  assert.match(up.res.headers.get('set-cookie'), /HttpOnly/);

  const dup = await call('/auth/signup', { method: 'POST', body: { email: 'asha@example.in', password: 'password123' } });
  assert.equal(dup.res.status, 409);

  assert.equal((await call('/auth/me')).json().user, null);
  assert.equal((await call('/auth/me', { cookie })).json().user.email, 'asha@example.in');

  assert.equal((await call('/me/history')).res.status, 401);

  const wrong = await call('/auth/login', { method: 'POST', body: { email: 'asha@example.in', password: 'nope-nope' } });
  assert.equal(wrong.res.status, 401);
  const ghost = await call('/auth/login', { method: 'POST', body: { email: 'ghost@example.in', password: 'nope-nope' } });
  assert.equal(ghost.json().error, wrong.json().error);

  // a scan made while logged in shows up in that person's history only
  const scan = await call('/scans', { method: 'POST', cookie, body: { url: 'http://sbi-kyc-update.test/login' } });
  assert.ok([202, 200].includes(scan.res.status));
  const mine = (await call('/me/history', { cookie })).json().items;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].hostname, 'sbi-kyc-update.test');

  await call('/auth/signup', { method: 'POST', body: { email: 'other@example.in', password: 'password123' } });
  const login = await call('/auth/login', { method: 'POST', body: { email: 'other@example.in', password: 'password123' } });
  const otherCookie = login.res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/me/history', { cookie: otherCookie })).json().items.length, 0);
});

test('a PDF is produced for a finished scan, and refused while it is still running', async () => {
  await store.create({ id: 'pdfScan001', url: 'https://example.org/', hostname: 'example.org', lang: 'en' });
  assert.equal((await call('/scans/pdfScan001/pdf')).res.status, 409);
  await store.update('pdfScan001', {
    status: 'done', verdict: 'careful', score: 55, finishedAt: new Date(),
    trust: { score: 55, verdict: 'careful', confidence: 'high', checkedAt: new Date().toISOString(), finalUrl: 'https://example.org/', domain: { available: true, registeredAt: '2010-01-01T00:00:00Z', ageDays: 5000, name: 'example.org' }, certificate: null, findings: [{ id: 'x', status: 'warn', title: 'No contact page', detail: 'Genuine sites publish one.', points: -5 }] },
    health: { healthScore: 80, linksScore: 90, lighthouse: { performance: 80, accessibility: 90, bestPractices: 85, seo: 88 }, headers: { score: 50, items: [{ name: 'HSTS', present: true }] }, links: { checked: 5, broken: [{ url: 'https://example.org/x', status: 404 }] }, axe: { violationCount: 1 } },
  });
  const pdf = await call('/scans/pdfScan001/pdf');
  assert.equal(pdf.res.status, 200);
  assert.equal(pdf.res.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.bytes.length > 2000);
  assert.equal((await call('/scans/nope/pdf')).res.status, 404);
});

test('the AI status endpoint reports provider, state and queue', async () => {
  const status = (await call('/ai/status')).json();
  assert.ok(['online', 'offline', 'off'].includes(status.state));
  assert.equal(typeof status.provider, 'string');
  assert.equal(typeof status.working, 'boolean');
  assert.deepEqual(Object.keys(status.queue).sort(), ['pending', 'running']);
});

test('the AI status turns to working while a model call runs, lingers briefly, then goes back to ready', async () => {
  const { trackStart, trackEnd, resetActivity } = await import('../src/llm/activity.js');
  const { aiStatus, LINGER_MS, resetStatusCache } = await import('../src/llm/status.js');
  resetActivity();
  resetStatusCache();
  assert.equal((await aiStatus()).working, false);

  trackStart('review');
  let status = await aiStatus();
  assert.equal(status.working, true);
  assert.deepEqual(status.activeTasks, ['review']);
  assert.equal(status.useCases.length, 2);

  trackEnd(true, null, 'review');
  assert.equal((await aiStatus()).working, true); // lingers so short calls are visible

  const realNow = Date.now;
  Date.now = () => realNow() + LINGER_MS + 50;
  try {
    assert.equal((await aiStatus()).working, false);
  } finally {
    Date.now = realNow;
  }
});

test('scans that only run the rule checks do not make the AI light busy', async () => {
  const { resetActivity } = await import('../src/llm/activity.js');
  const { aiStatus } = await import('../src/llm/status.js');
  resetActivity();
  const status = await aiStatus({ pending: 3, running: 2 });
  assert.equal(status.working, false);
});
