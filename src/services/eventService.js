import { createEvent, addTier, publishEvent, unpublishEvent } from "../events.js";
import { searchEvents } from "../search.js";
import { sortEvents } from "../sort.js";
import { DomainError } from "../errors.js";
import { requireRole, requireEventOwner, canSeeEvent } from "./access.js";

// SERVICES layer: one function per thing a person wants to DO with events.
// A service has no HTTP in it and no storage details. It asks the rules to decide
// and asks the store (passed in) to keep things.
// `actor` is the logged-in user. Every change needs an organizer who OWNS the event.
export function createEventService(store) {
  return {
    // S02: only organizers make events, and the new event belongs to its maker.
    // If the caller gives no id, the store makes one (EV-000001, ...).
    create(input, actor) {
      requireRole(actor, "organizer");
      if (input !== null && typeof input === "object" && input.id === undefined) {
        input = { ...input, id: store.nextEventId() };
      }
      if (store.getEvent(input?.id)) {
        throw new DomainError("VALIDATION", `An event with id "${input.id}" already exists.`);
      }
      const event = createEvent(input);
      event.ownerId = actor.id;
      return store.saveEvent(event);
    },

    // Published events: anyone. Drafts: only the organizer who owns them (others get NOT_FOUND).
    get(eventId, actor = null) {
      const event = store.requireEvent(eventId);
      if (!canSeeEvent(event, actor)) throw new DomainError("NOT_FOUND", `No event with id "${eventId}".`);
      return event;
    },

    // The organizer dashboard: my events, drafts included.
    listMine(actor) {
      requireRole(actor, "organizer");
      return store.listEvents().filter((e) => e.ownerId === actor.id);
    },

    // If the caller gives no tier id, we use T1, T2, ... for this event.
    // updateEvent does the whole look-change-save as one step, and the ownership check
    // is INSIDE that step, so it is made on the very same copy that gets changed.
    addTier(eventId, tier, actor) {
      return store.updateEvent(eventId, (event) => {
        requireEventOwner(event, actor);
        if (tier !== null && typeof tier === "object" && tier.id === undefined) {
          let n = event.tiers.size + 1;
          while (event.tiers.has(`T${n}`)) n += 1;
          tier = { ...tier, id: `T${n}` };
        }
        return addTier(event, tier);
      });
    },

    publish(eventId, actor) {
      return store.updateEvent(eventId, (event) => publishEvent(requireEventOwner(event, actor)));
    },

    unpublish(eventId, actor) {
      return store.updateEvent(eventId, (event) => unpublishEvent(requireEventOwner(event, actor)));
    },

    // Search and (optionally) sort. Never changes the stored list. Only published events are found.
    search(filters = {}, sortKey = null, direction = "asc") {
      const found = searchEvents(store.listEvents(), filters);
      return sortKey ? sortEvents(found, sortKey, direction) : found;
    },
  };
}
