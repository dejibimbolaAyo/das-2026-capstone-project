// Makes lots of repeatable, made-up events for testing search and paging.
// Used by scripts/seed.js and scripts/seed-bulk.js.

import { newId } from '../../src/domain/ids.js';

// A tiny repeatable random number generator (mulberry32), so runs match.
let state = 20260101;
function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + Math.floor(random() * (max - min + 1));

const CITIES = {
  Lagos: ['Landmark Centre', 'Eko Hotel', 'Muson Centre', 'Terra Kulture', 'Freedom Park'],
  Abuja: ['Transcorp Hilton', 'Bolingo Hotel', 'Eagle Square', 'Jabi Lake Park'],
  Ibadan: ['University of Ibadan', 'Cultural Centre Mokola', 'Premier Hotel'],
  'Port Harcourt': ['Hotel Presidential', 'Pleasure Park', 'Obi Wali Centre'],
  Kano: ['Coronation Hall', 'Sharada Hall'],
  Enugu: ['Hotel Presidential', 'Michael Okpara Square'],
  Accra: ['Accra International Conference Centre', 'Alliance Française'],
  Nairobi: ['KICC', 'Sarit Centre', 'Uhuru Gardens'],
};
const KINDS = ['Tech Meetup', 'Design Summit', 'Afrobeats Night', 'Book Fair', 'Food Festival', 'Startup Pitch Night',
  'Comedy Show', 'Jazz Evening', 'Film Screening', 'Art Exhibition', 'Football Viewing', 'Career Fair',
  'Fashion Week', 'Hackathon', 'Gospel Concert', 'Poetry Slam', 'Yoga Morning', 'Marathon Expo'];
const THEMES = ['Golden', 'Midnight', 'Harmattan', 'Sunrise', 'Rooftop', 'Open Air', 'Founders', 'Community', 'Future',
  'Heritage', 'Neon', 'Savanna', 'Lagoon', 'Unity', 'Summit', 'Rhythm'];
const TIER_NAMES = ['General', 'Regular', 'Early Bird', 'VIP', 'Student', 'Table for 4', 'Backstage'];

// Adds `count` events (and their tiers) in one transaction. Returns how many tiers were added.
export function addBulkEvents(db, organizerId, count, firstNumber = 1) {
  const insertEvent = db.prepare(
    'INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insertTier = db.prepare(
    'INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const firstDay = Date.UTC(2026, 11, 1);
  let tiers = 0;
  db.exec('BEGIN');
  try {
    for (let i = firstNumber; i < firstNumber + count; i += 1) {
      const city = pick(Object.keys(CITIES));
      const startsAt = new Date(firstDay + between(0, 540) * 86_400_000 + between(8, 21) * 3_600_000).toISOString();
      const id = newId();
      const status = random() < 0.92 ? 'published' : 'draft';
      insertEvent.run(id, organizerId, `${pick(THEMES)} ${pick(KINDS)} #${i}`, city, pick(CITIES[city]), startsAt, status);

      const names = [...TIER_NAMES].sort(() => random() - 0.5).slice(0, between(1, 4));
      for (const name of names) {
        const capacity = pick([20, 50, 100, 200, 500, 1000]);
        // Most tiers have some sales, about one in ten is sold out.
        const sold = random() < 0.1 ? capacity : Math.floor(random() * capacity * 0.8);
        const priceCents = random() < 0.08 ? 0 : between(5, 600) * 10_000;
        insertTier.run(newId(), id, name, priceCents, capacity, sold);
        tiers += 1;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return tiers;
}

// Events made by addBulkEvents have a "#number" at the end of the title.
export function countBulkEvents(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM events WHERE title LIKE '% #%'").get().n;
}
