import { createEvent, addTier, publishEvent, seatsLeft, formatMoney } from "./src/events.js";
import { BookingBook } from "./src/bookings.js";
import { DomainError } from "./src/errors.js";

const line = (text) => console.log(text);
const title = (text) => console.log("\n=== " + text + " ===");

const book = new BookingBook();

title("1. Create an event with one small tier");
const event = createEvent({
  id: "ev-1",
  title: "Lagos Tech Night",
  city: "Lagos",
  venue: "Landmark Centre",
  date: "2026-12-05",
});
const vip = addTier(event, { id: "vip", name: "VIP", priceCents: 1500000, capacity: 3 });
publishEvent(event);
line(`${event.title} in ${event.city}. ${vip.name} costs ${formatMoney(vip.priceCents)}, ${vip.capacity} seats.`);

title("2. The tier sells out");
const ada = book.book(event, "vip", "Ada", 1);
const bola = book.book(event, "vip", "Bola", 2);
line(`Ada booked ${ada.ref}. Bola booked ${bola.ref} (2 seats).`);
line(`Seats left in VIP: ${seatsLeft(vip)}`);

title("3. A new booking is refused");
try {
  book.book(event, "vip", "Chidi", 1);
} catch (err) {
  if (err instanceof DomainError) line(`Refused (${err.code}): ${err.message}`);
  else throw err;
}

title("4. People join the waitlist");
line(`Chidi joins. Place in line: ${book.joinWaitlist(event, "vip", "Chidi")}`);
line(`Dayo joins.  Place in line: ${book.joinWaitlist(event, "vip", "Dayo")}`);
line(`Line now: ${vip.waitlist.toArray().map((p) => p.name).join(" -> ")}`);

title("5. Look up a booking by its code");
const found = book.find(bola.ref);
line(`${bola.ref} belongs to ${found.buyerName}: ${found.quantity} seats, ${formatMoney(found.totalCents)}, ${found.status}.`);

title("6. A booking is cancelled");
const result = book.cancel(event, ada.ref);
line(`${result.booking.ref} (${result.booking.buyerName}) cancelled. Seats left: ${seatsLeft(vip)}`);
line(`Next in line: ${result.nextInLine.name}`);

title("7. Cancelling twice is refused");
try {
  book.cancel(event, ada.ref);
} catch (err) {
  if (err instanceof DomainError) line(`Refused (${err.code}): ${err.message}`);
  else throw err;
}

line("\nDone.");
