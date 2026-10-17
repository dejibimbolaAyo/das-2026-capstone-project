import { createEvent, addTier, publishEvent } from "./src/events.js";
import { BookingBook } from "./src/bookings.js";

const BOOKINGS = 50_000;
const LOOKUPS = 2_000;

// Build a big pile of bookings.
const event = createEvent({
  id: "big",
  title: "Big Event",
  city: "Lagos",
  venue: "Big Arena",
  date: "2026-12-31",
});
addTier(event, { id: "ga", name: "General", priceCents: 500000, capacity: BOOKINGS });
publishEvent(event);
const book = new BookingBook();
for (let i = 0; i < BOOKINGS; i++) book.book(event, "ga", "Guest " + i, 1);

const list = book.toArray();

// Look up bookings near the END, which is the worst case for Array.find.
const refs = [];
for (let i = 0; i < LOOKUPS; i++) {
  const n = BOOKINGS - i;
  refs.push("BK-" + String(n).padStart(6, "0"));
}

let t = performance.now();
for (const ref of refs) book.find(ref);
const mapMs = performance.now() - t;

t = performance.now();
for (const ref of refs) list.find((b) => b.ref === ref);
const arrayMs = performance.now() - t;

console.log(`${BOOKINGS.toLocaleString()} bookings, ${LOOKUPS.toLocaleString()} lookups`);
console.log(`Map.get    : ${mapMs.toFixed(2)} ms`);
console.log(`Array.find : ${arrayMs.toFixed(2)} ms`);
console.log(`Map was about ${Math.round(arrayMs / Math.max(mapMs, 0.01)).toLocaleString()}x faster.`);
console.log("\nWhy: Map.get goes straight to the answer: O(1).");
console.log("Array.find checks one booking after another: O(n).");
console.log("Double the bookings and Array.find takes about twice as long. Map.get stays the same.");
