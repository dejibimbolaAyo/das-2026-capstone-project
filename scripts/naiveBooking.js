import { randomUUID } from "node:crypto";
import { DomainError } from "../src/errors.js";

// THE BUG, ON PURPOSE. Do not copy this code. It is the "before" picture.
//
// It does what looks sensible: 1) look how many seats are left, 2) if there are enough, write.
// The mistake is that anything can happen between step 1 and step 2:
// another request, another server process, a slow payment check.
// While we wait, someone else can take the same seat.
//
// db      a DatabaseSync connection to a database made by createSqliteStore()
// pause   what happens in the gap. By default: let other waiting requests run.
export async function naiveBook(db, eventId, tierId, buyer, quantity = 1, pause = () => new Promise((r) => setImmediate(r))) {
  // 1. LOOK
  const tier = db
    .prepare("SELECT price_cents, capacity, sold FROM tiers WHERE event_id = ? AND id = ?")
    .get(eventId, tierId);

  // The gap. Everyone who arrives now still sees the OLD number of seats left.
  await pause();

  if (tier.capacity - tier.sold < quantity) {
    throw new DomainError("SOLD_OUT", "Sold out.");
  }

  // 2. WRITE, using the old number we looked at (this is the lost update).
  db.prepare("UPDATE tiers SET sold = ? WHERE event_id = ? AND id = ?").run(tier.sold + quantity, eventId, tierId);
  const ref = "NV-" + randomUUID();
  db.prepare(
    `INSERT INTO bookings (ref, event_id, tier_id, buyer_name, quantity, total_cents, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).run(ref, eventId, tierId, buyer, quantity, tier.price_cents * quantity);
  return ref;
}
