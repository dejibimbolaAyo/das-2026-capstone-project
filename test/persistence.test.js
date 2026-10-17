// Build 5: data must survive a restart.
//
// We write to a real file, close the database handle (as a shutdown would), then
// open the same file again and check the rows are still there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

test('an event and a paid booking survive closing and reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ticketing-'));
  const path = join(dir, 'test.db');

  let reference;

  // --- first "run" ---
  {
    const repository = createSqliteRepository({ path });
    const events = createEventService(repository);
    const bookings = createBookingService(repository, createMockPaymentGateway());

    const event = await events.createEvent({
      title: 'Persisted Night',
      city: 'Lagos',
      venue: 'The Shrine',
      startsAt: '2026-07-01T19:00:00Z',
      organizerId: 'organizer-ada',
    });
    const tier = await events.addTier(event.id, { name: 'General', priceCents: 4200, capacity: 10 });
    await events.publishEvent(event.id);

    const booking = await bookings.book({ tierId: tier.id, userId: 'attendee-grace', quantity: 2 });
    await bookings.pay({ reference: booking.reference, userId: 'attendee-grace', card: 'ok' });
    reference = booking.reference;

    repository.close(); // simulate the server shutting down
  }

  // --- second "run": same file ---
  {
    const repository = createSqliteRepository({ path });

    const events = await repository.listEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Persisted Night');
    assert.equal(events[0].status, 'published');
    assert.equal(events[0].tierIds.length, 1);

    const tier = (await repository.listTiers())[0];
    assert.equal(tier.sold, 2);
    assert.equal(tier.priceCents, 4200);

    const booking = await repository.findBookingByReference(reference);
    assert.equal(booking.status, 'paid');
    assert.equal(booking.amountCents, 8400);
    assert.ok(booking.paymentId);

    repository.close();
  }

  rmSync(dir, { recursive: true, force: true });
});
