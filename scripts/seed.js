// Fills the database with practice data: 3 demo accounts and 8 events (one sold out,
// some with a sold-out ticket type), so the website has something to show.
//   npm run seed          (then npm start)
// Safe to run twice: if the demo organizer already exists it does nothing.
// These accounts and passwords are for PRACTICE on your own computer only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteStore } from "../src/data/sqliteStore.js";
import { createAuthService } from "../src/services/authService.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";

const dbFile = process.env.DB_FILE || fileURLToPath(new URL("../data/tickets.sqlite", import.meta.url));
if (dbFile === ":memory:") {
  console.error("Seeding a throw-away database is pointless. Leave DB_FILE out, or give a file path.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });

const PASSWORD = "demo-password-1";
const store = createSqliteStore(dbFile);
const auth = createAuthService(store);
const events = createEventService(store);
const bookings = createBookingService(store);

if (store.users.findByEmail("demo-organizer@example.com")) {
  console.log("The demo data is already there. Nothing to do.");
  store.close();
  process.exit(0);
}

const account = async (name, email, role) => (await auth.signup({ name, email, password: PASSWORD, role })).user;
const organizer = await account("Demo Organizer", "demo-organizer@example.com", "organizer");
await account("Demo Attendee", "demo-attendee@example.com", "attendee");
const filler = await account("Early Buyers", "early-buyers@example.com", "attendee"); // owns the pretend sales below

// [title, city, venue, date, [[tier name, price in cents, capacity, already sold], ...]]
const DEMO = [
  ["Lagos Jazz Nights", "Lagos", "Terra Hall, Victoria Island", "2026-11-07", [["General", 800000, 200, 57], ["VIP table", 2500000, 40, 28]]],
  ["Abuja Tech Summit 2026", "Abuja", "Capital Conference Hall", "2026-11-12", [["Student", 500000, 150, 150], ["Standard", 1800000, 400, 211], ["Workshop pass", 4500000, 60, 49]]],
  ["Kano Heritage Durbar Walk", "Kano", "Emir's Palace Square", "2026-11-14", [["Walk-in", 200000, 500, 120]]],
  ["Ibadan Stand-up Night", "Ibadan", "Cultural Centre Mokola", "2026-11-21", [["Regular", 300000, 120, 120], ["Front row", 1000000, 24, 18]]],
  ["Port Harcourt Food Festival", "Port Harcourt", "Garden City Grounds", "2026-12-05", [["Free entry", 0, 1000, 640], ["Tasting pass", 1500000, 150, 90]]],
  ["Enugu Gospel Concert", "Enugu", "Coal City Arena", "2026-12-12", [["Regular", 500000, 800, 355], ["Gold", 2000000, 100, 94]]],
  ["Lagos Comedy Cruise", "Lagos", "Marina Jetty, Lagos Island", "2026-12-19", [["Deck", 1200000, 90, 31], ["Captain's table", 3500000, 16, 3]]],
  ["Detty December Beach Party", "Lagos", "Landmark Beach, Oniru", "2026-12-26", [["Early bird", 1000000, 300, 300], ["Regular", 1500000, 500, 500]]],
];

for (const [title, city, venue, date, tiers] of DEMO) {
  const event = events.create({ title, city, venue, date }, organizer);
  tiers.forEach(([name, priceCents, capacity]) => events.addTier(event.id, { name, priceCents, capacity }, organizer));
  events.publish(event.id, organizer);
  for (const [i, [, , , sold]] of tiers.entries()) {
    for (let left = sold; left > 0; left -= 10) {
      const booking = bookings.book(event.id, `T${i + 1}`, "Early Buyers", Math.min(10, left), filler);
      bookings.pay(booking.ref, "tok_success", filler);
    }
  }
}

console.log(`Done. ${DEMO.length} events and 3 demo accounts were added to ${path.resolve(dbFile)}`);
console.log("Practice logins (password for all three: " + PASSWORD + "):");
console.log("  organizer: demo-organizer@example.com");
console.log("  attendee:  demo-attendee@example.com");
store.close();
