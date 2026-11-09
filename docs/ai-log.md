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

## Build 3: Architecture, State Machine and Server Skeleton

### Prompt 1: Architecture and booking state machine
- **What I asked:** I asked AI to help design the application architecture, document the booking lifecycle and implement a booking state machine.
- **What came back:** AI helped create three Mermaid diagrams and implement the booking states, allowed transitions and transition validation.
- **What was wrong (or "nothing"):** The implementation was reviewed against the course requirements. The allowed and forbidden transitions were tested before proceeding.

### Prompt 2: HTTP router and server
- **What I asked:** I asked AI to help build a lightweight HTTP router and server using Node.js built-in modules only.
- **What came back:** AI helped implement route matching, dynamic URL parameters, JSON error responses, static file serving, server configuration and the start script.
- **What was wrong (or "nothing"):** The health route initially needed a routing correction to ensure `/health` was handled correctly. This was fixed and verified with a real HTTP request.

### Implementation completed
- Created `docs/architecture.md` with three Mermaid diagrams covering layered architecture, the data model and booking lifecycle.
- Implemented the booking state machine with pending, paid, cancelled, refunded and checked_in states.
- Implemented `canTransition` and `assertTransition`.
- Added the `INVALID_TRANSITION` DomainError for illegal state changes.
- Created a lightweight HTTP router supporting HTTP methods and dynamic `:params`.
- Created the HTTP application using Node.js built-in modules.
- Implemented the `/health` endpoint.
- Added JSON 404 responses for unknown API routes.
- Added JSON 400 responses for invalid JSON.
- Standardised error responses as `{error: {code, message}}`.
- Implemented static file serving from the `public/` directory.
- Added protection against accessing files outside the public directory.
- Created `src/config.js` and `src/server.js`.
- Added the `npm start` script to `package.json`.
- Avoided external npm dependencies.

### Files changed
- docs/architecture.md
- docs/ai-log.md
- package.json
- public/index.html
- src/config.js
- src/domain/bookingStateMachine.js
- src/http/router.js
- src/http/app.js
- src/server.js
- test/app.test.js
- test/bookingStateMachine.test.js
- test/router.test.js

### Testing and verification
- Ran `npm test`.
- All 59 tests passed.
- Confirmed that every allowed and illegal booking transition was tested.
- Confirmed that router matching and dynamic parameters work.
- Confirmed that GET `/health` returns HTTP 200 with `{"status":"ok"}`.
- Confirmed that unknown API routes return JSON 404.
- Confirmed that invalid JSON returns JSON 400.
- Confirmed that internal errors do not expose stack traces to clients.
- Confirmed that the homepage is served from the public directory.
- Started the server successfully using `npm start`.
- Tested the running server with a real HTTP request.
- Tested path traversal protection; an attempt to access `package.json` outside the public directory returned HTTP 404.

### AI corrections and decisions
- Corrected the routing condition so `/health` is handled by the router.
- Used an available port for automated HTTP tests to avoid port conflicts.
- Used Node.js built-in modules instead of installing external packages.
- Verified that server errors do not expose internal details to clients.
- Tested static file path protection before considering the server implementation complete.

### Uncertainties
- No unresolved implementation uncertainties remain from the Build 3 requirements reviewed so far.
