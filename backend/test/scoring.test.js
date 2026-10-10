import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateTrust } from '../src/trust/scoring.js';

const goodTls = { reachable: true, authorized: true, hostnameMatches: true, daysLeft: 120, issuer: 'Test CA', subject: 'example.com' };
const goodPage = {
  hasSensitiveForm: false, sensitiveFields: [], insecureSensitive: false, formsToOtherDomains: [],
  metaRefresh: null, hiddenIframes: 0, hasContact: true, hasPrivacy: true, linkCount: 20,
};

function base(overrides = {}) {
  return {
    input: { hostname: 'example.com', hadCredentials: false, isIpHost: false },
    final: { url: 'https://example.com/', hostname: 'example.com', protocol: 'https:', redirectedToOtherDomain: false, fetchError: null },
    tls: goodTls,
    age: { available: true, ageDays: 2000, registeredAt: '2020-01-01T00:00:00Z' },
    gov: { isGov: false },
    lookalike: { isOfficial: false, brand: null, matches: [] },
    safeBrowsing: { status: 'clean' },
    feed: { status: 'clean' },
    page: goodPage,
    ...overrides,
  };
}

const ids = (result) => result.findings.map((f) => f.id);

test('an established site with HTTPS and clean reputation is Safe', () => {
  const result = evaluateTrust(base());
  assert.equal(result.verdict, 'safe');
  assert.ok(result.score >= 70);
  assert.equal(result.confidence, 'high');
});

test('a government domain with a valid certificate scores high even without domain age', () => {
  const result = evaluateTrust(
    base({ gov: { isGov: true }, age: { available: false, reason: 'not_found' }, safeBrowsing: { status: 'skipped' } }),
  );
  assert.equal(result.verdict, 'safe');
  assert.ok(ids(result).includes('gov_domain'));
  assert.notEqual(result.confidence, 'high');
});

test('a new bank lookalike without HTTPS and with a card form is Likely Fake', () => {
  const result = evaluateTrust(
    base({
      input: { hostname: 'sbi-login.xyz', hadCredentials: false, isIpHost: false },
      final: { url: 'http://sbi-login.xyz/', hostname: 'sbi-login.xyz', protocol: 'http:', redirectedToOtherDomain: false, fetchError: null },
      tls: { reachable: false, error: 'ECONNREFUSED' },
      age: { available: true, ageDays: 3, registeredAt: '2026-10-01T00:00:00Z' },
      lookalike: { isOfficial: false, brand: null, matches: [{ type: 'brand_name', brand: 'State Bank of India', official: 'onlinesbi.sbi', detail: 'The name uses "sbi"' }] },
      page: { ...goodPage, hasSensitiveForm: true, sensitiveFields: ['card number / CVV'], insecureSensitive: true },
    }),
  );
  assert.equal(result.verdict, 'likely_fake');
  assert.ok(result.score < 40);
  for (const id of ['lookalike', 'https_missing', 'domain_age', 'insecure_form', 'new_site_sensitive']) {
    assert.ok(ids(result).includes(id), `${id} expected`);
  }
});

test('a Google Safe Browsing match always means Likely Fake and a very low score', () => {
  const result = evaluateTrust(base({ safeBrowsing: { status: 'flagged', threats: ['SOCIAL_ENGINEERING'] } }));
  assert.equal(result.verdict, 'likely_fake');
  assert.ok(result.score <= 15);
  assert.equal(result.hardFlag, true);
});

test('an exact phishing feed URL match is Likely Fake, a host-only match is just a warning', () => {
  const exact = evaluateTrust(base({ feed: { status: 'flagged', matchType: 'url' } }));
  assert.equal(exact.verdict, 'likely_fake');
  const hostOnly = evaluateTrust(base({ feed: { status: 'flagged', matchType: 'host' } }));
  assert.equal(hostOnly.hardFlag, false);
  assert.ok(hostOnly.findings.find((f) => f.id === 'phishing_feed').status === 'warn');
});

test('a result with any bad finding can never be Safe', () => {
  const result = evaluateTrust(
    base({ gov: { isGov: true }, final: { url: 'https://example.com/', hostname: 'example.com', protocol: 'https:', redirectedToOtherDomain: false, fetchError: null }, input: { hostname: 'example.com', hadCredentials: true, isIpHost: false } }),
  );
  assert.ok(result.findings.some((f) => f.status === 'bad'));
  assert.notEqual(result.verdict, 'safe');
});

test('an expired certificate, a mismatch and an untrusted chain are bad', () => {
  const expired = evaluateTrust(base({ tls: { ...goodTls, daysLeft: -5 } }));
  assert.ok(ids(expired).includes('cert_expired'));
  const mismatch = evaluateTrust(base({ tls: { ...goodTls, hostnameMatches: false } }));
  assert.ok(ids(mismatch).includes('cert_mismatch'));
  const untrusted = evaluateTrust(base({ tls: { ...goodTls, authorized: false, authorizationError: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }));
  assert.ok(ids(untrusted).includes('cert_untrusted'));
});

test('a very young domain lowers the score', () => {
  const young = evaluateTrust(base({ age: { available: true, ageDays: 5, registeredAt: '2026-10-01T00:00:00Z' } }));
  const old = evaluateTrust(base());
  assert.ok(young.score < old.score);
  assert.ok(young.findings.find((f) => f.id === 'domain_age').status === 'bad');
});

test('unknown and skipped checks lower the confidence, not the score', () => {
  const result = evaluateTrust(
    base({ age: { available: false, reason: 'timeout' }, safeBrowsing: { status: 'skipped' }, feed: { status: 'error' } }),
  );
  assert.equal(result.confidence, 'low');
});

test('an unreachable page is reported as unknown', () => {
  const result = evaluateTrust(base({ page: null, final: { url: 'https://example.com/', hostname: 'example.com', protocol: 'https:', redirectedToOtherDomain: false, fetchError: 'The site took too long to respond.' } }));
  assert.equal(result.findings.find((f) => f.id === 'page_unreachable').status, 'unknown');
});

test('the same input always gives the same result', () => {
  assert.deepEqual(evaluateTrust(base()), evaluateTrust(base()));
});
