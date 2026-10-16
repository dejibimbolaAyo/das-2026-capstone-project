// ROUTES layer: decides exactly what the outside world gets to see.
// Each presenter picks fields by name (a whitelist), so a new private field
// (like the waitlist of names) can never leak by accident.

export function presentTier(tier) {
  return {
    id: tier.id,
    name: tier.name,
    priceCents: tier.priceCents,
    capacity: tier.capacity,
    seatsLeft: tier.capacity - tier.sold,
  };
}

export function presentEvent(event) {
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    date: event.date,
    status: event.status,
    tiers: [...event.tiers.values()].map(presentTier),
  };
}

export function presentBooking(booking) {
  return {
    ref: booking.ref,
    eventId: booking.eventId,
    tierId: booking.tierId,
    buyerName: booking.buyerName,
    quantity: booking.quantity,
    totalCents: booking.totalCents,
    status: booking.status,
    holdExpiresAt: booking.holdExpiresAt ?? null,
  };
}

// Never includes the password hash. Only these four fields ever leave the server.
export function presentUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
