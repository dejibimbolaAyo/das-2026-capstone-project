## Build 1 - implementation review

- **Asked:** Explain the Build 1 implementation and identify every rule that must hold for booking, cancellation, waitlisting, and reference lookup.
- **What came back:** An implementation walkthrough based on `src/domain/inventory.js`, `src/domain/waitlistQueue.js`, `src/domain/ids.js`, `src/domain/errors.js`, `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What was wrong:** Nothing in the summary; the review identified an existing Build 1 edge case: `offerNextOnWaitlist` will not bypass a head-of-line request that exceeds the currently available seats.
- **What I changed:** No implementation changes.