import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, makeToken, readToken, validateSignup, verifyPassword } from '../src/auth/auth.js';

test('passwords are hashed and verified', () => {
  const stored = hashPassword('correct horse');
  assert.ok(stored.startsWith('scrypt$'));
  assert.ok(!stored.includes('correct horse'));
  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong horse', stored), false);
  assert.equal(verifyPassword('x', 'garbage'), false);
});

test('session tokens verify, expire and cannot be tampered with', () => {
  const token = makeToken('user123', 1_000_000);
  assert.equal(readToken(token, 1_000_001), 'user123');
  assert.equal(readToken(token, 1_000_000 + 31 * 86_400_000), null);
  const [payload, sig] = token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ u: 'admin', e: 9e15 })).toString('base64url')}.${sig}`;
  assert.equal(readToken(forged, 1_000_001), null);
  assert.equal(readToken(`${payload}.bad`, 1_000_001), null);
  assert.equal(readToken('', 1), null);
});

test('signup input is checked', () => {
  assert.ok(validateSignup({ email: 'nope', password: 'longenough' }).error);
  assert.ok(validateSignup({ email: 'a@b.in', password: 'short' }).error);
  const ok = validateSignup({ email: ' A@B.in ', password: 'longenough', name: '<b>Asha</b>' });
  assert.equal(ok.email, 'a@b.in');
  assert.equal(ok.name, 'bAsha/b');
});
