## Build 1 - implementation review

- **Asked:** Explain the Build 1 implementation and identify every rule that must hold for booking, cancellation, waitlisting, and reference lookup.
- **What came back:** An implementation walkthrough based on `src/domain/inventory.js`, `src/domain/waitlistQueue.js`, `src/domain/ids.js`, `src/domain/errors.js`, `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What was wrong:** Nothing in the summary; the review identified an existing Build 1 edge case: `offerNextOnWaitlist` will not bypass a head-of-line request that exceeds the currently available seats.
- **What I changed:** No implementation changes.

## Build 2 - event search and sorting

- **Asked:** Add event search and filters, stable merge sorting without `Array.sort`, automated tests, and Build 2 user-story acceptance criteria.
- **What came back:** Pure search and sorting functions, a Node built-in test suite, and documentation for the filter and sorting rules.
- **What was wrong:** Two events without ticket tiers both have no price; comparing their infinite price values by subtraction produces `NaN`, which does not preserve the intended stable ordering.
- **What I changed:** The comparator now explicitly returns equality for equal values, and a regression test checks stable sorting for events without tiers. All six tests pass with Node v26.13.1.