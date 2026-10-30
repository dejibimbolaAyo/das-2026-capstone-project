
import {
  createStore,
  createEvent,
  addTier,
  bookTickets,
  findBookingByReference,
  cancelBooking,
  joinWaitlist,
} from "../src/domain/inventory.js";

function runDemo() {
  const store = createStore();

  console.log("=== EVENT TICKETING DEMO ===\n");

  // 1. Create an event.
  const event = createEvent(store, {
    name: "Lagos Fiesta Carnival 2026",
    date: "2026-12-15",
  });

  // 2. Create a ticket tier.
  const tier = addTier(store, event.id, {
    name: "Regular",
    capacity: 3,
    priceCents: 500000,
  });

  console.log("Event created:", event.name);
  console.log("Ticket capacity:", tier.capacity);

  // 3. Ada books two tickets.
  const ada = bookTickets(store, event.id, tier.id, {
    name: "Ada",
    quantity: 2,
  });

  console.log("\nAda booked:", ada.quantity, "tickets");
  console.log("Ada's reference:", ada.reference);
  console.log("Tickets remaining:", tier.available);

  // 4. Bayo tries to book two tickets.
  try {
    bookTickets(store, event.id, tier.id, {
      name: "Bayo",
      quantity: 2,
    });
  } catch (error) {
    console.log("\nBayo's booking rejected:", error.code);
    console.log("Reason:", error.message);
  }

  // 5. Chika books the final ticket.
  const chika = bookTickets(store, event.id, tier.id, {
    name: "Chika",
    quantity: 1,
  });

  console.log("\nChika booked:", chika.quantity, "ticket");
  console.log("Tickets remaining:", tier.available);

  // 6. Bayo and Dami join the waitlist.
  joinWaitlist(store, event.id, tier.id, {
    name: "Bayo",
    quantity: 2,
  });

  joinWaitlist(store, event.id, tier.id, {
    name: "Dami",
    quantity: 1,
  });

  console.log("\nPeople on waitlist:", tier.waitlist.size);

  // 7. Find Ada's booking using her reference.
  const found = findBookingByReference(store, ada.reference);

  console.log("\nBooking lookup:");
  console.log("Customer:", found.name);
  console.log("Reference:", found.reference);

  // 8. Ada cancels her booking.
  const result = cancelBooking(store, ada.reference);

  console.log("\nAda cancelled:", result.booking.status);
  console.log("Tickets available:", tier.available);

  if (result.nextPerson) {
    console.log("Next person in line:", result.nextPerson.name);
  } else {
    console.log("No waitlisted customer was offered tickets.");
  }

  console.log("\n=== DEMO COMPLETE ===");
}

runDemo();
