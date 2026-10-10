import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { config } from '../src/config.js';
import { getRegistrableDomain, lookupDomainAge, resetDomainAgeCache } from '../src/trust/domainAge.js';

// A tiny fake registry: serves the IANA-style list and RDAP answers for a few test names.
let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/rdap+json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/dns.json') {
      return send(200, { services: [[['test'], [`${base}/registry/`]]] });
    }
    if (url.pathname === '/registry/domain/old-bank.test') {
      return send(200, { events: [{ eventAction: 'registration', eventDate: '2002-10-30T19:05:33.000Z' }, { eventAction: 'expiration', eventDate: '2030-01-01T00:00:00Z' }] });
    }
    if (url.pathname === '/registry/domain/new-scam.test') {
      return send(200, { events: [{ eventAction: 'Registration', eventDate: new Date(Date.now() - 3 * 86_400_000).toISOString() }] });
    }
    if (url.pathname === '/registry/domain/hidden.test') return send(200, { events: [{ eventAction: 'last changed', eventDate: '2024-01-01T00:00:00Z' }] });
    if (url.pathname === '/registry/domain/limited.test') return send(429, {});
    return send(404, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  config.rdapBootstrapUrl = `${base}/dns.json`;
  config.rdapBase = ''; // no fallback relay in these tests
  resetDomainAgeCache();
});

after(() => server.close());

test('registrable domain ignores subdomains and IPs', () => {
  assert.equal(getRegistrableDomain('login.sbi-online.co.in'), 'sbi-online.co.in');
  assert.equal(getRegistrableDomain('www.incometax.gov.in'), 'incometax.gov.in');
  assert.equal(getRegistrableDomain('127.0.0.1'), null);
});

test('reads the registration date from the registry found through the IANA list', async () => {
  const age = await lookupDomainAge('www.old-bank.test');
  assert.equal(age.available, true);
  assert.equal(age.registeredAt.slice(0, 10), '2002-10-30');
  assert.ok(age.ageDays > 8000);
});

test('treats a days-old domain as new (event name is case-insensitive)', async () => {
  const age = await lookupDomainAge('new-scam.test');
  assert.equal(age.available, true);
  assert.ok(age.ageDays <= 4);
});

test('reports why a date is missing', async () => {
  assert.equal((await lookupDomainAge('hidden.test')).reason, 'no_registration_date');
  assert.equal((await lookupDomainAge('limited.test')).reason, 'rate_limited');
  assert.equal((await lookupDomainAge('nothing-here.test')).reason, 'not_found');
});
