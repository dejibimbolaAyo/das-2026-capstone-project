// Build 9: signed tokens (HS256, the same format as a JWT) with node:crypto.
//
// A token is three base64url parts joined by dots:  header.payload.signature
// The server signs the first two parts with a secret only it knows. Anyone can
// READ a token, but nobody can change it without breaking the signature.
// So a token proves who the user is and what role they have, with no database
// lookup on every request.

import { createHmac, timingSafeEqual } from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (data, secret) => createHmac('sha256', secret).update(data).digest();

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new TypeError('The signing secret must be a string of at least 16 characters');
  }
}

// claims: for example { sub: userId, role: 'attendee' }
export function signToken(claims, secret, { expiresInSeconds = 8 * 60 * 60, now = Date.now } = {}) {
  requireSecret(secret);
  const issuedAt = Math.floor(now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ ...claims, iat: issuedAt, exp: issuedAt + expiresInSeconds });
  const signature = sign(`${header}.${payload}`, secret).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

// Returns the claims, or null for anything wrong: not a token, edited, signed
// with another secret, the wrong algorithm, or expired.
export function verifyToken(token, secret, { now = Date.now } = {}) {
  requireSecret(secret);
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  try {
    // Only HS256 is accepted. A token that says alg is "none" is refused.
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null;

    const expected = sign(`${header}.${payload}`, secret);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof claims.exp !== 'number' || claims.exp <= now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}
