import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { signToken } from "../src/tokens.js";

// Since Build 7 every service call needs to know WHO is asking (the "actor").
// The older tests (Builds 4 and 5) were about booking rules, not about logins, so they use these
// helpers: the same services, but with one real organizer and one real attendee already filled in.
// The new login, role and ownership tests (test/auth.test.js) use the plain services and say who is asking.
function ensureUser(store, name, email, role) {
  const found = store.users.findByEmail(email);
  const user = found ?? store.users.create({ name, email, passwordHash: "not-a-real-hash", role });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export const organizerOf = (store) => ensureUser(store, "Test Organizer", "organizer@test.example", "organizer");
export const attendeeOf = (store) => ensureUser(store, "Test Attendee", "attendee@test.example", "attendee");

export function createEventServiceAsOrganizer(store, options) {
  const org = organizerOf(store);
  const s = createEventService(store, options);
  return {
    ...s,
    create: (input) => s.create(input, org),
    get: (id) => s.get(id, org),
    addTier: (id, tier) => s.addTier(id, tier, org),
    publish: (id) => s.publish(id, org),
    unpublish: (id) => s.unpublish(id, org),
  };
}

export function createBookingServiceAsAttendee(store, options) {
  const att = attendeeOf(store);
  const s = createBookingService(store, options);
  return {
    ...s,
    book: (eventId, tierId, name, qty) => s.book(eventId, tierId, name, qty, att),
    find: (ref) => s.find(ref, att),
    pay: (ref, token) => s.pay(ref, token, att),
    cancel: (ref) => s.cancel(ref, att),
    cancelUnpaid: (ref) => s.cancelUnpaid(ref, att),
  };
}

// For tests that talk to a real server over HTTP: a server made with tokenSecret: TEST_SECRET
// accepts these tokens, so the test can act as the organizer or the attendee.
export const TEST_SECRET = "test-secret-for-the-tests-only";
export const tokenFor = (user, now = Date.now()) => signToken({ sub: user.id, role: user.role }, TEST_SECRET, { now });
export const bearer = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
