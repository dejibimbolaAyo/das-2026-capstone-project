// Build 4: a repository that keeps everything in memory.
// It only reads and writes. Every rule lives in the services.
// Build 5 swaps this for SQLite with the same async methods, so the services
// do not change.
//
// Records are copied in and out, so a caller can never change stored data by
// editing an object it was handed. That is how a real database behaves too.

const copy = (record) => (record === undefined ? undefined : structuredClone(record));

export function createMemoryRepository() {
  const events = new Map(); // eventId -> event
  const tiers = new Map(); // tierId -> tier
  const bookings = new Map(); // reference -> booking  (O(1) lookup by reference)

  return {
    async insertEvent(event) {
      events.set(event.id, copy(event));
      return copy(event);
    },
    async findEvent(id) {
      return copy(events.get(id));
    },
    async updateEvent(event) {
      events.set(event.id, copy(event));
      return copy(event);
    },
    async listEvents() {
      return [...events.values()].map(copy);
    },

    async insertTier(tier) {
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async findTier(id) {
      return copy(tiers.get(id));
    },
    async updateTier(tier) {
      tiers.set(tier.id, copy(tier));
      return copy(tier);
    },
    async listTiersForEvent(eventId) {
      return [...tiers.values()].filter((tier) => tier.eventId === eventId).map(copy);
    },

    async insertBooking(booking) {
      bookings.set(booking.reference, copy(booking));
      return copy(booking);
    },
    async findBookingByReference(reference) {
      return copy(bookings.get(reference));
    },
    async updateBooking(booking) {
      bookings.set(booking.reference, copy(booking));
      return copy(booking);
    },
  };
}
