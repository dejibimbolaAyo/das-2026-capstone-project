// Build 5: fill the database with a little sample data, ONCE.
//
//   npm run seed            # uses DB_PATH (default data/ticketing.db)
//   DB_PATH=/tmp/x.db npm run seed
//
// If the database already has events, it does nothing, so running it twice is
// safe. Data written here survives a server restart because it is on disk.

import { loadConfig } from '../src/config.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

const SAMPLE = [
  {
    event: { title: 'Jazz Night', city: 'Lagos', venue: 'The Shrine', startsAt: '2026-03-01T19:00:00Z' },
    tiers: [
      { name: 'General', priceCents: 5000, capacity: 100 },
      { name: 'VIP', priceCents: 15000, capacity: 20 },
    ],
  },
  {
    event: { title: 'Rock Night', city: 'Abuja', venue: 'Transcorp Hilton', startsAt: '2026-03-15T20:00:00Z' },
    tiers: [{ name: 'Standing', priceCents: 7500, capacity: 200 }],
  },
  {
    event: { title: 'Comedy Evening', city: 'Port Harcourt', venue: 'Civic Centre', startsAt: '2026-04-02T18:30:00Z' },
    tiers: [{ name: 'Regular', priceCents: 3000, capacity: 50 }],
  },
];

async function main() {
  const config = loadConfig();
  const repository = createSqliteRepository({ path: config.dbPath });

  const existing = await repository.listEvents();
  if (existing.length > 0) {
    console.log(`${config.dbPath} already has ${existing.length} event(s); nothing to do.`);
    repository.close();
    return;
  }

  const events = createEventService(repository);
  const bookings = createBookingService(repository, createMockPaymentGateway());

  console.log(`Seeding ${config.dbPath}`);
  for (const { event, tiers } of SAMPLE) {
    const created = await events.createEvent({ ...event, organizerId: 'organizer-ada' });
    for (const tier of tiers) {
      await events.addTier(created.id, tier);
    }
    await events.publishEvent(created.id);
    console.log(`  + ${created.title} (${tiers.length} tier(s))`);
  }

  // One paid booking, so the bookings table is not empty after seeding.
  const first = await events.search({ q: 'Jazz' });
  if (first.length > 0) {
    const summary = first[0];
    const tiers = await repository.listTiers();
    const tier = tiers.find((t) => t.eventId === summary.id);
    if (tier) {
      const booking = await bookings.book({ tierId: tier.id, userId: 'attendee-grace', quantity: 2 });
      await bookings.pay({ reference: booking.reference, userId: 'attendee-grace', card: 'ok' });
      console.log(`  + 1 paid booking (${booking.reference})`);
    }
  }

  console.log('Done. Start the server with `npm start`.');
  repository.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
