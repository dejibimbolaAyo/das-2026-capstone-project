// Run with: npm run seed
// Fills the server's SQLite database with a few events, once. If the database
// already has events, it changes nothing, so running it twice is safe.

import { DATABASE_PATH } from '../src/config.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';

const ORGANIZER = 'org-1';

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

const repository = createSqliteRepository({ path: DATABASE_PATH });
try {
  const existing = await repository.listEvents();
  if (existing.length > 0) {
    console.log(`${DATABASE_PATH} already has ${existing.length} event(s). Nothing to do.`);
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
} finally {
  repository.close();
}
