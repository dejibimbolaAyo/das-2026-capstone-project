# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** Add `mergeSort` (stable, non-mutating, no `Array.prototype.sort`), `publishEvent`/`listEventSummaries` in inventory.js, a pure `eventSearch.js` with `filterEvents`, `sortEvents` and `searchEvents`, tests with `node:test` for S02, S03, S04-publish, S05 and S06, and an `npm test` script.
- **What came back:** `src/domain/sorting.js`, additions to `src/domain/inventory.js`, `src/domain/eventSearch.js`, `test/build2.test.js`, and a `"test": "node --test"` script. All 14 tests pass and the demo runs.
- **What was wrong (or "nothing"):** Two small things. (1) The first `getHeaders`/price code ignored the "events with no tiers are left out of price filters" rule until I made `maxPriceCents` require a non-null cheapest price. (2) The S04 test used a top-level `await import(...)` inside a non-async test, which threw a syntax error; I import `unpublishEvent` at the top instead.

### Prompt 2: "Make it readable and add a demo"
- **What I asked:** Clean up the merge sort (drop an unused `aux` array), rewrite the search module in the project's comment style, and add `scripts/demo-search.js` wired to `npm run demo:search`.
- **What came back:** A recursive `mergeSort` with a small `merge` helper, a commented `eventSearch.js`, and a demo that seeds three events and prints each filter/sort.
- **What was wrong (or "nothing"):** Nothing broken, but the first demo used `capacity: 0`, which `addTier` rejects (capacity must be at least 1); I seed 1 seat and book it to show a sold-out event instead.

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** `docs/architecture.md` with three Mermaid diagrams; `src/domain/bookingStateMachine.js` (states pending/paid/cancelled/refunded/checked_in, `canTransition`, `assertTransition`, code `INVALID_TRANSITION`); a tiny router in `src/http/router.js` and an app in `src/http/app.js` on `node:http` only (`GET /health`, JSON 404 for unknown `/api`, JSON 400 for bad JSON, one error shape, static files from `public/` that cannot escape it); `src/server.js` and `src/config.js` with `PORT`; and tests for every booking move, the router and a real `GET /health`.
- **What came back:** The three diagrams; the state machine as data; the router, app, routes, config and server; a `public/` landing page that pings `/health`; a `"start"` script; and 25 more tests. 39 tests pass in total and `PORT=3100 npm start` answers `/health`.
- **What was wrong (or "nothing"):** Three things. (1) The static-file guard returned **403 for every file** on Windows: `path.normalize` keeps a trailing separator, so `root + sep` became a double separator and nothing matched. I switched to `path.resolve`, which strips the trailing separator, and strip leading slashes from the request path. (2) A route handler that returns `undefined` was serialised as `null`; I check `res.writableEnded` first so a handler may write its own response or return a value, never both. (3) My escape test used `%2e%2e`, but the WHATWG URL parser turns that into `..` before the guard runs (so it 404'd, which is safe). I test with a smuggled `%2f` instead and added a second test that a plain `..` never serves the file.

## Build 4

### Prompt 1: Build 4 prompt (docs/build-4.md)

- **What I asked:** A working in-memory REST API over the Build 3 domain: `src/repositories/memory.js` (async methods for events, tiers and bookings, no rules); `src/services/eventService.js` and `src/services/bookingService.js` holding all business rules and receiving the repository as an argument; `src/lib/mockPaymentGateway.js` that never sees a card number; routes for create event, add tier, publish, search, book, pay and cancel an unpaid booking (identity via an `x-user-id` header until Build 7); `docs/api-examples.md` with a curl example for every call; and API-level tests that start the real server.
- **What came back:** The repository, the two services (reusing `bookingStateMachine`, `eventSearch`, `sorting` and the shared validators), the mock gateway, the `/api` routes, an updated `server.js` that composes the pieces (and still returns an unlistened server for tests), `docs/api-examples.md`, and `test/api.test.js`. 53 tests pass and every curl example in the doc works against a live `npm start`.
- **What was wrong (or "nothing"):** Three real fixes. (1) The shared validation helpers lived inside `inventory.js` and `eventSearch.js` as private copies; I pulled them into `src/domain/validation.js` and had both modules import them, so the services reuse the rules instead of copying them. (2) `res.statusCode` was ignored on success, so creates could not return `201`; the app now sends whatever a handler set (defaulting to `200`). (3) `PAYMENT_DECLINED` had no status, so a declined card fell through to `400`; it now maps to `402`. I also confirmed the state machine stops a second charge (`paid -> paid` is illegal) and that a decline leaves the booking `pending` so paying again works.

### Prompt 2: "Verify it against the docs and lint the rules"

- **What I asked:** Run the whole suite, then drive the server with the exact `docs/api-examples.md` curl calls and check the two hard-problem guard rails: money as whole cents and no overselling.
- **What came back:** All 53 tests green, and a live run where create -> tier -> publish -> search -> book -> declined pay -> successful pay -> cancel behaved exactly as documented.
- **What was wrong (or "nothing"):** Nothing in the code. The first curl script failed because PowerShell mangles `\"` inside a double-quoted string (the body arrived as invalid JSON); passing the body from a file fixed the harness, not the API. Worth remembering for the demo.

## Build 5

### Prompt 1: Build 5 prompt, part 1 (docs/build-5.md)

- **What I asked:** Move storage to SQLite using `node:sqlite` (still no outside packages): `src/db/schema.sql` and `src/db/connection.js` with tables for users, events, ticket_tiers and bookings and PRIMARY KEY / FOREIGN KEY / UNIQUE / CHECK constraints, including `CHECK (sold >= 0 AND sold <= capacity)`; a `src/repositories/sqlite.js` with the same methods as `memory.js` (placeholders only, never string-built SQL); `scripts/seed.js` plus a `seed` script; and `scripts/oversell-demo.js` plus an `oversell` script that fires 50 simultaneous bookings at the last seat. Do not fix overselling yet.
- **What came back:** The schema, the connection, the SQLite repository, the seed script, the demo, and SQLite wired in as the server's default repository. The API tests now run against an in-memory SQLite database and still pass unchanged, which shows the services really did not learn where the data lives.
- **What was wrong (or "nothing"):** Two things. (1) The first demo printed "seats sold = 0" for the broken case, because I had made `saveTier` skip the `sold` column; that hid the bug behind a wrong-looking zero. I made `saveTier` write the whole row (matching `memory.js`) and had the naive path create real booking rows, so "before" now honestly shows 50 bookings for 1 seat. (2) Foreign keys are OFF in SQLite by default, so `REFERENCES` did nothing until I ran `PRAGMA foreign_keys = ON` on every connection.

### Prompt 2: Build 5 prompt, part 2 - fix it in the database

- **What I asked:** Fix the overselling in the database, not in JavaScript: reserve with one atomic `UPDATE ... WHERE sold + ? <= capacity`, use the changed-row count to decide who won, throw `SOLD_OUT` when no row changed; no lock variable and no double check; add `test/oversell.test.js` (50 for 1 -> 1 success, 49 `SOLD_OUT`) that fails if the fix is removed; and show the demo before and after.
- **What came back:** `reserveSeats`/`releaseSeats` on both repositories, `bookingService.book` reserving before it builds the booking, `bookingService.cancel` releasing the same way, and the oversell demo printing "before" (50 bookings, 49 accepted) and "after" (1 booking, 49 `SOLD_OUT`).
- **What was wrong (or "nothing"):** Nothing broken, but two things worth stating. A lock variable or a double check both fail because the gap between "read the count" and "write the count" is exactly where the other fifty callers run; only a single statement with the condition inside it closes that gap. And the test file now has a second test that runs the OLD check-then-write booking and asserts it oversells - that is what makes the first test meaningful, because if the fix is removed the first test fails for the same reason the second one passes.

## Build 6

### Prompt 1: Build 6 prompt (docs/build-6.md)

- **What I asked:** Build the website in plain HTML, CSS and browser ES modules (no framework, no build step): `public/index.html` (browse with search, city filter, max price and a sort menu) and `public/event.html` (one event, its tiers, a quantity picker, checkout); `public/js/ui.js` with an `el(tag, props, children)` helper that uses `textContent` and never `innerHTML`; `public/js/mockData.js` and `public/js/api.js` where `api.js` exports `listEvents`, `getEvent`, `createBooking` and `pay` and resolves to the same shapes as the real API; `public/js/pages/home.js` and `event.js`; and `public/css/styles.css`. Rules: format money in one function (250000 -> ₦2,500), a quantity cannot exceed 10 or the seats left, a sold-out tier is marked and disabled, checkout shows a countdown, a declined card lets the user retry, every control has a label, and the pages never call `fetch`.
- **What came back:** The two pages, the helper, the mock data, the API module, the two page scripts and the stylesheet; the old Build 3 `public/app.js` and `public/styles.css` were removed (the stylesheet moved to `public/css/styles.css`), and `test/frontend.test.js` exercises the money formatter, the quantity clamp and the mock API through `node:test`.
- **What was wrong (or "nothing"):** Three things. (1) The build prompt names `public/css/styles.css`, but a Build 3 test fetched `/styles.css`; moving the file silently broke that test until I updated the path, which is a good reminder that a "static file" test is really testing a specific file. (2) I first had `getEvent` return a bare event, like the current API, but the event page needs the tiers to render at all, so the mock returns the event WITH a `tiers` array (a route the real API does not have yet, noted in the architecture doc). (3) The pages are the one part `node --test` cannot run (they need a DOM), so I moved every rule that matters - money, the quantity clamp and the mock API - out of the page files into `ui.js`/`api.js` and tested those instead; the page files are left with DOM wiring only.

### Prompt 2: "Check the rules and the screens"

- **What I asked:** Confirm the two hard rules on the screen (a sold-out tier is marked and disabled; a declined card shows an error and can be retried), that the countdown is shown, and that nothing escapes the rules in the prompt.
- **What came back:** `test/frontend.test.js` (18 tests) proving a sold-out tier rejects with `SOLD_OUT`, a quantity above 10 rejects with `VALIDATION`, a declined card rejects with `PAYMENT_DECLINED` while the booking stays `pending`, and that same booking can then be paid; a live smoke test where the server served `/`, `/event.html`, the CSS and every module with the right content type and a `%2f` traversal was still refused with `403`.
- **What was wrong (or "nothing"):** Nothing. One design note worth recording: the mock API keeps a copy of the filter/sort rules from `src/domain/eventSearch.js`, because the browser can only load modules from `public/`. That is a real duplication, not an oversight; the architecture doc says to change both if the rules change. Build 7 removes it by replacing the mock bodies with `fetch`.

## Build 7

### Prompt 1: Build 7 prompt (docs/build-7.md)

- **What I asked:** `src/lib/password.js` (scrypt, random salt per password, constant-time compare); `src/lib/token.js` (HS256 signed tokens that expire, refusing any `alg` that is not HS256, secret from an environment variable); `src/services/authService.js` and `src/routes/auth.js` for `POST /api/auth/signup`, `POST /api/auth/login` and `GET /api/auth/me` (wrong password and unknown email give the same `INVALID_CREDENTIALS`; a repeated email gives `EMAIL_TAKEN`); `src/http/guards.js` with `requireUser` and `requireRole`, replacing the `x-user-id` header everywhere with a bearer token, plus ownership checks (an attendee sees only their own bookings; an organizer changes only their own events); the frontend moved from mock data to `fetch` with `Authorization: Bearer <token>`, with new `session.js`, `login.html`, `tickets.html` and `organizer.html` and loading/error states; tests for signup, login, bad token, expired token, wrong role and one attendee reading another's booking. Rules: never store, log or return a password, and check the role on the server, never only in the page.
- **What came back:** All of the above. Tokens are hand-built HS256 (`header.payload.signature`, base64url, `timingSafeEqual`, `exp` required, 12-hour lifetime). Passwords are stored as `scrypt$<salt>$<key>`. The guards are the only code that reads the `Authorization` header, and every mutating service method now takes the caller's id, so ownership is enforced below the routes too. `mockData.js` and its copy of the search rules were deleted; `public/js/api.js` is now a `fetch` wrapper and `session.js` is the only module that touches `localStorage`. `test/frontend.test.js` was rewritten to stub `globalThis.fetch` and check the bearer header, the query string and the error mapping. The suite went from 74 to 82 tests, all green.
- **What was wrong (or "nothing"):** Three things I had to decide, and one I had to fix. (1) **The prompt names `src/routes/auth.js`, but `docs/architecture.md` puts every HTTP concern under `src/http`.** I kept the architecture and put the file in `src/http/routes/auth.js`, and left a comment saying so - this is a genuine conflict in the prompt. (2) **The prompt says another person's booking should give `NOT_FOUND`, but the S13 acceptance criteria in the same build say `FORBIDDEN`.** I followed the acceptance criteria and returned `403 FORBIDDEN`; masking it as `404` would have been defensible, but the criteria are what the tests are marked against. (3) "The secret comes from an environment variable" does not say what to do when it is missing; I kept the process working by generating a random secret per process and printing a warning, so a token is never signed with a secret that ends up in git. (4) The real fix: my first cut had `GET /api/events/:id` return a bare event while the event page needs its `tiers`, and it leaked a draft to anyone who guessed an id; I added `getEventWithTiers`, which includes the tiers and returns `NOT_FOUND` for a draft unless the caller owns it.

### Prompt 2: "Connect the screens and prove it end to end"

- **What I asked:** Wire the existing Build 6 pages to the real API (account nav on `index.html` and `event.html`, a "log in to book" link instead of a Book button when signed out, handling `UNAUTHENTICATED` on booking and paying), add the CSS the new pages need, delete the mock data, and prove the whole flow against a running server.
- **What came back:** The pages, the stylesheet additions (`.account-nav`, `.link-button`, `.two-way`-style `.two-up`, status/badge/tier classes), `test/frontend.test.js` rebuilt around a stubbed `fetch`, and a smoke script that drives the live server: organizer signs up, creates an event, adds a tier, publishes; a draft is `404` to a stranger and `200` to its owner; an attendee books and pays (declined then retry); a stranger is refused `403` for reading or paying that booking; `/api/bookings/me` returns only the caller's booking; every static page is served and `mockData.js` is gone.
- **What was wrong (or "nothing"):** Two things. (1) "My tickets" only had the booking row, so every card said "Event" and "Ticket"; I added a small read-path join in `bookingService` so `/api/bookings/me` (and one booking) carry `eventTitle`, `eventCity`, `eventStartsAt` and `tierName`. That is a service composition, not a new repository join. (2) I could not click through in a real browser in this environment, so I drove the API with a script and checked every page is served; the browser click-through in the "Done when" list still needs to be done by hand before merging. (Also fixed while wiring: a duplicated block in `event.js` left two copies of the same `const`, which `node --check` caught immediately.)

### Files changed in Build 7

New: `src/lib/password.js`, `src/lib/token.js`, `src/services/authService.js`,
`src/http/guards.js`, `src/http/routes/auth.js`, `public/js/session.js`,
`public/js/nav.js`, `public/login.html`, `public/tickets.html`,
`public/organizer.html`, `public/js/pages/login.js`, `public/js/pages/tickets.js`,
`public/js/pages/organizer.js`, `test/auth.test.js`.

Changed: `src/config.js` (token secret), `src/server.js` (guards and auth service),
`src/http/routes.js` (guards, new endpoints, owner checks), `src/http/app.js`
(status codes for `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN`),
`src/domain/validation.js` (`requireEmail`, `requirePassword`),
`src/services/eventService.js` (ownership, `getEventWithTiers`,
`listForOrganizer`, `unpublishEvent`), `src/services/bookingService.js` (owner
checks, `getBooking`, `listForUser`, the event context on a booking read),
`src/repositories/memory.js` and `src/repositories/sqlite.js` (users and
`listBookingsForUser`), `public/js/api.js` (`fetch` and the bearer token),
`public/js/pages/home.js` and `public/js/pages/event.js` (account nav and auth
handling), `public/index.html` and `public/event.html` (account nav),
`public/css/styles.css`, `test/api.test.js` (signup/login and bearer tokens),
`test/frontend.test.js` (stubbed `fetch`, session tests), `docs/api-examples.md`,
`docs/architecture.md`, `README.md`.

Deleted: `public/js/mockData.js` (the server filters now, so its copy of the rules
had to go).

### Prompt rules that were unclear

1. **`src/routes/auth.js` versus `src/http`.** The architecture doc says all HTTP
   lives in `src/http`; the prompt names `src/routes/`. I kept `src/http`.
2. **`NOT_FOUND` versus `FORBIDDEN` for someone else's booking.** The prompt says
   `NOT_FOUND`, the S13 acceptance criteria say `FORBIDDEN`. I followed S13.
3. **A missing `TOKEN_SECRET`.** The prompt says the secret comes from an
   environment variable but not what to do without one; I generate a random
   per-process secret and warn.
4. **How long a token lives.** "Tokens expire" with no number; I chose 12 hours
   (`DEFAULT_LIFETIME_SECONDS` in `token.js`).



