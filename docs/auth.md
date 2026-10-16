# Login, roles and who may do what (Build 7)

Two different questions, kept in two different places:

| Question | Name | Where |
|---|---|---|
| **Who is this?** | authentication | `src/auth.js` (passwords), `src/tokens.js` (tokens), `src/services/authService.js` |
| **Is this person allowed to do that?** | authorization | `src/services/access.js`, used by the event and booking services |

## Passwords
- Stored only as a **scrypt hash** with its own random salt: `scrypt$N$r$p$salt$hash`. The password itself is never saved, logged or sent back.
- scrypt is slow on purpose, so a thief with the database cannot try billions of guesses a second. The settings travel inside the hash, so they can be raised later without locking anyone out.
- Passwords must be 8 to 200 characters. Emails are lower-cased and trimmed, and each email can be used once (`EMAIL_TAKEN`, 409).
- Wrong email and wrong password give the **same** answer ("Wrong email or password") and take the same work, so nobody can find out which emails have accounts.

## Tokens
After login the server sends a signed token. The website sends it back as `Authorization: Bearer <token>`.
- Three parts: `header.payload.signature`. The payload holds the user id and an expiry time (2 hours).
- The signature is an HMAC-SHA256 stamp made with the server's secret. Anyone can **read** a token, nobody can **change** it. So never put private data in one.
- Refused (401): missing, malformed, changed, signed with another secret, `alg: none`, or expired. Every refusal looks the same, except "expired", which says so.
- The secret comes from `TOKEN_SECRET` (at least 16 characters). If you do not set it, `start.js` makes a random one, and everyone must log in again after a restart.
- The role is read from the database on every request, not trusted from the token.

## Roles
| Role | How you get it | May do |
|---|---|---|
| `attendee` | sign up | book, pay, cancel and list **their own** bookings |
| `organizer` | sign up | create events, add tiers, publish, unpublish, list **their own** events |
| `staff` | not self-service (made by an admin, used from Build 9 for check-in) | nothing yet |

Signing up as `staff` is refused (403), so nobody can make themselves staff.

## The ownership rules
| Situation | Answer |
|---|---|
| Not logged in, action needs login | 401 `UNAUTHENTICATED` (with `WWW-Authenticate: Bearer`) |
| Logged in with the wrong role (attendee tries to create an event) | 403 `FORBIDDEN` |
| Organizer edits **another** organizer's **published** event | 403 `FORBIDDEN` |
| Organizer edits someone's **draft** | 404 (a draft is invisible to others) |
| Attendee reads, pays or cancels **someone else's booking** | 404 (we do not even admit it exists) |
| Anyone lists events or opens a published event | allowed, even without login |

Old rows from before Build 7 have no owner. They count as "nobody's", so nobody can change them (fail closed).

## Routes added
| Route | Needs |
|---|---|
| `POST /api/auth/signup`, `POST /api/auth/login` | nothing |
| `GET /api/me` | login |
| `GET /api/me/bookings` | attendee |
| `GET /api/me/events` | organizer |
| `POST /api/events`, tiers, publish, unpublish | organizer, owner |
| `POST /api/bookings`, `/pay`, `/cancel`, `GET /api/bookings/:ref` | attendee, owner |

Full request and reply examples: `docs/api-examples.md`.

## Known shortcuts (honest list)
- **No login rate limit** yet. Someone could try many passwords. A real service would slow or block repeated failures.
- **No logout on the server.** "Log out" removes the token from the browser. A stolen token works until it expires (2 hours).
- **The token is kept in `sessionStorage`.** It is gone when the tab closes, but a script injected into the page could read it. We never use `innerHTML` and send a strict Content-Security-Policy to make that hard.
- **No email check, no password reset.**
- **HTTPS is needed in real life.** Over plain HTTP a password can be read on the network. Fine for `localhost` practice.
