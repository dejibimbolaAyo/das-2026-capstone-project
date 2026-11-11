# Milestones: Nine Builds

Each Build is one weekly session, and each one ends with something you can run and show. A Build starts from the finished state of the one before it, so keep your `main` branch working.

| Build | Week | Milestone | Stories |
|---|---|---|---|
| [1](build-1.md) | 4 | Domain core in the terminal | none (groundwork) |
| [2](build-2.md) | 5 | Event search, sorting, backlog, first tests | S02, S03, S04, S05, S06, S16 |
| [3](build-3.md) | 6 | Architecture, state machine, server skeleton | none (groundwork) |
| [4](build-4.md) | 7 | Working REST API (in memory) | S02, S03, S04, S05, S06, S07 |
| [5](build-5.md) | 8 | SQLite and the overselling fix | S08 |
| [6](build-6.md) | 9 | Frontend on mock data | S05, S06, S07 |
| [7](build-7.md) | 10 | Login, roles and a connected app | S01, S13, S02, S03, S04 |
| [8](build-8.md) | 11 | Refunds, waitlist, expiry, real test suite | S09, S10, S11, S12 |
| [9](build-9.md) | 12 | QR check-in, CI, security, demo-ready | S14, S15, S16 |

Open a Build's file to see its deliverables, what you practise, when it is done, and its user stories with acceptance criteria.

## Glossary

| Term | Meaning in this course |
|---|---|
| Build | One weekly class session. It ends with something you can run and show. |
| Milestone | The one thing a Build must deliver. The table above lists all nine. |
| Sprint | A short, fixed period of work. Each Build is one sprint. |
| Backlog | Every story we might build, with its priority. It is in [user-stories.md](user-stories.md). |
| User story | One sentence: "As a (who), I want to (what), so that (why)." |
| Acceptance criterion | A Given/When/Then sentence that says exactly when a story passes. |
| Test | Code that checks one acceptance criterion and fails if it is not met. |
| Definition of done | The checklist every story must pass before it is finished. |
| Pull request | A request to merge your `build-N` branch into `main`, so someone can review it first. |
| AI log | `docs/ai-log.md`. For each prompt: what you asked, what came back, and what was wrong. |
| Stable sort | A sort that keeps equal items in their original order. |
| Pure function | Same input, same output, and nothing outside it changes. |
| State machine | A list of states and the only moves allowed between them. |
| Idempotent | Doing it twice has the same effect as doing it once. |
