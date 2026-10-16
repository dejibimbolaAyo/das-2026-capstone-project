import { DomainError } from "./errors.js";
import { eventSeatsLeft, lowestPriceCents } from "./events.js";

// Merge sort, written by hand.
// 1. Split the pile in half.  2. Sort each half.  3. Merge the halves in order.
// Time: O(n log n). It returns a NEW array and never changes the one you pass in.
//
// It is STABLE: when two items tie, the one that came first stays first.
// That happens because on a tie (compare returns 0) we take from the LEFT half.
export function mergeSort(items, compare) {
  if (items.length <= 1) return items.slice();
  const middle = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);
  return merge(left, right, compare);
}

function merge(left, right, compare) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) {
      out.push(left[i++]); // tie or smaller: take the left one first
    } else {
      out.push(right[j++]);
    }
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}

// How to compare two events for each sort key. Negative = a first, positive = b first, 0 = tie.
const COMPARERS = {
  date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
  price: (a, b) => lowestPriceCents(a) - lowestPriceCents(b),
  availability: (a, b) => eventSeatsLeft(a) - eventSeatsLeft(b),
};

// S05: sort events by "date", "price" (cheapest tier) or "availability" (seats left).
// direction is "asc" or "desc". Descending flips the comparer instead of reversing
// the result, so ties still keep their original order.
export function sortEvents(events, key, direction = "asc") {
  const base = COMPARERS[key];
  if (!base) {
    throw new DomainError("VALIDATION", `Sort key must be one of: ${Object.keys(COMPARERS).join(", ")}.`);
  }
  if (direction !== "asc" && direction !== "desc") {
    throw new DomainError("VALIDATION", 'Direction must be "asc" or "desc".');
  }
  const compare = direction === "asc" ? base : (a, b) => base(b, a);
  return mergeSort(events, compare);
}
