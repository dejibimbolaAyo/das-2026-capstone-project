// Run with:  npm run demo:oversell
// The last-ticket problem (story S08): 50 people try to buy the LAST ticket at the same moment.
//   Part 1: the buggy "look, then write" way  -> too many tickets are sold
//   Part 2: the real store (the fix)           -> exactly one person gets it
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSqliteStore } from "./src/data/sqliteStore.js";
import { createEventService } from "./src/services/eventService.js";
import { naiveBook } from "./scripts/naiveBooking.js";
import { runCrowd } from "./scripts/crowd.js";

const PEOPLE = 50;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oversell-demo-"));

function setUp(file) {
  const store = createSqliteStore(file);
  const events = createEventService(store);
  const event = events.create({ title: "Lagos Jazz Night", city: "Lagos", venue: "Terra Kulture", date: "2026-12-05" });
  events.addTier(event.id, { name: "Last Chance", priceCents: 500000, capacity: 1 });
  events.publish(event.id);
  return { store, eventId: event.id, tierId: "T1" };
}

function report(label, store, eventId, succeeded, soldOut) {
  const tier = store.requireEvent(eventId).tiers.get("T1");
  const bookings = store.bookings.size;
  console.log(`  People who got a ticket:   ${succeeded}`);
  console.log(`  People told "sold out":    ${soldOut}`);
  console.log(`  Bookings in the database:  ${bookings}`);
  console.log(`  Tickets that existed:      ${tier.capacity}`);
  console.log(bookings > tier.capacity ? `  RESULT: ${label} OVERSOLD. ${bookings} bookings for ${tier.capacity} ticket!` : `  RESULT: ${label} correct. Exactly ${bookings} booking for ${tier.capacity} ticket.`);
}

try {
  console.log(`\nStory S08: ${PEOPLE} people try to buy the LAST ticket at the same moment.\n`);

  console.log("PART 1: the buggy way (look at the seats, wait a moment, then write)");
  {
    const file = path.join(dir, "naive.sqlite");
    const { store, eventId, tierId } = setUp(file);
    const db = new DatabaseSync(file);
    const outcomes = await Promise.all(
      Array.from({ length: PEOPLE }, (_, i) =>
        naiveBook(db, eventId, tierId, `Person ${i + 1}`).then(() => "ok", () => "soldOut")
      )
    );
    report("Buggy way", store, eventId, outcomes.filter((o) => o === "ok").length, outcomes.filter((o) => o === "soldOut").length);
    db.close();
    store.close();
  }

  console.log("\nPART 2: the real store (one atomic step, 5 separate connections x 10 people each)");
  {
    const file = path.join(dir, "safe.sqlite");
    const { store, eventId, tierId } = setUp(file);
    const r = await runCrowd({ dbFile: file, eventId, tierId, workers: 5, attemptsEach: PEOPLE / 5, mode: "safe" });
    report("Real store", store, eventId, r.succeeded, r.soldOut);
    if (r.failed.length) console.log("  Unexpected errors:", r.failed);
    store.close();
  }
  console.log("\nWhy: the real store takes the seat AND checks there is room in ONE database step.");
  console.log("See docs/overselling.md.\n");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
