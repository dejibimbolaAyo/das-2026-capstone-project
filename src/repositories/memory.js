// Build 4/7: the data layer with users added for Build 7
export function createMemoryRepository() {
  const events = new Map();
  const tiers = new Map();
  const bookings = new Map();
  const bookingsByReference = new Map();
  const users = new Map();
  const usersByEmail = new Map();

  return {
    async saveUser(user) {
      users.set(user.id, user);
      if (user.email) {
        usersByEmail.set(user.email, user);
      }
      return user;
    },
    async findUserById(id) {
      return users.get(id) ?? null;
    },
    async findUserByEmail(email) {
      if (!email) return null;
      const key = String(email).toLowerCase();
      return usersByEmail.get(key) ?? null;
    },

    async saveEvent(event) {
      events.set(event.id, event);
      return event;
    },
    async findEventById(id) {
      return events.get(id) ?? null;
    },
    async listEvents() {
      return [...events.values()];
    },

    async saveTier(tier) {
      tiers.set(tier.id, tier);
      return tier;
    },
    async findTierById(id) {
      return tiers.get(id) ?? null;
    },
    async listTiers() {
      return [...tiers.values()];
    },

    async reserveSeats(tierId, quantity) {
      const tier = tiers.get(tierId);
      if (!tier) return false;
      if (tier.sold + quantity > tier.capacity) return false;
      tier.sold += quantity;
      return true;
    },
    async releaseSeats(tierId, quantity) {
      const tier = tiers.get(tierId);
      if (!tier || tier.sold < quantity) return false;
      tier.sold -= quantity;
      return true;
    },

    async saveBooking(booking) {
      bookings.set(booking.id, booking);
      bookingsByReference.set(booking.reference, booking);
      return booking;
    },
    async findBookingByReference(reference) {
      return bookingsByReference.get(reference) ?? null;
    },
    async listBookings() {
      return [...bookings.values()];
    },
    async listBookingsForUser(userId) {
      return [...bookings.values()].filter((b) => b.userId === userId);
    },
  };
}
