// Build 3/5/7: configuration read from the environment, with sensible defaults.
//
// TOKEN_SECRET is the HMAC key for the signed tokens. It is NEVER written in
// the code: it comes from the environment, and if it is missing (a fresh clone,
// a test run) a random one is made for THIS process, so tokens stop working
// after a restart instead of being forgeable with a secret that is in git.

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 3000;
const DEFAULT_DB_PATH = fileURLToPath(new URL('../data/ticketing.db', import.meta.url));

export function loadConfig(env = process.env) {
  const raw = env.PORT;
  const port = raw === undefined || raw === '' ? DEFAULT_PORT : Number(raw);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${raw}"`);
  }

  const dbPath = env.DB_PATH && env.DB_PATH.trim() !== '' ? env.DB_PATH : DEFAULT_DB_PATH;

  const tokenSecret = env.TOKEN_SECRET && env.TOKEN_SECRET.trim() !== ''
    ? env.TOKEN_SECRET
    : randomBytes(32).toString('hex');

  return {
    port,
    dbPath,
    tokenSecret,
    publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  };
}
