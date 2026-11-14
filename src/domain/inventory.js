import { DomainError } from "./errors.js";
import { newId, newReference } from "./ids.js";
import { Queue } from "./waitlistQueue.js";

function invalid(message) {
  throw new DomainError("VALIDATION", message);
}

function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be an object.`);
  }
  return value;
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    invalid(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    invalid(`${label} must be a positive whole number.`);
  }
  return value;
}

function requireStore(store) {
  if (
    store === null ||
    typeof store !== "object" ||
    !(store.events instanceof Map) ||
    !(store.bookingsByReference instanceof Map)
  ) {
    invalid("A store created by createStore() is required.");
  }
  return store;
}

function requireEvent(store, eventId) {
  const id = requireText(eventId, "eventId");
  const event = store.events.get(id);
  if (!event) {
    throw new DomainError("NOT_FOUND", `Event "${id}" was not found.`);
  }
  return event;
}

function requireTier(event, tierId) {
  const id = requireText(tierId, "tierId");
  const tier = event.tiers.get(id);
  if (!tier) {
    throw new DomainError("NOT_FOUND", `Ticket tier "${id}" was not found.`);
  }
  return tier;
}

export function createStore() {
  return {
    events: new Map(),
    bookingsByReference: new Map(),
  };
}

export function createEvent(store, details) {
  requireStore(store);
  requireRecord(details, "Event details");

  const title = requireText(details.title, "title");
  const city = requireText(details.city, "city");
  const venue = requireText(details.venue, "venue");
  const date = requireText(details.date, "date");
  if (!Number.isFinite(Date.parse(date))) {
    invalid("date must be a valid date string.");
  }

  const event = {
    id: newId(),
    title,
    city,
    venue,
    date,
    tiers: new Map(),
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, details) {
  requireStore(store);
  const event = requireEvent(store, eventId);
  requireRecord(details, "Ticket tier details");

  const name = requireText(details.name, "name");
  if (!Number.isSafeInteger(details.priceCents) || details.priceCents < 0) {
    invalid("priceCents must be a non-negative whole number of cents.");
  }
  const capacity = requirePositiveInteger(details.capacity, "capacity");

  for (const existingTier of event.tiers.values()) {
    if (existingTier.name.toLowerCase() === name.toLowerCase()) {
      throw new DomainError("CONFLICT", `A ticket tier named "${name}" already exists.`);
    }
  }

  const tier = {
    id: newId(),
    eventId: event.id,
    name,
    priceCents: details.priceCents,
    capacity,
    available: capacity,
    waitlist: new Queue(),
  };
  event.tiers.set(tier.id, tier);
  return tier;
}

export function bookTickets(store, details) {
  requireStore(store);
  requireRecord(details, "Booking details");

  const event = requireEvent(store, details.eventId);
  const tier = requireTier(event, details.tierId);
  const attendeeName = requireText(details.attendeeName, "attendeeName");
  const quantity = requirePositiveInteger(details.quantity, "quantity");
  if (quantity > 10) {
    invalid("quantity cannot be more than 10 tickets.");
  }

  if (tier.available < quantity) {
    throw new DomainError("SOLD_OUT", `Only ${tier.available} ticket(s) remain.`);
  }

  const booking = {
    id: newId(),
    reference: newReference(),
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    quantity,
    totalCents: tier.priceCents * quantity,
    status: "CONFIRMED",
    bookedAt: new Date().toISOString(),
  };

  tier.available -= quantity;
  store.bookingsByReference.set(booking.reference, booking);
  return booking;
}

export function cancelBooking(store, reference) {
  requireStore(store);
  const code = requireText(reference, "reference");
  const booking = store.bookingsByReference.get(code);
  if (!booking) {
    throw new DomainError("NOT_FOUND", `Booking "${code}" was not found.`);
  }
  if (booking.status === "CANCELLED") {
    throw new DomainError("INVALID_STATE", "This booking has already been cancelled.");
  }

  const event = requireEvent(store, booking.eventId);
  const tier = requireTier(event, booking.tierId);
  if (tier.available + booking.quantity > tier.capacity) {
    throw new DomainError("INVALID_STATE", "Cancelling this booking would exceed tier capacity.");
  }

  tier.available += booking.quantity;
  booking.status = "CANCELLED";
  booking.cancelledAt = new Date().toISOString();
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  const code = requireText(reference, "reference");
  const booking = store.bookingsByReference.get(code);
  if (!booking) {
    throw new DomainError("NOT_FOUND", `Booking "${code}" was not found.`);
  }
  return booking;
}

export function joinWaitlist(store, details) {
  requireStore(store);
  requireRecord(details, "Waitlist entry details");

  const event = requireEvent(store, details.eventId);
  const tier = requireTier(event, details.tierId);
  const attendeeName = requireText(details.attendeeName, "attendeeName");
  if (tier.available > 0) {
    throw new DomainError("NOT_SOLD_OUT", "Join the waitlist only when the tier is sold out.");
  }

  const entry = {
    id: newId(),
    eventId: event.id,
    tierId: tier.id,
    attendeeName,
    joinedAt: new Date().toISOString(),
  };
  tier.waitlist.enqueue(entry);
  return entry;
}
