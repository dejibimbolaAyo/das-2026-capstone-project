
import { performance } from "node:perf_hooks";

const TOTAL_BOOKINGS = 100_000;
const TOTAL_LOOKUPS = 500;

// Create 100,000 sample bookings.
const bookings = [];

for (let i = 0; i < TOTAL_BOOKINGS; i++) {
  bookings.push({
    id: i,
    reference: `REF${String(i).padStart(6, "0")}`,
    name: `Customer ${i}`,
  });
}

// Store the same bookings in a Map for direct lookup.
const bookingsByReference = new Map();

for (const booking of bookings) {
  bookingsByReference.set(booking.reference, booking);
}

// Prepare 500 references to look up.
const references = [];

for (let i = 0; i < TOTAL_LOOKUPS; i++) {
  const index = TOTAL_BOOKINGS - 1 - i;
  references.push(`REF${String(index).padStart(6, "0")}`);
}

// Benchmark Array.find().
const arrayStart = performance.now();

for (const reference of references) {
  bookings.find((booking) => booking.reference === reference);
}

const arrayEnd = performance.now();

// Benchmark Map.get().
const mapStart = performance.now();

for (const reference of references) {
  bookingsByReference.get(reference);
}

const mapEnd = performance.now();

console.log("=== BOOKING LOOKUP BENCHMARK ===");
console.log("Total bookings:", TOTAL_BOOKINGS);
console.log("Total lookups:", TOTAL_LOOKUPS);
console.log(
  "Array.find() time:",
  (arrayEnd - arrayStart).toFixed(3),
  "ms"
);
console.log(
  "Map.get() time:",
  (mapEnd - mapStart).toFixed(3),
  "ms"
);
console.log("\nArray.find(): O(n) average-time search");
console.log("Map.get(): O(1) average-time lookup");
