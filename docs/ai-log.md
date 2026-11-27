# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Implementation review
- **What I asked:** Explain the Build 1 implementation and identify every rule that must hold for booking, cancellation, waitlisting, and reference lookup.
- **What came back:** An implementation walkthrough based on `src/domain/inventory.js`, `src/domain/waitlistQueue.js`, `src/domain/ids.js`, `src/domain/errors.js`, `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What was wrong (or "nothing"):** Nothing in the summary. The review found an existing Build 1 edge case: `offerNextOnWaitlist` will not bypass a head-of-line request that exceeds the currently available seats. No implementation changes.

## Build 2

### Prompt 1: Event search and sorting
- **What I asked:** Add event search and filters, stable merge sorting without `Array.sort`, automated tests, and Build 2 user-story acceptance criteria.
- **What came back:** Pure search and sorting functions, a Node built-in test suite, and documentation for the filter and sorting rules.
- **What was wrong (or "nothing"):** Two events without ticket tiers both have no price. Comparing their infinite price values by subtraction produces `NaN`, which breaks the stable ordering. I changed the comparator to explicitly return equality for equal values and added a regression test. All six tests pass with Node v26.13.1.

### Prompt 2: Summary-based event search
- **What I asked:** Follow the Build 2 AI prompt and change search to `filterEvents`, summary-based `sortEvents`, and `searchEvents`, while keeping `summarizeEvent`.
- **What came back:** The existing inventory already had `publishEvent`, `listEventSummaries`, and the merge-sort helper; I adapted search and sorting to those summaries and expanded the acceptance tests.
- **What was wrong (or "nothing"):** The earlier search API used events plus a tier `Map`, returned plain `TypeError`s for invalid criteria, and accepted impossible calendar dates in inventory creation. The package file also had duplicate `test` keys. I changed the API to raise `DomainError('VALIDATION', ...)`, validate real ISO calendar dates, and keep one Node test command.

## Build 3

### Prompt 1: Architecture, state machine, and server skeleton
- **What I asked:** Implement the Build 3 architecture diagrams, booking state machine, Node HTTP router/server, static-file serving, configuration, start script, and tests without changing existing behavior.
- **What came back:** A domain state machine, parameterized router, HTTP app, server entry point, public page, architecture diagrams, and tests.
- **What was wrong (or "nothing"):** Copilot first created files in the wrong folder (one level above my project), then deleted and recreated them, leaving stray empty folders that I removed. It also changed Build 2 files it did not list in its summary, including replacing the random-data sorting test with a weaker one, so I restored the original with git restore. It fixed a date-validation bug in `eventSearch.js` and added tests for it. After these checks the 44-test suite passes and /health returns ok.
