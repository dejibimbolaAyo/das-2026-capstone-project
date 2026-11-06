// Run with: npm run benchmark
// Why do we keep bookings in a Map keyed by reference code?
// Finding one booking in an array is O(n). In a Map it is O(1).

import { newReference } from '../src/domain/ids.js';

const BOOKINGS = 100_000;
const LOOKUPS = 500;

const list = [];
const map = new Map();
for (let i = 0; i < BOOKINGS; i += 1) {
  const booking = { reference: newReference(), number: i };
  list.push(booking);
  map.set(booking.reference, booking);
}

const targets = Array.from({ length: LOOKUPS }, () => list[Math.floor(Math.random() * BOOKINGS)].reference);

function time(label, lookup) {
  const start = performance.now();
  for (const reference of targets) lookup(reference);
  const ms = performance.now() - start;
  console.log(`${label.padEnd(12)} ${ms.toFixed(2).padStart(10)} ms for ${LOOKUPS} lookups`);
  return ms;
}

console.log(`${BOOKINGS.toLocaleString()} bookings in memory\n`);
const listMs = time('Array.find', (ref) => list.find((b) => b.reference === ref));
const mapMs = time('Map.get', (ref) => map.get(ref));
console.log(`\nThe Map was about ${Math.round(listMs / Math.max(mapMs, 0.001)).toLocaleString()}x faster.`);
console.log('Now double BOOKINGS and run it again. Which number grows, and which one stays flat?');
