// Build 5: open a SQLite database with node:sqlite (built into Node 22.13+).
//
// openDatabase(':memory:') gives a fresh, empty database that disappears when it
// is closed. Tests use that. The server passes a file path, so data survives a
// restart.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export const MEMORY = ':memory:';

export function openDatabase(path = MEMORY) {
  if (path !== MEMORY) mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  // SQLite does not check FOREIGN KEY constraints unless it is asked to.
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== MEMORY) {
    // Readers do not block the writer, and a second process waits up to 5 s
    // for a lock instead of failing at once.
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
  }
  db.exec(SCHEMA);
  // A database made before Build 9 has no password_hash column. CREATE TABLE IF
  // NOT EXISTS does not change an existing table, so add the column here.
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  if (!userColumns.includes('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  return db;
}
