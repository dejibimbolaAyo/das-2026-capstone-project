import { performance } from "node:perf_hooks";

const bookingCount = 30_000;
const lookupCount = 2_000;
const bookings = Array.from({ length: bookingCount }, (_, index) => ({
  reference: `BOOKING-${index}`,
}));
const bookingsByReference = new Map(
  bookings.map((booking) => [booking.reference, booking]),
);
const targetReference = bookings[bookings.length - 1].reference;

function timeLookups(lookup) {
  const start = performance.now();
  let found = null;
  for (let index = 0; index < lookupCount; index += 1) {
    found = lookup(targetReference);
  }
  return { milliseconds: performance.now() - start, found };
}

const mapResult = timeLookups((reference) => bookingsByReference.get(reference));
const arrayResult = timeLookups((reference) =>
  bookings.find((booking) => booking.reference === reference),
);

if (!mapResult.found || !arrayResult.found) {
  throw new Error("Benchmark target booking was not found.");
}

console.log(`Bookings: ${bookingCount}; lookups: ${lookupCount} (last item each time)`);
console.log(`Map.get:    ${mapResult.milliseconds.toFixed(2)} ms`);
console.log(`Array.find: ${arrayResult.milliseconds.toFixed(2)} ms`);
console.log("Expected lookup complexity: Map O(1) average; Array.find O(n).");
