import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InvalidUrlError, UnsafeTargetError, isPublicIp, parseTargetUrl, resolvePublicHost } from '../src/security/ssrf.js';

test('public IPs are allowed, private and special ranges are blocked', () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
  for (const ip of [
    '127.0.0.1',
    '10.0.0.5',
    '172.16.4.1',
    '192.168.1.10',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.1.2.3',
  ]) {
    assert.equal(isPublicIp(ip), false, `${ip} should be blocked`);
  }
  assert.equal(isPublicIp('not-an-ip'), false);
});

test('parseTargetUrl adds https and cleans the address', () => {
  const parsed = parseTargetUrl('  Example.GOV.in/path?x=1#frag ');
  assert.equal(parsed.url, 'https://example.gov.in/path?x=1');
  assert.equal(parsed.hostname, 'example.gov.in');
  assert.equal(parsed.hadCredentials, false);
});

test('parseTargetUrl strips and reports user@ tricks', () => {
  const parsed = parseTargetUrl('https://www.sbi.co.in@evil.example.com/login');
  assert.equal(parsed.hostname, 'evil.example.com');
  assert.equal(parsed.hadCredentials, true);
  assert.ok(!parsed.url.includes('sbi.co.in'));
});

test('parseTargetUrl rejects bad input', () => {
  assert.throws(() => parseTargetUrl(''), InvalidUrlError);
  assert.throws(() => parseTargetUrl('ftp://example.com'), InvalidUrlError);
  assert.throws(() => parseTargetUrl('javascript:alert(1)'), InvalidUrlError);
  assert.throws(() => parseTargetUrl('localhost'), InvalidUrlError);
  assert.throws(() => parseTargetUrl('https://example.com:8080'), UnsafeTargetError);
  assert.throws(() => parseTargetUrl('two words.com'), InvalidUrlError);
});

test('resolvePublicHost blocks internal targets', async () => {
  await assert.rejects(resolvePublicHost('localhost'), UnsafeTargetError);
  await assert.rejects(resolvePublicHost('127.0.0.1'), UnsafeTargetError);
  await assert.rejects(resolvePublicHost('169.254.169.254'), UnsafeTargetError);
  await assert.rejects(resolvePublicHost('[::1]'), UnsafeTargetError);
  await assert.rejects(resolvePublicHost('service.internal'), UnsafeTargetError);
});

test('a name that does not exist can still be judged, but private targets never can', async () => {
  const { assertSafeUrl } = await import('../src/security/ssrf.js');
  await assert.rejects(() => assertSafeUrl('https://sbi-kyc-update.invalid'), { name: 'UnresolvedHostError' });
  const result = await assertSafeUrl('https://sbi-kyc-update.invalid', { allowUnresolved: true });
  assert.equal(result.unresolved, true);
  await assert.rejects(() => assertSafeUrl('http://app.localhost', { allowUnresolved: true }), { name: 'UnsafeTargetError' });
});
