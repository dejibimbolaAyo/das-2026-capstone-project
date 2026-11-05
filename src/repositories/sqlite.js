// Build 5: the same repository as memory.js, stored in SQLite.
// It only reads and writes. Every rule lives in the services (and the
// constraints in src/db/schema.sql).
//
// Every query uses ? placeholders, so a value can never be read as SQL.
// The statements are prepared once, when the repository is created.

import { openDatabase } from '../db/connection.js';

// Rows use snake_case columns; the rest of the app uses camelCase objects.
// Empty optional columns (NULL) are left out, the same as in memory.js.
function withoutNulls(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
}

const toEvent = (row) =>
  row && {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    city: row.city,
    venue: row.venue,
    startsAt: row.starts_at,
    status: row.status,
  };

const toTier = (row) =>
  row && {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
  };

const toBooking = (row) =>
  row &&
  withoutNulls({
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    eventId: row.event_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    chargeId: row.charge_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
  });

export function createSqliteRepository({ path, db = openDatabase(path) } = {}) {
  const sql = {
    ensureUser: db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)'),

    insertEvent: db.prepare(
      `INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    findEvent: db.prepare('SELECT * FROM events WHERE id = ?'),
    updateEvent: db.prepare(
      `UPDATE events SET title = ?, city = ?, venue = ?, starts_at = ?, status = ?
       WHERE id = ?`,
    ),
    listEvents: db.prepare('SELECT * FROM events ORDER BY rowid'),

    insertTier: db.prepare(
      `INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    findTier: db.prepare('SELECT * FROM ticket_tiers WHERE id = ?'),
    updateTier: db.prepare(
      'UPDATE ticket_tiers SET name = ?, price_cents = ?, capacity = ?, sold = ? WHERE id = ?',
    ),
    listTiersForEvent: db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY rowid'),

    // THE OVERSELLING FIX. Checking for room and taking the seats happen in one
    // statement, so SQLite does both or neither. If two requests race for the
    // last seat, the second one finds `sold + ? <= capacity` is false and
    // changes no row.
    reserveSeats: db.prepare(
      'UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity',
    ),
    releaseSeats: db.prepare('UPDATE ticket_tiers SET sold = sold - ? WHERE id = ? AND sold >= ?'),

    insertBooking: db.prepare(
      `INSERT INTO bookings (id, reference, user_id, event_id, tier_id, quantity, amount_cents,
                             status, charge_id, created_at, paid_at, cancelled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    findBookingByReference: db.prepare('SELECT * FROM bookings WHERE reference = ?'),
    updateBooking: db.prepare(
      `UPDATE bookings SET status = ?, charge_id = ?, paid_at = ?, cancelled_at = ?
       WHERE reference = ?`,
    ),
  };

  const findEvent = (id) => toEvent(sql.findEvent.get(id));
  const findTier = (id) => toTier(sql.findTier.get(id));
  const findBooking = (reference) => toBooking(sql.findBookingByReference.get(reference));

  return {
    async insertEvent(event) {
      sql.ensureUser.run(event.organizerId);
      sql.insertEvent.run(
        event.id,
        event.organizerId,
        event.title,
        event.city,
        event.venue,
        event.startsAt,
        event.status,
      );
      return findEvent(event.id);
    },
    async findEvent(id) {
      return findEvent(id);
    },
    async updateEvent(event) {
      sql.updateEvent.run(event.title, event.city, event.venue, event.startsAt, event.status, event.id);
      return findEvent(event.id);
    },
    async listEvents() {
      return sql.listEvents.all().map(toEvent);
    },

    async insertTier(tier) {
      sql.insertTier.run(tier.id, tier.eventId, tier.name, tier.priceCents, tier.capacity, tier.sold);
      return findTier(tier.id);
    },
    async findTier(id) {
      return findTier(id);
    },
    async updateTier(tier) {
      sql.updateTier.run(tier.name, tier.priceCents, tier.capacity, tier.sold, tier.id);
      return findTier(tier.id);
    },
    async listTiersForEvent(eventId) {
      return sql.listTiersForEvent.all(eventId).map(toTier);
    },

    // true if the seats were taken, false if there was not enough room.
    async reserveSeats(tierId, quantity) {
      return sql.reserveSeats.run(quantity, tierId, quantity).changes === 1;
    },
    // true if the seats were given back.
    async releaseSeats(tierId, quantity) {
      return sql.releaseSeats.run(quantity, tierId, quantity).changes === 1;
    },

    async insertBooking(booking) {
      sql.ensureUser.run(booking.userId);
      sql.insertBooking.run(
        booking.id,
        booking.reference,
        booking.userId,
        booking.eventId,
        booking.tierId,
        booking.quantity,
        booking.amountCents,
        booking.status,
        booking.chargeId ?? null,
        booking.createdAt,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
      );
      return findBooking(booking.reference);
    },
    async findBookingByReference(reference) {
      return findBooking(reference);
    },
    async updateBooking(booking) {
      sql.updateBooking.run(
        booking.status,
        booking.chargeId ?? null,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
        booking.reference,
      );
      return findBooking(booking.reference);
    },

    close() {
      if (db.isOpen) db.close();
    },
  };
}
