// Optional accounts: e-mail + password, kept in an HttpOnly cookie. No extra libraries:
// passwords use scrypt, the session token is an HMAC-signed value with an expiry.
import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE = 'jaanch_session';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

let secret = config.sessionSecret;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET is not set: logins will reset whenever the server restarts. Set a long random value.');
}

export function validateSignup({ email, password, name }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) return { error: 'Please enter a valid e-mail address' };
  if (typeof password !== 'string' || password.length < 8) return { error: 'Use a password of at least 8 characters' };
  if (password.length > 128) return { error: 'The password is too long (up to 128 characters)' };
  const cleanName = String(name || '').replace(/[<>]/g, '').trim().slice(0, 60);
  return { email: cleanEmail, password, name: cleanName };
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [kind, saltHex, hashHex] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export function makeToken(userId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + config.sessionDays * 86_400_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token, now = Date.now()) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const good = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.e > now && typeof data.u === 'string' ? data.u : null;
  } catch {
    return null;
  }
}

function cookieValue(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(res, userId) {
  const maxAge = config.sessionDays * 86_400;
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(makeToken(userId))}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${config.cookieSecure ? '; Secure' : ''}`);
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${config.cookieSecure ? '; Secure' : ''}`);
}

/** Sets req.user when a valid session cookie is present. Login is never required. */
export function sessionMiddleware(store) {
  return async (req, res, next) => {
    req.user = null;
    const userId = readToken(cookieValue(req, COOKIE));
    if (userId) {
      try {
        const user = await store.findUserById(userId);
        if (user) req.user = { id: user.id, email: user.email, name: user.name };
      } catch (err) {
        return next(err);
      }
    }
    return next();
  };
}

export const publicUser = (user) => (user ? { id: user.id, email: user.email, name: user.name || '' } : null);
