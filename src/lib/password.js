// Build 7: password hashing with scrypt from node:crypto.
//
// A password is never stored, logged or returned - only this string is:
//
//     scrypt$<salt-hex>$<derived-key-hex>
//
// * every password gets its OWN random salt, so two people with the same
//   password get different hashes and a rainbow table is useless;
// * scrypt is deliberately slow and memory-hard, which makes guessing expensive;
// * verification uses timingSafeEqual, so the time a check takes does not reveal
//   how many leading bytes of the hash matched.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password === '') {
    throw new Error('hashPassword requires a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PREFIX}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[1], 'hex');
    expected = Buffer.from(parts[2], 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
