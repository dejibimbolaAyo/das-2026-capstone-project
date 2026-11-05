// Build 5: the SQLite repository and the constraints in src/db/schema.sql.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createBookingService } from '../src/services/bookingService.js';
import { createEventService } from '../src/services/eventService.js';

function services(repository) {
  return {
    events: createEventService({ repository }),
    bookings: createBookingService({ repository, paymentGateway: createMockPaymentGateway() }),
  };
}

async function publishedTier(events, tier = {}) {
  const event = await events.createEvent('org-1', { title: 'Lagos Tech Meetup', city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' });
  const added = await events.addTier('org-1', event.id, { name: 'General', priceCents: 500000, capacity: 5, ...tier });
  await events.publishEvent('org-1', event.id);
  return { event, tier: added };
}

describe('SQLite repository', () => {
  it('keeps its data after the database is closed and opened again (a server restart)', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ticketing-'));
    const path = join(directory, 'ticketing.db');
    try {
      const first = createSqliteRepository({ path });
      const { events, bookings } = services(first);
      const { event, tier } = await publishedTier(events);
      const booking = await bookings.book('ada', { tierId: tier.id, quantity: 2 });
      await bookings.pay('ada', booking.reference, { paymentToken: 'tok_success' });
      first.close();

      const second = createSqliteRepository({ path });
      const again = services(second);
      const view = await again.events.getEvent('someone', event.id);
      assert.equal(view.title, 'Lagos Tech Meetup');
      assert.equal(view.tiers[0].seatsLeft, 3);
      const saved = await again.bookings.getBooking('ada', booking.reference);
      assert.equal(saved.status, 'paid');
      assert.equal(saved.quantity, 2);
      second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns records shaped like the in-memory repository, without empty fields', async () => {
    const repository = createSqliteRepository();
    const { events, bookings } = services(repository);
    const { tier } = await publishedTier(events);
    const booking = await bookings.book('ada', { tierId: tier.id, quantity: 1 });
    const stored = await repository.findBookingByReference(booking.reference);
    assert.deepEqual(Object.keys(stored).sort(), [
      'amountCents', 'createdAt', 'eventId', 'id', 'quantity', 'reference', 'status', 'tierId', 'userId',
    ]);
    assert.equal(await repository.findTier('missing'), undefined);
    repository.close();
  });

  it('treats a value that looks like SQL as plain text (placeholders, not string joining)', async () => {
    const repository = createSqliteRepository();
    const { events } = services(repository);
    const title = "Robert'); DROP TABLE events; --";
    const created = await events.createEvent('org-1', { title, city: 'Lagos', startsAt: '2026-12-05T17:00:00Z' });
    assert.equal((await repository.findEvent(created.id)).title, title);
    assert.equal(await repository.findEvent("' OR '1'='1"), undefined);
    assert.equal((await repository.listEvents()).length, 1);
    repository.close();
  });

  it('reserveSeats takes seats only while there is room, and releaseSeats gives them back', async () => {
    const repository = createSqliteRepository();
    const { events } = services(repository);
    const { tier } = await publishedTier(events, { capacity: 3 });
    assert.equal(await repository.reserveSeats(tier.id, 2), true);
    assert.equal(await repository.reserveSeats(tier.id, 2), false);
    assert.equal(await repository.reserveSeats(tier.id, 1), true);
    assert.equal((await repository.findTier(tier.id)).sold, 3);
    assert.equal(await repository.releaseSeats(tier.id, 3), true);
    assert.equal(await repository.releaseSeats(tier.id, 1), false); // never below 0
    assert.equal((await repository.findTier(tier.id)).sold, 0);
    repository.close();
  });
});

describe('database constraints', () => {
  function seededDatabase() {
    const db = openDatabase();
    db.prepare('INSERT INTO users (id) VALUES (?)').run('org-1');
    db.prepare(
      "INSERT INTO events (id, organizer_id, title, city, starts_at) VALUES ('e1', 'org-1', 'T', 'Lagos', '2026-12-05')",
    ).run();
    db.prepare(
      "INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity) VALUES ('t1', 'e1', 'General', 100, 2)",
    ).run();
    return db;
  }

  it('CHECK refuses to store more seats sold than the capacity, or fewer than 0', () => {
    const db = seededDatabase();
    assert.throws(() => db.prepare("UPDATE ticket_tiers SET sold = 3 WHERE id = 't1'").run(), /CHECK constraint failed/);
    assert.throws(() => db.prepare("UPDATE ticket_tiers SET sold = -1 WHERE id = 't1'").run(), /CHECK constraint failed/);
    db.close();
  });

  it('CHECK refuses money that is not whole cents, and unknown statuses', () => {
    const db = seededDatabase();
    assert.throws(
      () => db.prepare("INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity) VALUES ('t2', 'e1', 'X', 9.99, 1)").run(),
      /CHECK constraint failed/,
    );
    assert.throws(() => db.prepare("UPDATE events SET status = 'archived' WHERE id = 'e1'").run(), /CHECK constraint failed/);
    db.close();
  });

  it('FOREIGN KEY refuses a booking for a tier that does not exist', () => {
    const db = seededDatabase();
    db.prepare('INSERT INTO users (id) VALUES (?)').run('ada');
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO bookings (id, reference, user_id, event_id, tier_id, quantity, amount_cents, status, created_at)
             VALUES ('b1', 'ABCDEFGH', 'ada', 'e1', 'no-such-tier', 1, 100, 'pending', '2026-01-01')`,
          )
          .run(),
      /FOREIGN KEY constraint failed/,
    );
    db.close();
  });

  it('UNIQUE refuses two bookings with the same reference', () => {
    const db = seededDatabase();
    db.prepare('INSERT INTO users (id) VALUES (?)').run('ada');
    const insert = db.prepare(
      `INSERT INTO bookings (id, reference, user_id, event_id, tier_id, quantity, amount_cents, status, created_at)
       VALUES (?, 'ABCDEFGH', 'ada', 'e1', 't1', 1, 100, 'pending', '2026-01-01')`,
    );
    insert.run('b1');
    assert.throws(() => insert.run('b2'), /UNIQUE constraint failed/);
    db.close();
  });
});
