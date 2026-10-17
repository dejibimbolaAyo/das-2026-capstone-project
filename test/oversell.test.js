// Build 5, S08: the last seat must go to exactly one person.
//
// The first test is the real requirement: 50 simultaneous bookings for one seat
// give exactly 1 success and 49 SOLD_OUT, and sold never passes capacity.
//
// It only passes because the repository reserves the seat with a single atomic
// UPDATE. The second test proves the assertion is worth something: the old
// "check in JavaScript, then write" booking really does oversell.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { DomainError } from '../src/domain/errors.js';
import { newId, referenceCode } from '../src/domain/ids.js';
import { seatsLeft } from '../src/domain/inventory.js';

const ATTEMPTS = 50;

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

function countByOutcome(results) {
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const soldOut = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof DomainError && r.reason.code === 'SOLD_OUT',
  ).length;
  return { succeeded, soldOut };
}

test('S08: 50 simultaneous bookings for the last seat give exactly one success', async () => {
  const { repository, bookings, tier } = await freshLastSeat();

  const results = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, () =>
      bookings.book({ tierId: tier.id, userId: 'attendee-grace', quantity: 1 })),
  );

  const { succeeded, soldOut } = countByOutcome(results);
  assert.equal(succeeded, 1, 'exactly one booking should win the seat');
  assert.equal(soldOut, ATTEMPTS - 1, 'everyone else should be told SOLD_OUT');

  const after = await repository.findTierById(tier.id);
  assert.equal(after.sold, 1);
  assert.ok(after.sold <= after.capacity, 'seats sold must never exceed capacity');

  const bookingsInDb = await repository.listBookings();
  assert.equal(bookingsInDb.length, 1);

  repository.close();
});

test('the old check-then-write booking really does oversell (so the test above is meaningful)', async () => {
  const { repository, tier } = await freshLastSeat();

  // Exactly what Build 4 did: read the tier, check in JavaScript, then write.
  async function naiveBook() {
    const row = await repository.findTierById(tier.id);
    if (seatsLeft(row) < 1) throw new DomainError('SOLD_OUT', `${row.name} is sold out`);
    const reference = referenceCode();
    await repository.findBookingByReference(reference); // the gap that opens the race
    row.sold += 1;
    await repository.saveTier(row);
    return repository.saveBooking({
      id: newId(),
      reference,
      userId: 'attendee-grace',
      tierId: tier.id,
      quantity: 1,
      amountCents: row.priceCents,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }

  const results = await Promise.allSettled(
    Array.from({ length: ATTEMPTS }, () => naiveBook()),
  );

  const { succeeded } = countByOutcome(results);
  assert.ok(succeeded > 1, `the racy booking should oversell, but only ${succeeded} succeeded`);

  const bookingsInDb = await repository.listBookings();
  assert.ok(bookingsInDb.length > 1, 'the racy path should create more bookings than seats');

  repository.close();
});
