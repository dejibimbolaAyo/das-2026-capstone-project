// Build 5: one place that opens the SQLite database and applies the schema.
//
// node:sqlite ships with Node, so there is still no outside package. The
// synchronous API is intentional: a single SQL statement is atomic on its own,
// which is exactly what the overselling fix leans on.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
const SCHEMA = readFileSync(SCHEMA_PATH, 'utf8');

// `path` is a file, or ':memory:' for a throwaway database (tests, the demo).
export function openDatabase(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);

  // Foreign keys are OFF by default in SQLite, so turn them on for every
  // connection or the REFERENCES clauses mean nothing.
  db.exec('PRAGMA foreign_keys = ON;');

  // The schema uses CREATE TABLE IF NOT EXISTS, so this is safe to re-run.
  db.exec(SCHEMA);

  return db;
}
