# Build 5: SQLite storage and the overselling fix

> Branch: `build-5` -> `main`. Ready to paste into a PR. Follows
> `.github/pull_request_template.md`.

## Summary

Moves storage from memory to SQLite (`node:sqlite`, still no outside packages)
and settles the first hard problem: fifty people pressing Buy for the last seat
must produce exactly one booking. The fix lives in the database, not in
JavaScript, and data now survives a restart.

## What is in this PR

- `src/db/schema.sql`: tables for users, events, ticket_tiers and bookings with
  `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE` and `CHECK` constraints, including
  `CHECK (sold >= 0 AND sold <= capacity)`.
- `src/db/connection.js`: opens the database, turns foreign keys on
  (`PRAGMA foreign_keys = ON` - they are off by default in SQLite) and applies
  the schema.
- `src/repositories/sqlite.js`: the same async interface as `memory.js`, so the
  services do not change when the storage does. Every query uses `?`
  placeholders. `reserveSeats`/`releaseSeats` move seats in ONE statement:
  `UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity`.
- `src/services/bookingService.js`: `book()` reserves the seat first and uses
  the changed-row count to decide who won (throwing `SOLD_OUT` when no row
  changed); `cancel()` releases the same way. No lock variable, no double check.
- `src/repositories/memory.js`: matching `reserveSeats`/`releaseSeats` so the
  in-memory and SQLite repositories stay interchangeable.
- `src/config.js` + `src/server.js`: a `DB_PATH` setting, and the server now
  defaults to the SQLite repository.
- `scripts/seed.js` (`npm run seed`) and `scripts/oversell-demo.js`
  (`npm run oversell`).
- Tests: `test/oversell.test.js` (50 for 1 -> exactly 1 success, 49 `SOLD_OUT`,
  plus a test that the old check-then-write really oversells),
  `test/persistence.test.js` (close and reopen the file), and the API tests now
  run against in-memory SQLite.

## User stories

- **S08 (last ticket to one person):**
  - **Given** exactly 1 seat left **When** 50 attendees book at the same moment
    **Then** exactly 1 succeeds, 49 get `SOLD_OUT`, and seats sold never exceeds
    capacity.
  - **Given** the database fix is removed **Then** the overselling test fails.
    (The second test in the file runs the old racy booking and asserts it
    oversells, which is what makes the first test meaningful.)

## How to run and test

```bash
npm test            # includes the oversell and persistence tests
npm run oversell    # before/after demo, in a throwaway in-memory database
npm run seed        # writes sample data to data/ticketing.db
npm start           # serves from the same file; restart and the data is there
```

Expected `npm run oversell` tail:

```text
BEFORE (check in JS, then write):
  50 booking(s) created, 0 SOLD_OUT, 0 other error(s)
  seats sold = 1 of 1, bookings in database = 50

AFTER (one atomic UPDATE reserves the seat):
  1 booking(s) created, 49 SOLD_OUT, 0 other error(s)
  seats sold = 1 of 1, bookings in database = 1
```

## Rules I had to respect

- [x] Money is whole cents (`INTEGER` columns, never a decimal).
- [x] Errors use the one shape `{"error":{"code","message"}}`.
- [x] No stack trace ever reaches the client.
- [x] Business rules live in `src/services/` and `src/domain/`, not in routes.
- [x] The services do not import the repository; it is passed in.
- [x] SQL is never built by joining strings; only `?` placeholders are used.

## AI log

- `docs/ai-log.md` -> Build 5

## Checklist

- [x] `npm test` is green.
- [x] Tests added for the new behaviour.
- [x] Docs updated (`docs/architecture.md`, `docs/ai-log.md`).
- [x] Not merged: this PR is for review.

## Notes for the reviewer

- `node:sqlite` is built into Node; the project's minimum Node 22.13 is exactly
  the version where it stopped needing `--experimental-sqlite`. It still prints
  an "experimental feature" warning, which is harmless.
- If a booking fails after the seat is reserved (for example an unexpected
  error while writing the booking row), the seat is not automatically released.
  That is a known, small gap; the real expiry/refund work is Builds 8-9.
- The demo's "before" numbers come from a copy of the Build 4 check-then-write
  booking so the oversell is reproducible on demand.
