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