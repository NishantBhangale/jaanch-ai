import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkGovDomain } from '../src/trust/govDomain.js';
import { detectLookalike, levenshtein } from '../src/trust/lookalike.js';

test('levenshtein distance', () => {
  assert.equal(levenshtein('onlinesbi', 'onlinesbi'), 0);
  assert.equal(levenshtein('onlinesbi', 'onlinesb1'), 1);
  assert.equal(levenshtein('abc', ''), 3);
});

test('official domains are recognised, including subdomains', () => {
  for (const host of ['onlinesbi.sbi', 'retail.onlinesbi.sbi', 'www.hdfcbank.com', 'incometax.gov.in', 'amazon.in']) {
    const result = detectLookalike(host);
    assert.equal(result.isOfficial, true, host);
    assert.equal(result.matches.length, 0, host);
  }
});

test('brand names on unofficial domains are flagged', () => {
  for (const host of ['sbi-online-login.xyz', 'hdfcbank-netbanking.in', 'hdfcbank.xyz', 'paytm-kyc-update.com', 'aadhaar-update.co']) {
    const result = detectLookalike(host);
    assert.equal(result.isOfficial, false, host);
    assert.ok(result.matches.some((m) => m.type === 'brand_name'), `${host} should match a brand`);
  }
});

test('typos and digit swaps are flagged', () => {
  assert.ok(detectLookalike('onlinesb1.sbi').matches.length > 0, 'onlinesb1.sbi');
  assert.ok(detectLookalike('icicibnak.com').matches.some((m) => m.brand === 'ICICI Bank'), 'icicibnak.com');
  assert.ok(detectLookalike('amaz0n.in').matches.some((m) => m.brand === 'Amazon India'), 'amaz0n.in');
});

test('ordinary unrelated domains are not flagged', () => {
  for (const host of ['example.com', 'wikipedia.org', 'mybakery.in', 'github.com']) {
    const impersonation = detectLookalike(host).matches.filter((m) => m.type !== 'idn');
    assert.equal(impersonation.length, 0, host);
  }
});

test('IP addresses are ignored by the lookalike check', () => {
  assert.deepEqual(detectLookalike('203.0.113.7').matches, []);
});

test('internationalised domains are reported', () => {
  const result = detectLookalike('xn--80ak6aa92e.com');
  assert.ok(result.matches.some((m) => m.type === 'idn'));
});

test('government domains', () => {
  assert.equal(checkGovDomain('incometax.gov.in').isGov, true);
  assert.equal(checkGovDomain('nic.in').isGov, true);
  assert.equal(checkGovDomain('maharashtra.gov.in').isGov, true);
  assert.equal(checkGovDomain('gov.in.evil.com').isGov, false);
  assert.equal(checkGovDomain('notgov.in').isGov, false);
});

test('a brand placed in the sub-domain of another website is flagged', () => {
  for (const host of ['sbi.login.com', 'hdfcbank.secure-verify.in', 'onlinesbi.account-check.net']) {
    const result = detectLookalike(host);
    assert.equal(result.isOfficial, false, host);
    assert.ok(result.matches.some((m) => m.type === 'brand_name'), `${host} should match a brand`);
  }
  // Official sub-domains and unrelated sites are untouched.
  assert.equal(detectLookalike('retail.onlinesbi.sbi').isOfficial, true);
  assert.equal(detectLookalike('docs.example.org').matches.length, 0);
});
