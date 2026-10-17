import { createSqliteStore } from "../src/data/sqliteStore.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { createWaitlistService } from "../src/services/waitlistService.js";
import { createSeatService } from "../src/services/seatService.js";
import { createMaintenance } from "../src/jobs/maintenance.js";
import { createFakeClock } from "../src/lib/clock.js";
import { eventStartsAt } from "../src/domain/refundPolicy.js";

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// A little world for the Build 8 tests: a store, a clock we control, the services, and some people.
// Nothing here knows about HTTP. The clock only moves when a test moves it.
//   world.org            the organizer who owns the event
//   world.ada .. world.dee   four attendees
//   world.eventId / world.tierId   a published event with one tier
export function makeWorld({
  file = ":memory:",
  start = "2026-06-01T12:00:00Z",
  eventDate = "2026-12-05",
  capacity = 3,
  priceCents = 500000,
} = {}) {
  const store = createSqliteStore(file);
  const clock = createFakeClock(start);
  const options = { now: () => clock.now() };
  const events = createEventService(store);
  const bookings = createBookingService(store, options);
  const waitlist = createWaitlistService(store, options);
  const seats = createSeatService(store, options);
  const maintenance = createMaintenance({ seats });

  const person = (name, role) => {
    const u = store.users.create({ name, email: `${name.toLowerCase()}@test.example`, passwordHash: "x", role });
    return { id: u.id, name: u.name, email: u.email, role: u.role };
  };
  const org = person("Olu", "organizer");
  const ada = person("Ada", "attendee");
  const bayo = person("Bayo", "attendee");
  const chidi = person("Chidi", "attendee");
  const dee = person("Dee", "attendee");

  const event = events.create({ title: "Test Night", city: "Lagos", venue: "Hall", date: eventDate }, org);
  const tier = events.addTier(event.id, { id: "T1", name: "Regular", priceCents, capacity }, org);
  events.publish(event.id, org);

  const world = {
    store, clock, events, bookings, waitlist, seats, maintenance,
    org, ada, bayo, chidi, dee,
    eventId: event.id,
    tierId: tier.id,
    startsAt: eventStartsAt(eventDate),
    tierNow: () => store.requireEvent(event.id).tiers.get(tier.id),
    sold: () => world.tierNow().sold,
    left: () => world.tierNow().capacity - world.tierNow().sold,
    book: (who, quantity = 1) => bookings.book(event.id, tier.id, who.name, quantity, who),
    bookAndPay: (who, quantity = 1) => {
      const b = world.book(who, quantity);
      return bookings.pay(b.ref, "tok_success", who);
    },
    fillUp: (who = ada) => world.book(who, capacity),
    close: () => store.close(),
  };
  return world;
}
