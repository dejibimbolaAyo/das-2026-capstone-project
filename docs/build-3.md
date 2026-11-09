# Build 3: Architecture, state machine, server skeleton

*Week 6 of the course. Starts from the finished state of Build 2.*

**You deliver:** a layered design (routes, services, rules, data), a booking life cycle written as an explicit state machine, and a web server that answers `/health` and serves static files.

**You practise:** requirements, system architecture, state diagrams, HTTP basics.

**Done when**
- A diagram of your architecture and your booking states is in `docs/`.
- Invalid state changes (for example paying a cancelled booking) are refused by tests.
- The server starts and `/health` responds.

## User stories in this build

No new stories. The booking state machine you design here is what S07, S09 and S10 will be built on, so write down every state and every allowed move.

## AI prompt

Give your AI tool these files first: README.md, docs/user-stories.md, docs/build-3.md and src/domain/.

Then paste the prompt below. When it answers, do not trust it yet: read the code, run the checks in "Done when", and write what was wrong in `docs/ai-log.md`.

```text
We are building Build 3 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-3.md and everything in src/domain/ before you
write anything. Do not change what already works.

1. docs/architecture.md with three Mermaid diagrams: the layers (routes call
   services, services call rules and repositories, nothing calls upwards), the
   data model (events, ticket tiers, bookings, users) and the booking life
   cycle. Under the layer diagram, write one sentence for each layer saying
   what it may and may not do.

2. src/domain/bookingStateMachine.js: the states pending, paid, cancelled,
   refunded and checked_in as data. Allowed moves: pending to paid or
   cancelled; paid to checked_in, refunded or cancelled. cancelled, refunded
   and checked_in are final: nothing leaves them. Export canTransition and
   assertTransition, and throw a DomainError with the code INVALID_TRANSITION
   for an illegal move.

3. A tiny router in src/http/router.js (method plus path, with :params) and a
   server in src/http/app.js built on node:http only.
   - GET /health returns {"status":"ok"}.
   - Unknown /api paths return a JSON 404. Bad JSON returns a JSON 400.
   - Every error has the same shape: {"error":{"code","message"}}.
   - Serve files from public/ and never allow a path to escape that folder.

4. src/server.js and src/config.js. The port comes from the PORT environment
   variable, default 3000. Add a "start" script to package.json.

5. Tests with node:test: every allowed and every illegal booking move, the
   router, and one real HTTP request to /health.

Rules: a stack trace must never reach the client; business rules do not live
in route handlers. When you are done, list every file you changed and any rule
from this prompt that you were unsure about.
```

## Definition of done

The Definition of done in [user-stories.md](user-stories.md) applies to every story in this build.

[All milestones](milestones.md) · [Build 2](build-2.md) · [Build 4](build-4.md)
