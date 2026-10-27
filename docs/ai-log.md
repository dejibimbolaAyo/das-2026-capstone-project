# AI Log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.  
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1 — Event Ticketing Domain Core

- **What I asked AI to help with:** Implement the event inventory, booking rules, booking references, FIFO waitlist, demo, and lookup benchmark.
- **What I reviewed:** The booking-capacity rules, sold-out booking rejection, cancellation flow, waitlist order, and booking lookup.
- **What I tested:** `npm run demo` and `npm run benchmark`.
- **What the tests showed:** The demo refused a booking when insufficient seats remained, accepted a booking that fitted the remaining capacity, and showed Chidi as next on the waitlist after Ada cancelled. The benchmark showed that `Map.get()` was substantially faster than `Array.find()` for the tested lookups.
- **My learning:** A `Map` supports efficient lookup by key, while a FIFO queue serves the person who joined first. I should test edge cases rather than assume generated code is correct.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests.
- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.
- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.