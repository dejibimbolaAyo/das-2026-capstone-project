import { createEvent, addTier, publishEvent, seatsLeft } from "./src/events.js";
import { BookingBook } from "./src/bookings.js";
import { STATES, EVENTS, canTransition, nextState } from "./src/bookingStates.js";
import { DomainError } from "./src/errors.js";

const title = (text) => console.log("\n=== " + text + " ===");
const tryIt = (label, action) => {
  try {
    action();
    console.log(`  OK       ${label}`);
  } catch (err) {
    if (err instanceof DomainError) console.log(`  REFUSED  ${label} -> ${err.code}: ${err.message}`);
    else throw err;
  }
};

title("The rules: which move is allowed from which state");
console.log("  " + "state".padEnd(11) + EVENTS.map((e) => e.padEnd(11)).join(""));
for (const state of STATES) {
  const cells = EVENTS.map((e) => (canTransition(state, e) ? nextState(state, e) : "-").padEnd(11));
  console.log("  " + state.padEnd(11) + cells.join(""));
}

const event = createEvent({ id: "ev-1", title: "Lagos Tech Night", city: "Lagos", venue: "Landmark Centre", date: "2026-12-05" });
const tier = addTier(event, { id: "ga", name: "General", priceCents: 500000, capacity: 5 });
publishEvent(event);
const book = new BookingBook();

title("Booking A: book, pay, then cancel");
const a = book.book(event, "ga", "Ada", 2);
console.log(`  ${a.ref} is ${a.status}. Seats left: ${seatsLeft(tier)}`);
tryIt("pay A", () => book.pay(a.ref));
console.log(`  ${a.ref} is ${a.status}. Seats left: ${seatsLeft(tier)}`);
tryIt("pay A again", () => book.pay(a.ref));
tryIt("cancel A (a paid booking)", () => book.cancel(event, a.ref));
console.log(`  ${a.ref} is ${a.status}. Seats left: ${seatsLeft(tier)}`);
tryIt("cancel A again", () => book.cancel(event, a.ref));
console.log(`  Seats left is still ${seatsLeft(tier)}, so nothing was released twice.`);

title("Booking B: book, cancel, then try to pay");
const b = book.book(event, "ga", "Bola", 3);
console.log(`  ${b.ref} is ${b.status}. Seats left: ${seatsLeft(tier)}`);
tryIt("cancel B", () => book.cancel(event, b.ref));
console.log(`  ${b.ref} is ${b.status}. Seats left: ${seatsLeft(tier)}`);
tryIt("pay B (a cancelled booking)", () => book.pay(b.ref));
console.log(`  ${b.ref} is still ${b.status}. Seats left: ${seatsLeft(tier)}`);

console.log("\nDone.");
