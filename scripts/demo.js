import {
  addTier,
  bookTickets,
  cancelBooking,
  createEvent,
  createStore,
  joinWaitlist,
} from "../src/domain/inventory.js";

const store = createStore();
const event = createEvent(store, {
  title: "Summer Sounds",
  city: "Auckland",
  venue: "Harbour Park",
  date: "2027-01-16",
});
const tier = addTier(store, event.id, {
  name: "General Admission",
  priceCents: 4500,
  capacity: 2,
});

console.log(`${event.title}: ${tier.capacity} ${tier.name} tickets available.`);
const booking = bookTickets(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: "Alex Morgan",
  quantity: 2,
});
console.log(`${booking.attendeeName} booked ${booking.quantity}; the tier is sold out.`);

try {
  bookTickets(store, {
    eventId: event.id,
    tierId: tier.id,
    attendeeName: "Taylor Reed",
    quantity: 1,
  });
} catch (error) {
  if (error.code !== "SOLD_OUT") {
    throw error;
  }
  console.log(`Taylor's booking was refused: ${error.code}.`);
}

joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: "Jordan Lee",
});
joinWaitlist(store, {
  eventId: event.id,
  tierId: tier.id,
  attendeeName: "Casey Patel",
});
console.log("Jordan and Casey joined the waitlist in that order.");

cancelBooking(store, booking.reference);
console.log(`${booking.attendeeName} cancelled; ${tier.available} ticket(s) are available again.`);
console.log(`Next person in line: ${tier.waitlist.peek().attendeeName}.`);
