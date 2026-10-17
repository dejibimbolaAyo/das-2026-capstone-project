import { DomainError } from "../errors.js";
import { HOLD_MS, OFFER_MS } from "../holds.js";
import { requireRole } from "./access.js";
import { createSeatService } from "./seatService.js";

// SERVICES layer: S11 (join the waitlist) and S12 (offers, in order, for a limited time).
// Only attendees use the waitlist, and only for their OWN entries.
//
// Before every action we run the seat service's sweep. That way a seat whose offer has just run
// out has ALREADY moved on to the next person before we decide anything. It makes the rules true
// even if the maintenance job has not run for a while.
export function createWaitlistService(store, { now = Date.now, holdMs = HOLD_MS, offerMs = OFFER_MS } = {}) {
  const seats = createSeatService(store, { now, offerMs });

  return {
    // S11: join the END of the line for a sold-out tier.
    join(eventId, tierId, actor) {
      requireRole(actor, "attendee");
      if (typeof eventId !== "string" || typeof tierId !== "string") {
        throw new DomainError("VALIDATION", "Joining the waitlist needs an eventId and a tierId.");
      }
      seats.sweep();
      return store.waitlist.join({ eventId, tierId, userId: actor.id, name: actor.name });
    },

    // S12: take the seat that was offered. It becomes a pending booking that you must pay for.
    accept(entryId, actor) {
      requireRole(actor, "attendee");
      seats.sweep();
      return store.waitlist.accept(entryId, actor.id, { nowMs: now(), holdMs });
    },

    // Leave the line, or turn an offer down (the seat goes to the next person).
    leave(entryId, actor) {
      requireRole(actor, "attendee");
      seats.sweep();
      return store.waitlist.leave(entryId, actor.id, { nowMs: now(), offerMs });
    },

    // My entries, newest first: waiting (with my place in line), offered (with a deadline), and finished ones.
    listMine(actor) {
      requireRole(actor, "attendee");
      seats.sweep();
      return store.waitlist.listForUser(actor.id);
    },
  };
}
