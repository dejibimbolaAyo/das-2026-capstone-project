import { createEvent, addTier, publishEvent } from "../src/events.js";

// A small helper so each test can make an event in one line.
export function makeEvent({
  id = "e1",
  title = "Test Event",
  city = "Lagos",
  venue = "Test Hall",
  date = "2026-12-05",
  priceCents = 500000,
  capacity = 3,
  publish = true,
} = {}) {
  const event = createEvent({ id, title, city, venue, date });
  addTier(event, { id: "ga", name: "General", priceCents, capacity });
  if (publish) publishEvent(event);
  return event;
}
