// Build 5: the last-ticket problem, shown before and after the fix.
//
//   npm run oversell
//
// 50 people try to buy the SAME last seat at the same moment.
//   - "before" reproduces the Build 4 way: read the seat count, check it in
//     JavaScript, then write. Two awaits open a gap, so many callers pass the
//     check and every one of them gets a booking.
//   - "after" uses the repository's one-statement reserve, so exactly one wins.
//
// It runs against a throwaway in-memory SQLite database, so it never touches
// your real data.

import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { DomainError } from '../src/domain/errors.js';
import { newId, referenceCode } from '../src/domain/ids.js';
import { seatsLeft } from '../src/domain/inventory.js';

const ATTEMPTS = 50;

// A fresh database with one published event that has a single seat left.
async function freshLastSeat() {
  const repository = createSqliteRepository({ path: ':memory:' });
  const events = createEventService(repository);
  const bookings = createBookingService(repository, createMockPaymentGateway());

  const event = await events.createEvent({
    title: 'Last Seat',
    city: 'Lagos',
    venue: 'Small Hall',
    startsAt: '2026-06-01T18:00:00Z',
    organizerId: 'organizer-ada',
  });
  const tier = await events.addTier(event.id, { name: 'Final', priceCents: 1000, capacity: 1 });
  await events.publishEvent(event.id);

  return { repository, bookings, tier };
}

// The Build 4 "check then write" booking. The `await findBookingByReference`
// is the gap where other callers read the same seat count.
async function naiveBook(repository, tierId, userId) {
  const tier = await repository.findTierById(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  if (seatsLeft(tier) < 1) throw new DomainError('SOLD_OUT', `${tier.name} is sold out`);

  const reference = referenceCode();
  await repository.findBookingByReference(reference); // opens the race

  tier.sold += 1;
  await repository.saveTier(tier);
  return repository.saveBooking({
    id: newId(),
    reference,
    userId,
    tierId,
    quantity: 1,
    amountCents: tier.priceCents,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

async function scenario(label, attempt) {
  const { repository, bookings, tier } = await freshLastSeat();
  const results = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, () => attempt({ repository, bookings, tier })),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const soldOut = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof DomainError && r.reason.code === 'SOLD_OUT',
  ).length;
  const other = ATTEMPTS - succeeded - soldOut;

  const after = await repository.findTierById(tier.id);
  const bookingsInDb = (await repository.listBookings()).length;

  console.log(
    `${label}\n` +
    `  ${succeeded} booking(s) created, ${soldOut} SOLD_OUT, ${other} other error(s)\n` +
    `  seats sold = ${after.sold} of ${after.capacity}, bookings in database = ${bookingsInDb}\n`,
  );

  repository.close();
}

async function main() {
  console.log(`\n${ATTEMPTS} people race for the last of 1 seat\n`);

  await scenario('BEFORE (check in JS, then write):', ({ repository, tier }) =>
    naiveBook(repository, tier.id, 'attendee-grace'));

  await scenario('AFTER (one atomic UPDATE reserves the seat):', ({ bookings, tier }) =>
    bookings.book({ tierId: tier.id, userId: 'attendee-grace', quantity: 1 }));

  console.log('Expected after the fix: 1 booking, 49 SOLD_OUT, seats sold = 1 of 1.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
