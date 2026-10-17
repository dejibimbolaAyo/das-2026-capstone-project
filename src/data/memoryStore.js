import { createSqliteStore } from "./sqliteStore.js";

// DATA layer: the "quick" store used by the tests and by createServer when you give it no store.
//
// Up to Build 7 this was a second, hand-written store that kept everything in Maps.
// From Build 8 it is simply a SQLite database that lives in memory (":memory:").
// Why: the new rules (refunds, expiry, waitlist offers that hold seats) must behave exactly the
// same in both, and one implementation cannot disagree with itself. It is still fast, still empty
// at the start, and still thrown away when the program stops.
//
// (The BookingBook class in src/bookings.js still exists as the plain rules from Builds 1 to 3.)
export function createMemoryStore() {
  return createSqliteStore(":memory:");
}
