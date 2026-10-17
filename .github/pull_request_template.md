<!--
Use this template for every build PR.

Title format:  Build N: <one short line>
Branches:      build-N -> main
Keep it honest: if something is unfinished or guessed, say so below.
-->

## Summary

<!-- One or two sentences: what does this PR add, and why now? -->

## What is in this PR

<!-- Bullet the new/changed files and the ideas behind them. -->

-

## User stories

<!-- Which S-numbers does this build satisfy? Copy their criteria up from
     docs/user-stories.md so a reviewer can tick them off. -->

-

## How to run and test

<!-- Exact commands. Copy real output, do not describe it. -->

```bash
npm test            # all tests
npm start           # then exercise the API
```

<!-- For API builds, paste the key curl calls (see docs/api-examples.md). -->

## Rules I had to respect

<!-- Delete any that do not apply. -->

- [ ] Money is whole cents, never a decimal.
- [ ] Errors use the one shape `{"error":{"code","message"}}`.
- [ ] No stack trace ever reaches the client.
- [ ] Business rules live in `src/services/` and `src/domain/`, not in routes.
- [ ] The services do not import the repository; it is passed in.

## AI log

<!-- Link the entry you added to docs/ai-log.md for this build. -->

- `docs/ai-log.md` -> Build N

## Checklist

- [ ] `npm test` is green.
- [ ] Every call in `docs/api-examples.md` works with `curl` (API builds).
- [ ] Tests added or updated for the new behaviour.
- [ ] Docs updated (`docs/architecture.md`, `docs/ai-log.md`).
- [ ] Not merged: this PR is for review.
