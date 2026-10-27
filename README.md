# Event Ticketing and Booking: Course Capstone

**Organizers publish events. Attendees buy tickets. Staff check people in with QR codes.**

You will build a full-stack ticketing platform over nine weekly Build sessions, using an AI coding tool as your partner. The app looks simple on the surface. It hides three hard problems, and solving them well is what this project is about.

## The three hard problems

1. **Overselling.** One ticket is left and fifty people press Buy at the same moment. Exactly one of them must get it.
2. **Refunds.** When someone cancels, how much money goes back depends on how close the event is, and the seats must be released exactly once.
3. **Waitlists.** When an event is sold out and a seat frees up, the person who has waited longest is offered it, for a limited time, and then it passes to the next person.

## What you will build

| Role | What they can do |
|---|---|
| **Organizer** | Create, edit and publish events and ticket tiers. See bookings for their own events only. |
| **Attendee** | Browse and search events, book tickets, pay (mock payment), cancel and get a refund, join waitlists, see their own tickets. |
| **Staff** | Scan tickets at the door for events they are assigned to. Nothing else. |

The finished project has a website (HTML, CSS, JavaScript), a JavaScript API, and a database. Payments are simulated: no real money moves.

## How the course works

Every Build session has four steps:

1. **Gap lesson.** Your instructor teaches the things you have not been taught yet but need for this build.
2. **Prompt and build.** You give your AI tool a clear description of the milestone and the rules, and let it write a first draft.
3. **Review.** You read the code, run it, and decide what is wrong. You fix it, and you tell the AI why it was wrong.
4. **Ship.** You commit on a branch named `build-N`, open a pull request into `main`, and merge it.

**The AI writing the code is not the skill being graded.** The skill is knowing what to ask for, and knowing whether what came back is correct.

### The AI log

Keep a file called `docs/ai-log.md`. For every important prompt, write:

- what you asked,
- what came back,
- what was wrong with it (or "nothing"), and what you changed.

You will add at least one entry in every build. It counts toward your grade.

## The nine Build classes

The capstone is built in nine Build classes, one milestone each. Every class follows the same four steps: a short gap lesson, prompt and build, review, ship. The full list of what each class delivers and when it is done is in [docs/milestones.md](docs/milestones.md).

| Build | Class | You deliver | New ideas taught first |
| --- | --- | --- | --- |
| 1 | Domain core in the terminal | Events, ticket tiers, bookings with a capacity rule, a first-in-first-out waitlist, fast lookup by reference | Running Node, modules, `Map`, classes, errors, money as whole cents, Big O |
| 2 | Search, sorting and the first tests | Search, filter and sort events with your own merge sort, the backlog as user stories, the first automated tests | `node:test`, pure functions, comparators, stability, user stories and acceptance criteria |
| 3 | Architecture, state machine and server skeleton | A layered design, the booking life cycle as a state machine, a web server with `/health` and static files | HTTP requests and responses, status codes, routers, state machines, diagrams |
| 4 | A working REST API (in memory) | Create, publish, search, book, pay (mock) and cancel through an API | `async`/`await`, dependency injection, repositories, REST design |
| 5 | SQLite and the overselling fix | Data in SQLite, and the last-ticket problem reproduced and then fixed | SQL, atomic updates, constraints, parameterised queries, concurrency |
| 6 | Frontend on mock data | Browse, filter, view an event, choose tickets, check out with a countdown, mock card payment | The DOM, forms, ES modules in the browser, accessibility basics |
| 7 | Login, roles and a connected app | Signup and login, three roles, private data, the website talking to the real API | `fetch`, password hashing, tokens, authentication versus authorization |
| 8 | Refunds, waitlist, expiry and a real test suite | A refund policy, cancelling, waitlist offers with a time limit, unpaid bookings that expire, a debugging exercise | A controllable clock in tests, boundary cases, testing concurrency, debugging method, scheduled jobs |
| 9 | QR check-in, CI and security | Signed QR tickets, staff check-in, forged and repeated scans rejected, security headers, rate limiting, tests on every push, a demo-ready project | Signing versus encrypting, GitHub Actions, security headers, secrets |

The three hard problems arrive where you would expect: overselling in Build 5, and refunds and waitlists in Build 8.

For every Build class, work on a branch named `build-N` (for example `build-2`), open a pull request into `main`, and merge it.

## Stack

- **Frontend:** HTML, CSS, JavaScript (no framework)
- **Backend:** Node.js 22.13 or newer, JavaScript API
- **Database:** SQLite
- **Tests:** Node's built-in test runner
- No outside packages are needed. Check your Node version with `node --version`.

## Build 1: run it

Build 1 is the domain core: the rules of booking, running in the terminal. There is no website, API or database yet. Those arrive in later builds.

### 1. Check Node

```bash
node --version      # must print v22.13.0 or higher
```

If it is lower, install the current LTS from https://nodejs.org and open a new terminal.

### 2. Get the code

```bash
git clone https://github.com/dejibimbolaAyo/das-2026-capstone-project.git
cd das-2026-capstone-project
```

There is nothing to `npm install`. The project uses no outside packages.

### 3. Run the demo

```bash
npm run demo
```

You should see Ada book 2 of 3 seats, Bayo refused for asking for 2 when only 1 is left (`SOLD_OUT`), the event sell out, two people join the waitlist, a booking found by its reference, and Ada's cancellation freeing seats so the waitlist shows who is next. The reference code and ids change on every run. That is expected.

### 4. Run the benchmark

```bash
npm run benchmark
```

It looks up 500 bookings among 100,000, once with `Array.find` and once with `Map.get`. The exact times depend on your computer, but the Map should be hundreds of times faster. Open `scripts/benchmark-lookup.js`, double `BOOKINGS`, and run it again. Which number grows, and which stays flat?

### 5. Read the code

Read in this order:

1. `src/domain/errors.js`: one error type with a code, such as `SOLD_OUT`.
2. `src/domain/ids.js`: ids and booking references.
3. `src/domain/inventory.js`: tiers, seats left, and the booking rules.
4. `src/domain/waitlistQueue.js`: a first-in-first-out queue built from a linked list.
5. `scripts/demo.js`: how the pieces are used together.

### If something goes wrong

| You see | Do this |
|---|---|
| `command not found: node` | Install Node (step 1). |
| `SyntaxError: Cannot use import statement` or an unknown-option error | Your Node is too old. Upgrade to 22.13 or higher. |
| `Cannot find module` | You are in the wrong folder. Run `pwd` and `cd` into the project root, where `package.json` is. |

### Your Build 1 task

Follow the "Done when" list in [docs/build-1.md](docs/build-1.md). Work on a branch called `build-1`, add your first entry to `docs/ai-log.md`, and open a pull request into `main`.

## Documents

- [docs/milestones.md](docs/milestones.md): the nine Builds at a glance, with a glossary.
- [docs/build-1.md](docs/build-1.md) to [docs/build-9.md](docs/build-9.md): one file per Build, with its deliverables and its user stories with acceptance criteria.
- [docs/user-stories.md](docs/user-stories.md): the product backlog and the definition of done.

## Rules of the road

- Work on a branch called `build-N`, open a pull request, merge to `main`. Do not push straight to `main`.
- Never commit secrets, passwords or `.env` files.
- Money is stored as whole numbers of the smallest unit (kobo or cents), never as decimals.
- You are responsible for every line of your project, including the lines the AI wrote.

## Project layout

```
src/domain/     plain rules: no I/O, no HTTP
scripts/        things you run by hand
docs/           milestones and user stories
```
