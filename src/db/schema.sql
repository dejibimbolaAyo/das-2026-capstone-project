-- Build 5: the database schema. Run by src/db/connection.js every time it
-- opens a database. Every statement is IF NOT EXISTS, so running it again on a
-- database that already has data changes nothing.
--
-- The rules that must never be broken live here as constraints, so even a bug
-- in the JavaScript cannot store a booking for a tier that does not exist, or
-- sell more seats than a tier has.

-- Until Build 7 adds signup, a user row is created the first time an id is
-- seen (in the x-user-id header). name, email and role are filled in later.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  email       TEXT UNIQUE,
  role        TEXT CHECK (role IN ('organizer', 'attendee', 'staff')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  organizer_id  TEXT NOT NULL REFERENCES users (id),
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0),
  city          TEXT NOT NULL CHECK (length(trim(city)) > 0),
  venue         TEXT NOT NULL DEFAULT '',
  starts_at     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
);

CREATE TABLE IF NOT EXISTS ticket_tiers (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- Money is always whole cents.
  price_cents  INTEGER NOT NULL CHECK (typeof(price_cents) = 'integer' AND price_cents >= 0),
  capacity     INTEGER NOT NULL CHECK (typeof(capacity) = 'integer' AND capacity >= 1),
  sold         INTEGER NOT NULL DEFAULT 0,
  -- The last line of defence against overselling.
  CHECK (sold >= 0 AND sold <= capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL REFERENCES users (id),
  event_id      TEXT NOT NULL REFERENCES events (id),
  tier_id       TEXT NOT NULL REFERENCES ticket_tiers (id),
  quantity      INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  amount_cents  INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  status        TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded', 'checked_in')),
  charge_id     TEXT,
  created_at    TEXT NOT NULL,
  paid_at       TEXT,
  cancelled_at  TEXT
);

CREATE INDEX IF NOT EXISTS ticket_tiers_event_id ON ticket_tiers (event_id);
CREATE INDEX IF NOT EXISTS bookings_tier_id ON bookings (tier_id);
CREATE INDEX IF NOT EXISTS bookings_user_id ON bookings (user_id);
