// Build 9: password hashing with scrypt from node:crypto.
//
// Never store a password. Store a hash: a one-way scramble that is slow on
// purpose, so guessing millions of passwords takes too long. Every password gets
// its own random salt, so two people with the same password get different hashes.
//
// The stored text looks like  scrypt:<salt>:<hash>  (both in base64).

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltText, keyText] = String(stored ?? '').split(':');
  if (scheme !== 'scrypt' || !saltText || !keyText) return false;

  const expected = Buffer.from(keyText, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltText, 'base64'), expected.length);
  // A normal === stops at the first different byte, and the time it takes can
  // leak information. timingSafeEqual always compares every byte.
  return timingSafeEqual(actual, expected);
}
