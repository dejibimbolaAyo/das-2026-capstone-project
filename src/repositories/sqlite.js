// Build 5/7: SQLite repository with users
import { openDatabase } from '../db/connection.js';

function rowToTier(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
  };
}

function rowToBooking(row) {
  const booking = {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    tierId: row.tier_id,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
  };
  if (row.payment_id) booking.paymentId = row.payment_id;
  if (row.paid_at) booking.paidAt = row.paid_at;
  if (row.cancelled_at) booking.cancelledAt = row.cancelled_at;
  return booking;
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
  };
}

export function createSqliteRepository({ db, path = ':memory:' } = {}) {
  const database = db ?? openDatabase(path);

  const sql = {
    insertUser: database.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)'),
    upsertUser: database.prepare(`
      INSERT INTO users (id, email, password_hash, role)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        password_hash = excluded.password_hash,
        role = excluded.role
    `),
    getUserById: database.prepare('SELECT * FROM users WHERE id = ?'),
    getUserByEmail: database.prepare('SELECT * FROM users WHERE lower(email) = lower(?)'),

    upsertEvent: database.prepare(`
      INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        organizer_id = excluded.organizer_id,
        title        = excluded.title,
        city         = excluded.city,
        venue        = excluded.venue,
        starts_at    = excluded.starts_at,
        status       = excluded.status
    `),
    getEvent: database.prepare('SELECT * FROM events WHERE id = ?'),
    listEvents: database.prepare('SELECT * FROM events ORDER BY title, id'),
    tierIdsForEvent: database.prepare('SELECT id FROM ticket_tiers WHERE event_id = ? ORDER BY rowid'),

    upsertTier: database.prepare(`
      INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name        = excluded.name,
        price_cents = excluded.price_cents,
        capacity    = excluded.capacity,
        sold        = excluded.sold
    `),
    getTier: database.prepare('SELECT * FROM ticket_tiers WHERE id = ?'),
    listTiers: database.prepare('SELECT * FROM ticket_tiers ORDER BY rowid'),

    reserveSeats: database.prepare(
      'UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity',
    ),
    releaseSeats: database.prepare(
      'UPDATE ticket_tiers SET sold = sold - ? WHERE id = ? AND sold >= ?',
    ),

    upsertBooking: database.prepare(`
      INSERT INTO bookings
        (id, reference, user_id, tier_id, quantity, amount_cents, status, payment_id, created_at, paid_at, cancelled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status       = excluded.status,
        payment_id   = excluded.payment_id,
        paid_at      = excluded.paid_at,
        cancelled_at = excluded.cancelled_at
    `),
    getBookingByReference: database.prepare('SELECT * FROM bookings WHERE reference = ?'),
    listBookings: database.prepare('SELECT * FROM bookings ORDER BY created_at, id'),
    listBookingsForUser: database.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at, id'),
  };

  function findEventById(id) {
    const row = sql.getEvent.get(id);
    if (!row) return null;
    const tierIds = sql.tierIdsForEvent.all(id).map((tier) => tier.id);
    return {
      id: row.id,
      organizerId: row.organizer_id,
      title: row.title,
      city: row.city,
      venue: row.venue,
      startsAt: row.starts_at,
      status: row.status,
      tierIds,
    };
  }

  function findBookingByReference(reference) {
    const row = sql.getBookingByReference.get(reference);
    return row ? rowToBooking(row) : null;
  }

  return {
    async saveUser(user) {
      sql.upsertUser.run(user.id, user.email || null, user.passwordHash || null, user.role || 'attendee');
      return rowToUser(sql.getUserById.get(user.id));
    },
    async findUserById(id) {
      return rowToUser(sql.getUserById.get(id));
    },
    async findUserByEmail(email) {
      if (!email) return null;
      return rowToUser(sql.getUserByEmail.get(email));
    },

    async saveEvent(event) {
      sql.insertUser.run(event.organizerId);
      sql.upsertEvent.run(
        event.id,
        event.organizerId,
        event.title,
        event.city,
        event.venue ?? '',
        event.startsAt,
        event.status ?? 'draft',
      );
      return findEventById(event.id);
    },
    async findEventById(id) {
      return findEventById(id);
    },
    async listEvents() {
      return sql.listEvents.all().map((row) => findEventById(row.id));
    },

    async saveTier(tier) {
      sql.upsertTier.run(
        tier.id,
        tier.eventId,
        tier.name,
        tier.priceCents,
        tier.capacity,
        tier.sold ?? 0,
      );
      return rowToTier(sql.getTier.get(tier.id));
    },
    async findTierById(id) {
      const row = sql.getTier.get(id);
      return row ? rowToTier(row) : null;
    },
    async listTiers() {
      return sql.listTiers.all().map(rowToTier);
    },

    async reserveSeats(tierId, quantity) {
      const info = sql.reserveSeats.run(quantity, tierId, quantity);
      return Number(info.changes) > 0;
    },
    async releaseSeats(tierId, quantity) {
      const info = sql.releaseSeats.run(quantity, tierId, quantity);
      return Number(info.changes) > 0;
    },

    async saveBooking(booking) {
      sql.insertUser.run(booking.userId);
      sql.upsertBooking.run(
        booking.id,
        booking.reference,
        booking.userId,
        booking.tierId,
        booking.quantity,
        booking.amountCents,
        booking.status,
        booking.paymentId ?? null,
        booking.createdAt,
        booking.paidAt ?? null,
        booking.cancelledAt ?? null,
      );
      return findBookingByReference(booking.reference);
    },
    async findBookingByReference(reference) {
      return findBookingByReference(reference);
    },
    async listBookings() {
      return sql.listBookings.all().map(rowToBooking);
    },
    async listBookingsForUser(userId) {
      return sql.listBookingsForUser.all(userId).map(rowToBooking);
    },

    close() {
      database.close();
    },
  };
}
