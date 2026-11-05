// Run with: npm run oversell
// Fifty people try to buy the last ticket at the same moment.
//
// It runs twice, each time on a fresh SQLite database:
//   1. the Build 4 way: read the tier, check for room in JavaScript, then save
//      `sold + 1`. Every request reads "1 seat left" before any of them saves.
//   2. the Build 5 way: the booking service, which takes the seat with one
//      atomic UPDATE and looks at how many rows changed.

import { openDatabase } from '../src/db/connection.js';
import { DomainError } from '../src/domain/errors.js';
import { newId, referenceCode } from '../src/domain/ids.js';
import { assertSeatsAvailable } from '../src/domain/validation.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';

const ATTENDEES = 50;
const CAPACITY = 10;

// An event whose only tier has exactly 1 seat left.
async function lastSeatScenario() {
  const db = openDatabase();
  const repository = createSqliteRepository({ db });
  const events = createEventService({ repository });
  const bookings = createBookingService({ repository, paymentGateway: createMockPaymentGateway() });

  const event = await events.createEvent('organizer', {
    title: 'Afrobeats Night',
    city: 'Lagos',
    startsAt: '2026-12-19T20:00:00Z',
  });
  const tier = await events.addTier('organizer', event.id, { name: 'VIP', priceCents: 2500000, capacity: CAPACITY });
  await events.publishEvent('organizer', event.id);
  for (let seat = 1; seat < CAPACITY; seat += 1) {
    await bookings.book(`early-bird-${seat}`, { tierId: tier.id, quantity: 1 });
  }
  return { db, repository, bookings, tier };
}

// The Build 4 booking code, copied here so we can still see the bug.
function build4Book(repository) {
  return async (userId, { tierId, quantity }) => {
    const tier = await repository.findTier(tierId);
    const event = await repository.findEvent(tier.eventId);
    assertSeatsAvailable(tier, quantity);
    await repository.updateTier({ ...tier, sold: tier.sold + quantity }); // lost update
    return repository.insertBooking({
      id: newId(),
      reference: referenceCode(),
      userId,
      eventId: event.id,
      tierId,
      quantity,
      amountCents: tier.priceCents * quantity,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  };
}

async function run(label, chooseBook) {
  const scenario = await lastSeatScenario();
  const { db, repository, tier } = scenario;
  const book = chooseBook(scenario);
  const before = await repository.findTier(tier.id);

  // Everyone presses Buy at the same moment.
  const results = await Promise.allSettled(
    Array.from({ length: ATTENDEES }, (_, i) => book(`attendee-${i + 1}`, { tierId: tier.id, quantity: 1 })),
  );

  const succeeded = results.filter((result) => result.status === 'fulfilled').length;
  const soldOut = results.filter(
    (result) => result.status === 'rejected' && result.reason instanceof DomainError && result.reason.code === 'SOLD_OUT',
  ).length;
  const after = await repository.findTier(tier.id);
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM bookings WHERE tier_id = ? AND status <> 'cancelled'")
    .get(tier.id);

  console.log(`\n${label}`);
  console.log(`  seats left before:        ${before.capacity - before.sold}`);
  console.log(`  bookings that succeeded:  ${succeeded}`);
  console.log(`  refused with SOLD_OUT:    ${soldOut}`);
  console.log(`  "sold" column afterwards: ${after.sold} of ${after.capacity}`);
  console.log(`  bookings in the database: ${count} for ${after.capacity} seats`);
  console.log(count > after.capacity ? '  OVERSOLD: more bookings than seats.' : '  OK: one person got the last seat.');
  repository.close();
}

console.log(`${ATTENDEES} attendees try to book the last seat at the same moment.`);
await run('Before: the Build 4 way (read, check in JavaScript, then write)', ({ repository }) => build4Book(repository));
await run('After: the Build 5 way (one atomic UPDATE in the database)', ({ bookings }) => (userId, input) => bookings.book(userId, input));
