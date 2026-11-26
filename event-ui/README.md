# event-ui

The React website for the Event Ticketing capstone: browse events, book, and check out. It talks to the Node API in the repo root through `src/api/api.js`, and nothing else calls `fetch`.

Stack: Vite, React, Material UI (MUI) and React Router.

## Run it

Two terminals. In the repo root:

    npm run seed      # once
    npm start         # API on http://localhost:3000

In this folder:

    npm install
    npm run dev       # website on http://localhost:5173

Vite forwards `/api` to the Node server (see `vite.config.js`), so the browser only talks to one address.

## Layout

    src/api/         api.js: the only file that calls the server
    src/lib/         format.js: money and dates
    src/hooks/       useEvents, useEvent, useCountdown
    src/components/  EventCard, TicketForm, Checkout
    src/pages/       Home, EventPage
    src/theme.js     colours, shape and component defaults

## Notes

- Money is whole cents. Only `src/lib/format.js` turns it into text.
- Until login arrives, `api.js` sends a fixed `x-user-id`.
- The server does not send a hold-until time yet, so `api.js` works it out from the creation time plus 10 minutes. The countdown only disables Pay: the server does not release held seats yet.
- `npm run build` writes `dist/`. Serving it from the Node server comes later.

## Build 9: accounts and roles

The app now has login and signup. Start the API with a secret so logins survive restarts:

```
AUTH_SECRET=some-long-random-text npm start      # in the repo root
npm run dev                                       # in event-ui
```

- Attendees: browse, book, pay, and see **My tickets**.
- Organizers: **My events** (create, add tiers, publish).
- Staff: a placeholder page until Build 11 (QR check-in).

The server enforces every role. Hiding a link in the UI is only courtesy.
Seeded events belong to a demo organizer with no password, so sign up as an organizer and create your own.
