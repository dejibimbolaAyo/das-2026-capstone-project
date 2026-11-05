// S08: the last ticket is sold to only one person.
//
// This test must fail if the fix is removed. To check that, put the Build 4
// lines back in bookingService.book (assertSeatsAvailable(tier, quantity) and
// repository.updateTier({ ...tier, sold: tier.sold + quantity })) in place of
// reserveSeats, and run `npm test`: 50 bookings succeed and the test fails.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/connection.js';
import { DomainError } from '../src/domain/errors.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';

const ATTENDEES = 50;

async function setUp(repository, { capacity, alreadySold }) {
  const events = createEventService({ repository });
  const bookings = createBookingService({ repository, paymentGateway: createMockPaymentGateway() });
  const event = await events.createEvent('org-1', { title: 'Last Seat Gala', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' });
  const tier = await events.addTier('org-1', event.id, { name: 'General', priceCents: 500000, capacity });
  await events.publishEvent('org-1', event.id);
  for (let i = 0; i < alreadySold; i += 1) await bookings.book(`early-${i}`, { tierId: tier.id, quantity: 1 });
  return { bookings, tier };
}

async function race(bookings, tierId, quantity = 1) {
  const results = await Promise.allSettled(
    Array.from({ length: ATTENDEES }, (_, i) => bookings.book(`attendee-${i}`, { tierId, quantity })),
  );
  const succeeded = results
    .map((result, i) => ({ ...result, userId: `attendee-${i}` }))
    .filter((result) => result.status === 'fulfilled');
  const failed = results.filter((result) => result.status === 'rejected');
  for (const { reason } of failed) {
    assert.ok(reason instanceof DomainError, `unexpected error: ${reason}`);
    assert.equal(reason.code, 'SOLD_OUT');
  }
  return { succeeded, failed };
}

describe('S08: the last ticket is sold to only one person (SQLite)', () => {
  it('50 attendees at the same moment for 1 seat: exactly 1 succeeds and 49 get SOLD_OUT', async () => {
    const db = openDatabase();
    const repository = createSqliteRepository({ db });
    const { bookings, tier } = await setUp(repository, { capacity: 10, alreadySold: 9 });

    const { succeeded, failed } = await race(bookings, tier.id);

    assert.equal(succeeded.length, 1);
    assert.equal(failed.length, 49);
    const saved = await repository.findTier(tier.id);
    assert.equal(saved.sold, saved.capacity);
    // Count the bookings themselves too: a lost update can leave `sold` looking
    // right while far too many bookings exist.
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM bookings WHERE tier_id = ?').get(tier.id);
    assert.equal(count, 10);
    repository.close();
  });

  it('never sells more seats than the capacity when people ask for several at once', async () => {
    const db = openDatabase();
    const repository = createSqliteRepository({ db });
    const { bookings, tier } = await setUp(repository, { capacity: 7, alreadySold: 0 });

    const { succeeded } = await race(bookings, tier.id, 2);

    assert.equal(succeeded.length, 3); // 3 x 2 = 6 seats; a 4th pair would need 8
    const { total } = db.prepare('SELECT SUM(quantity) AS total FROM bookings WHERE tier_id = ?').get(tier.id);
    assert.equal(total, 6);
    assert.equal((await repository.findTier(tier.id)).sold, 6);
    repository.close();
  });

  it('a seat freed by a cancellation can be won again by exactly one person', async () => {
    const repository = createSqliteRepository();
    const { bookings, tier } = await setUp(repository, { capacity: 1, alreadySold: 0 });
    const [winner] = (await race(bookings, tier.id)).succeeded;
    await bookings.cancel(winner.userId, winner.value.reference);
    assert.equal((await repository.findTier(tier.id)).sold, 0);

    const { succeeded } = await race(bookings, tier.id);
    assert.equal(succeeded.length, 1);
    repository.close();
  });
});

describe('S08: the in-memory repository keeps the same promise', () => {
  it('50 attendees for 1 seat: exactly 1 succeeds', async () => {
    const repository = createMemoryRepository();
    const { bookings, tier } = await setUp(repository, { capacity: 10, alreadySold: 9 });
    const { succeeded, failed } = await race(bookings, tier.id);
    assert.equal(succeeded.length, 1);
    assert.equal(failed.length, 49);
    assert.equal((await repository.findTier(tier.id)).sold, 10);
  });
});
