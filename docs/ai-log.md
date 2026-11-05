# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** Implement Build 2 sorting, event publishing/search, and acceptance-criteria tests.
- **What came back:** Added a stable merge sort, event publication and summary helpers, pure search/filter/sort functions, a Node test suite, and the `npm test` script. I also filled in the three S04 acceptance criteria.
- **What was wrong (or "nothing"):** During review, I found and corrected escaped newline/regular-expression mistakes and tightened validation for impossible ISO calendar dates. The test suite still needs to be run with Node 22.13+ before this build can be considered verified.

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests.
- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.
- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.
