# AI Log

## Build 2: Event Search, Sorting, Backlog and First Tests

### Prompt 1: Understanding the Build 2 requirements
- **What I asked:** I asked AI to explain the Build 2 requirements and help me plan the implementation of event search, filtering, sorting, product backlog documentation and automated tests.
- **What came back:** AI explained the requirements, acceptance criteria and recommended implementation steps.
- **What was wrong (or "nothing"):** The guidance needed to be checked against the existing project structure and course instructions before implementation.

### Prompt 2: Implementation and code review
- **What I asked:** I asked AI to review the existing domain code, help implement the required Build 2 features and identify possible bugs.
- **What came back:** AI helped review the event search, filtering, sorting and inventory implementations, and guided the development of automated tests.
- **What was wrong (or "nothing"):** Suggestions were checked against the existing code and acceptance criteria. The implementation was adjusted and tested rather than blindly replacing working code.

### Implementation completed
- Implemented event searching by title and venue, ignoring capitalization.
- Implemented case-insensitive city filtering.
- Implemented inclusive date filtering, including the full day when the upper date is date-only.
- Implemented maximum-price filtering using the cheapest ticket tier.
- Added filtering to hide sold-out events.
- Implemented sorting by date, price and availability.
- Used a self-written stable merge sort that returns a new array without modifying the original.
- Added event publishing and unpublishing functionality.
- Added and reviewed automated tests for event search, filtering, sorting, inventory and booking requirements.
- Updated the Build 2 documentation and acceptance criteria.

### Files changed
- docs/build-2.md
- src/domain/eventSearch.js
- src/domain/inventory.js
- test/eventSearch.test.js
- test/inventory.test.js
- package-lock.json
- docs/ai-log.md

### Testing and verification
- Ran `npm test`.
- **43 tests passed.**
- **0 tests failed.**
- **10 test suites completed.**
- Confirmed that search, filtering and sorting do not modify the original event list.
- Confirmed that merge sort is stable.
- Confirmed that publishing an event without ticket tiers is rejected.
- Confirmed that the booking success test uses a published event.

### AI corrections and decisions
- Reviewed the date-only upper-boundary behaviour to ensure events later in the day are included.
- Checked that merge sort takes the left item when comparison values are equal, preserving stability.
- Checked the booking success test against the published-event acceptance criterion.
- Kept the existing project architecture and avoided adding external npm dependencies.

### Uncertainties
- No unresolved implementation uncertainties remain from the Build 2 requirements reviewed so far.
