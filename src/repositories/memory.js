export function createMemoryRepository() {
  const events = new Map();
  const tiers = new Map();
  const bookings = new Map();

  return {
    // Events
    async createEvent(event) {
      events.set(event.id, event);
      return event;
    },

    async getEventById(id) {
      return events.get(id) ?? null;
    },

    async listEvents() {
      return [...events.values()];
    },
     async updateEvent(id, updates) {
  const event = events.get(id);

  if (!event) return null;

  const updatedEvent = { ...event, ...updates };
  events.set(id, updatedEvent);

  return updatedEvent;
},
    // Ticket tiers
    async createTier(tier) {
      tiers.set(tier.id, tier);
      return tier;
    },

    async getTierById(id) {
      return tiers.get(id) ?? null;
    },

    async listTiersByEventId(eventId) {
      return [...tiers.values()].filter((tier) => tier.eventId === eventId);
    },
    async updateTier(id, updates) {
  const tier = tiers.get(id);

  if (!tier) return null;

  const updatedTier = { ...tier, ...updates };
  tiers.set(id, updatedTier);

  return updatedTier;
},
    // Bookings
    async createBooking(booking) {
      bookings.set(booking.reference, booking);
      return booking;
    },

    async getBookingByReference(reference) {
      return bookings.get(reference) ?? null;
    },

    async listBookings() {
      return [...bookings.values()];
    },

    async updateBooking(reference, updates) {
      const booking = bookings.get(reference);

      if (!booking) return null;

      const updatedBooking = { ...booking, ...updates };
      bookings.set(reference, updatedBooking);

      return updatedBooking;
    },
  };
}