import { createEvent, addTier, publishEvent, eventSeatsLeft, lowestPriceCents, formatMoney } from "./src/events.js";
import { BookingBook } from "./src/bookings.js";
import { searchEvents } from "./src/search.js";
import { sortEvents } from "./src/sort.js";

const title = (text) => console.log("\n=== " + text + " ===");
const show = (events) => {
  if (events.length === 0) return console.log("  (no events)");
  for (const e of events) {
    console.log(
      `  ${e.date}  ${e.title.padEnd(22)} ${e.city.padEnd(7)} from ${formatMoney(lowestPriceCents(e)).padEnd(11)} seats left: ${eventSeatsLeft(e)}`
    );
  }
};

// Build a small catalogue.
const make = (id, name, city, venue, date, priceCents, capacity, publish = true) => {
  const e = createEvent({ id, title: name, city, venue, date });
  addTier(e, { id: "ga", name: "General", priceCents, capacity });
  if (publish) publishEvent(e);
  return e;
};

const events = [
  make("e1", "Lagos Tech Night", "Lagos", "Landmark Centre", "2026-12-05", 1500000, 100),
  make("e2", "Abuja Jazz Evening", "Abuja", "Transcorp Hall", "2026-11-20", 800000, 50),
  make("e3", "Lagos Food Fair", "Lagos", "Tafawa Balewa Square", "2026-11-20", 500000, 200),
  make("e4", "Ibadan Book Club", "Ibadan", "Cultural Centre", "2027-01-15", 300000, 30),
  make("e5", "Lagos Comedy Night", "Lagos", "Eko Hotel", "2026-12-20", 800000, 80),
  make("e6", "Secret Launch", "Lagos", "Private Venue", "2026-12-01", 100000, 10, false), // a draft
];

// Sell some seats so "availability" is interesting.
const book = new BookingBook();
book.book(events[1], "ga", "Ada", 10);
book.book(events[3], "ga", "Bola", 10);

title("All published events (the draft is hidden)");
show(searchEvents(events));

title("Search the word 'night'");
show(searchEvents(events, { text: "night" }));

title("City = Lagos, December only");
show(searchEvents(events, { city: "lagos", dateFrom: "2026-12-01", dateTo: "2026-12-31" }));

title("Cheapest ticket under N6,000");
show(searchEvents(events, { maxPriceCents: 600000 }));

title("Sort by date (earliest first). Two events share 2026-11-20: they keep their original order.");
show(sortEvents(searchEvents(events), "date"));

title("Sort by price (most expensive first)");
show(sortEvents(searchEvents(events), "price", "desc"));

title("Sort by availability (fewest seats left first)");
show(sortEvents(searchEvents(events), "availability"));

title("The original list was not changed");
console.log("  order is still: " + events.map((e) => e.id).join(", "));
console.log("\nDone.");
