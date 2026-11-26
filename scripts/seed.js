// Run with: npm run seed
// Fills the server's SQLite database with three demo accounts, 4 real-looking
// events, and 2,000 generated events for testing search and paging.
//   npm run seed             the default: 4 events + 2,000 generated
//   npm run seed -- 50000    a bigger test set
//   npm run seed -- 0        only the 4 events
// Safe to run twice: accounts that exist are skipped, the 4 events are only added
// to an empty database, and generated events are only topped up to the number asked for.
//
// Demo logins (for local use only, the password is public):
//   organizer@demo.test, attendee@demo.test, staff@demo.test
//   password: demo-password-1

import { DATABASE_PATH } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createAuthService } from '../src/services/authService.js';
import { createEventService } from '../src/services/eventService.js';
import { addBulkEvents, countBulkEvents } from './lib/bulkEvents.js';

const BULK = Number(process.argv[2] ?? 2000);
if (!Number.isInteger(BULK) || BULK < 0 || BULK > 1_000_000) {
  console.error('Give a whole number between 0 and 1,000,000, for example: npm run seed -- 5000');
  process.exit(1);
}

const DEMO_PASSWORD = 'demo-password-1';
const DEMO_USERS = [
  { name: 'Demo Organizer', email: 'organizer@demo.test', role: 'organizer' },
  { name: 'Demo Attendee', email: 'attendee@demo.test', role: 'attendee' },
  { name: 'Demo Staff', email: 'staff@demo.test', role: 'staff' },
];

const EVENTS = [
  {
    event: { title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Landmark Centre', startsAt: '2026-12-05T17:00:00Z' },
    tiers: [
      { name: 'General', priceCents: 500000, capacity: 100 },
      { name: 'VIP', priceCents: 1500000, capacity: 20 },
    ],
  },
  {
    event: { title: 'Abuja Design Summit', city: 'Abuja', venue: 'Transcorp Hilton', startsAt: '2027-01-16T09:00:00Z' },
    tiers: [{ name: 'Standard', priceCents: 1000000, capacity: 150 }],
  },
  {
    event: { title: 'Afrobeats Night', city: 'Lagos', venue: 'Eko Hotel', startsAt: '2026-12-19T20:00:00Z' },
    tiers: [
      { name: 'Regular', priceCents: 800000, capacity: 300 },
      { name: 'Table for 4', priceCents: 6000000, capacity: 1 },
    ],
  },
  {
    event: { title: 'Ibadan Book Fair', city: 'Ibadan', venue: 'University of Ibadan', startsAt: '2027-02-06T10:00:00Z' },
    tiers: [{ name: 'Free entry', priceCents: 0, capacity: 500 }],
  },
];

const db = openDatabase(DATABASE_PATH);
const repository = createSqliteRepository({ db });
try {
  // The secret only matters for tokens, and the seed does not use them.
  const auth = createAuthService({ repository, authSecret: 'seed-script-not-used-for-tokens' });
  const ids = {};
  for (const user of DEMO_USERS) {
    const found = await repository.findUserByEmail(user.email);
    ids[user.role] = found ? found.id : (await auth.signup({ ...user, password: DEMO_PASSWORD })).user.id;
    console.log(`${found ? 'Have' : 'Added'} ${user.role}: ${user.email}`);
  }
  const ORGANIZER = ids.organizer;

  const existing = await repository.listEvents();
  if (existing.length > 0) {
    console.log(`${DATABASE_PATH} already has ${existing.length} event(s), so no events were added.`);
    console.log('Events from before Build 9 belong to a user nobody can log in as. To get demo-owned events, stop the server and delete the data/ticketing.db file, then run the seed again.');
  } else {
    const events = createEventService({ repository });
    for (const { event, tiers } of EVENTS) {
      const created = await events.createEvent(ORGANIZER, event);
      for (const tier of tiers) await events.addTier(ORGANIZER, created.id, tier);
      await events.publishEvent(ORGANIZER, created.id);
      console.log(`Added ${created.title} (${created.id})`);
    }
    console.log(`Seeded ${EVENTS.length} published events into ${DATABASE_PATH}`);
  }

  // Generated events for testing search speed and paging.
  const have = countBulkEvents(db);
  if (have >= BULK) {
    console.log(`Already have ${have} generated event(s). No more added.`);
  } else {
    const tiers = addBulkEvents(db, ORGANIZER, BULK - have, have + 1);
    console.log(`Added ${BULK - have} generated events with ${tiers} tiers (${BULK} in total).`);
  }
} finally {
  repository.close();
}
