// Build 4/7: the event rules.
//
// The service receives a repository and reuses the pure domain rules. From
// Build 7 an organizer may only change their OWN events: every mutating method
// takes the caller's id and refuses someone else's event with FORBIDDEN. Who is
// allowed to call it at all (the role) is the HTTP guard's job, not this one's.

import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { requireText, requireWholeNumber, requireValidDate } from '../domain/validation.js';
import { summariseEvent, seatsLeft } from '../domain/inventory.js';
import { searchEvents } from '../domain/eventSearch.js';

export function createEventService(repository) {
  async function getEventOrThrow(id) {
    const event = await repository.findEventById(id);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
    return event;
  }

  function assertOrganizerOwns(event, organizerId) {
    if (organizerId !== undefined && event.organizerId !== organizerId) {
      throw new DomainError('FORBIDDEN', 'This event belongs to another organizer');
    }
  }

  async function tiersOf(eventId) {
    const tiers = await repository.listTiers();
    return tiers
      .filter((tier) => tier.eventId === eventId)
      .map((tier) => ({ ...tier, seatsLeft: seatsLeft(tier) }));
  }

  return {
    async createEvent({ title, city, venue = '', startsAt, organizerId }) {
      const organizer = requireText(organizerId, 'organizerId');
      const date = requireValidDate(startsAt, 'startsAt');
      const event = {
        id: newId(),
        organizerId: organizer,
        title: requireText(title, 'Title'),
        city: requireText(city, 'City'),
        venue: String(venue).trim(),
        startsAt: date.toISOString(),
        status: 'draft',
        tierIds: [],
      };
      return repository.saveEvent(event);
    },

    async addTier(eventId, { name, priceCents, capacity }, { organizerId } = {}) {
      const event = await getEventOrThrow(eventId);
      assertOrganizerOwns(event, organizerId);
      const tier = {
        id: newId(),
        eventId,
        name: requireText(name, 'Tier name'),
        // Money is ALWAYS whole cents.
        priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
        capacity: requireWholeNumber(capacity, 'capacity', 1),
        sold: 0,
      };
      await repository.saveTier(tier);
      event.tierIds.push(tier.id);
      await repository.saveEvent(event);
      return tier;
    },

    async publishEvent(eventId, { organizerId } = {}) {
      const event = await getEventOrThrow(eventId);
      assertOrganizerOwns(event, organizerId);
      if (event.status === 'published') return event;
      if (!Array.isArray(event.tierIds) || event.tierIds.length === 0) {
        throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
      }
      event.status = 'published';
      return repository.saveEvent(event);
    },

    async unpublishEvent(eventId, { organizerId } = {}) {
      const event = await getEventOrThrow(eventId);
      assertOrganizerOwns(event, organizerId);
      event.status = 'draft';
      return repository.saveEvent(event);
    },

    async getEvent(eventId) {
      return getEventOrThrow(eventId);
    },

    // One event WITH its tiers, for the event page. A draft is only visible to
    // the organizer who owns it; to everybody else it does not exist, so a
    // draft is never leaked by guesswork.
    async getEventWithTiers(eventId, { userId } = {}) {
      const event = await getEventOrThrow(eventId);
      if (event.status !== 'published' && event.organizerId !== userId) {
        throw new DomainError('NOT_FOUND', 'Event not found');
      }
      return { ...event, tiers: await tiersOf(eventId) };
    },

    // The organizer dashboard: only the caller's own events, published or not.
    async listForOrganizer(organizerId) {
      const events = await repository.listEvents();
      const mine = events.filter((event) => event.organizerId === organizerId);
      return Promise.all(mine.map(async (event) => ({
        ...event,
        tiers: await tiersOf(event.id),
      })));
    },

    // Search, filter and sort the PUBLISHED events using the shared domain rules.
    async search(filters = {}) {
      const [events, tiers] = await Promise.all([
        repository.listEvents(),
        repository.listTiers(),
      ]);

      const tiersByEvent = new Map();
      for (const tier of tiers) {
        if (!tiersByEvent.has(tier.eventId)) tiersByEvent.set(tier.eventId, []);
        tiersByEvent.get(tier.eventId).push(tier);
      }

      const summaries = events
        .filter((event) => event.status === 'published')
        .map((event) => summariseEvent(event, tiersByEvent.get(event.id) ?? []));

      return searchEvents(summaries, filters, filters.sortBy);
    },
  };
}
