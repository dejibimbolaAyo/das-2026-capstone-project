// Build 7: signed tokens, written by hand on top of node:crypto.
//
// The token has the same three-part shape as a JWT - header.payload.signature -
// but it is NOT a JWT library, so the rules are explicit here:
//
//   * the header MUST say {"alg":"HS256"} - anything else ("none", "RS256")
//     is refused, which is what stops the classic "alg: none" forgery;
//   * the signature is an HMAC-SHA256 over "<header>.<payload>" in base64url;
//   * the signature is compared with timingSafeEqual, so an attacker cannot
//     learn the secret one byte at a time by measuring how long a compare takes;
//   * a token without a valid `exp` in the future is refused;
//   * the secret is passed in by the caller, never hard-coded here. The server
//     reads it from the TOKEN_SECRET environment variable (src/config.js).

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'HS256';
const DEFAULT_LIFETIME_SECONDS = 60 * 60 * 12; // 12 hours

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function decodeJson(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function nowInSeconds(now) {
  return typeof now === 'function' ? now() : Math.floor(Date.now() / 1000);
}

function signatureFor(secret, signingInput) {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

// `claims` is what the token is about (sub = user id, email, role). iat and exp
// are added here so no caller has to remember them.
export function signToken(claims, { secret, lifetimeSeconds = DEFAULT_LIFETIME_SECONDS, now } = {}) {
  if (!secret) throw new Error('signToken requires a secret');

  const issuedAt = nowInSeconds(now);
  const header = base64url(JSON.stringify({ alg: ALGORITHM, typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    ...claims,
    iat: issuedAt,
    exp: issuedAt + lifetimeSeconds,
  }));

  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${signatureFor(secret, signingInput)}`;
}

// Returns the claims, or null for anything wrong: a bad shape, a header that is
// not HS256, a signature that does not match, or an expired token. The caller
// turns null into UNAUTHENTICATED; it never learns which check failed.
export function verifyToken(token, { secret, now } = {}) {
  if (!token || typeof token !== 'string' || !secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = decodeJson(encodedHeader);
  if (!header || header.alg !== ALGORITHM) return null;

  const expected = Buffer.from(signatureFor(secret, `${encodedHeader}.${encodedPayload}`));
  const given = Buffer.from(encodedSignature);
  // timingSafeEqual throws on different lengths, so compare lengths first.
  if (expected.length !== given.length) return null;
  if (!timingSafeEqual(expected, given)) return null;

  const payload = decodeJson(encodedPayload);
  if (!payload) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowInSeconds(now)) return null;

  return payload;
}
