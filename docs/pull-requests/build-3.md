# Build 3: architecture, booking state machine, server skeleton

> Branch: `build-3` -> `main`. Ready to paste into a PR. Follows
> `.github/pull_request_template.md`.

## Summary

Turns the in-memory domain from Build 2 into a runnable, layered application.
This PR adds the architecture doc, the booking life cycle written as an explicit
state machine, a tiny router, and a `node:http` server that answers `/health`
and serves static files from `public/`. No business rules move into the HTTP
layer; this is the skeleton every later build hangs off.

## What is in this PR

- `docs/architecture.md` with three Mermaid diagrams (layers, data model,
  booking life cycle) and one sentence per layer on what it may and may not do.
- `src/domain/bookingStateMachine.js`: `pending, paid, cancelled, refunded,
  checked_in` as data; `canTransition` and `assertTransition` (throws
  `INVALID_TRANSITION` on an illegal move). Final states never leave.
- `src/http/router.js`: method + path matching with `:params`.
- `src/http/app.js`: the HTTP application on `node:http` only. `GET /health`
  returns `{"status":"ok"}`; unknown `/api` paths give a JSON 404; bad JSON
  gives a JSON 400; errors are always `{"error":{"code","message"}}`; static
  files are served from `public/` and a path can never escape that folder.
- `src/server.js` + `src/config.js`: `PORT` from the environment (default 3000);
  `buildServer()` returns an unlistened server so tests can bind a free port.
- `public/index.html`, `public/app.js`, `public/styles.css`: a first page that
  calls `/health`.
- A `start` script in `package.json`.
- Tests: every allowed and every illegal booking move, the router, and a real
  HTTP request to `/health` (`test/bookingStateMachine.test.js`,
  `test/router.test.js`, `test/http.test.js`).

## User stories

No new stories. This build delivers the foundation S07, S09 and S10 are built
on, and progresses S16 (automated tests).

- **S16 (team, tests):** `npm test` runs with `node:test` and is green.
- **State machine groundwork (S07/S09/S10):** every state and allowed move is
  written down, and illegal moves are refused by tests.

## How to run and test

```bash
npm test            # state machine, router and one real /health request
npm start           # http://localhost:3000
curl -s http://localhost:3000/health        # {"status":"ok"}
curl -s http://localhost:3000/api/nope      # {"error":{"code":"NOT_FOUND",...}}
```

## Rules I had to respect

- [x] Errors use the one shape `{"error":{"code","message"}}`.
- [x] No stack trace ever reaches the client (unknown failures log server-side
      and return a generic 500).
- [x] Business rules live in `src/domain/`, not in route handlers.
- [x] Static file serving cannot escape `public/` (guarded with `resolve`).

## AI log

- `docs/ai-log.md` -> Build 3

## Checklist

- [x] `npm test` is green.
- [x] Tests added for the new behaviour.
- [x] Docs updated (`docs/architecture.md`, `docs/ai-log.md`).
- [x] Not merged: this PR is for review.

## Notes for the reviewer

- The `%2e%2e` form of a traversal is normalised to `..` by the WHATWG URL
  parser before it reaches the server, so the guard is exercised with a `%2f`
  smuggling attempt (`/..%2fpackage.json`) instead.
