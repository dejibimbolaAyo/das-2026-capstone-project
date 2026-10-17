import { OFFER_MS } from "../holds.js";

// SERVICES layer: the seats that have been FREED.
// A seat comes free when an unpaid booking runs out of time, when a paid booking is refunded,
// or when a waitlist offer runs out. Each time, the seat is offered to the next person waiting.
//
// The real work is one all-or-nothing step in the data layer (store.sweep). This service only says
// WHEN ("now") and how long an offer lasts.
export function createSeatService(store, { now = Date.now, offerMs = OFFER_MS } = {}) {
  return {
    // Let go of everything that has run out of time and pass the seats on.
    // Safe to call as often as you like: if nothing ran out, nothing changes.
    sweep() {
      return store.sweep(now(), { offerMs });
    },
  };
}
