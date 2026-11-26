// Event rules for the API: create, add tiers, publish, unpublish, search.
// The repository is passed in, so tests (and Build 5) can give it a different one.

import { DomainError } from '../domain/errors.js';
import { searchEvents, summarizeEvent } from '../domain/eventSearch.js';
import { newId } from '../domain/ids.js';
import { requireDate, requireText, requireWholeNumber } from '../domain/validation.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function requireActor(actorId) {
  if (typeof actorId !== 'string' || actorId.trim() === '') {
    throw new DomainError('UNAUTHENTICATED', 'Log in first');
  }
  return actorId.trim();
}

function requireObject(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new DomainError('VALIDATION', 'Request body must be a JSON object');
  }
  return input;
}

export function createEventService({ repository }) {
  async function getEvent(eventId) {
    const event = await repository.findEvent(eventId);
    if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
    return event;
  }

  async function getOwnEvent(actorId, eventId) {
    const event = await getEvent(eventId);
    if (event.organizerId !== actorId) {
      throw new DomainError('FORBIDDEN', 'Only the organizer of this event can change it');
    }
    return event;
  }

  async function withTiers(event) {
    const tiers = await repository.listTiersForEvent(event.id);
    return {
      ...summarizeEvent(event, tiers),
      organizerId: event.organizerId,
      tiers: tiers.map((tier) => ({ ...tier, seatsLeft: tier.capacity - tier.sold })),
    };
  }

  return {
    async createEvent(actorId, input) {
      const organizerId = requireActor(actorId);
      const { title, city, venue, startsAt } = requireObject(input);
      const event = {
        id: newId(),
        organizerId,
        title: requireText(title, 'title'),
        city: requireText(city, 'city'),
        venue: venue === undefined ? '' : String(venue).trim(),
        startsAt: requireDate(startsAt, 'startsAt'),
        status: 'draft',
      };
      return withTiers(await repository.insertEvent(event));
    },

    async addTier(actorId, eventId, input) {
      const organizerId = requireActor(actorId);
      const { name, priceCents, capacity } = requireObject(input);
      await getOwnEvent(organizerId, eventId);
      const tier = {
        id: newId(),
        eventId,
        name: requireText(name, 'name'),
        // Money is ALWAYS whole cents.
        priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
        capacity: requireWholeNumber(capacity, 'capacity', 1),
        sold: 0,
      };
      const saved = await repository.insertTier(tier);
      return { ...saved, seatsLeft: saved.capacity - saved.sold };
    },

    async publishEvent(actorId, eventId) {
      const event = await getOwnEvent(requireActor(actorId), eventId);
      const tiers = await repository.listTiersForEvent(eventId);
      if (tiers.length === 0) {
        throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing');
      }
      return withTiers(await repository.updateEvent({ ...event, status: 'published' }));
    },

    async unpublishEvent(actorId, eventId) {
      const event = await getOwnEvent(requireActor(actorId), eventId);
      return withTiers(await repository.updateEvent({ ...event, status: 'draft' }));
    },

    // Drafts are only visible to their organizer. To anyone else they do not exist.
    async getEvent(actorId, eventId) {
      const event = await getEvent(eventId);
      if (event.status !== 'published' && event.organizerId !== actorId) {
        throw new DomainError('NOT_FOUND', 'Event not found');
      }
      return withTiers(event);
    },

    // The organizer's own events, drafts included, for their dashboard.
    async listOwnEvents(actorId) {
      const events = await repository.listEventsByOrganizer(requireActor(actorId));
      return Promise.all(events.map(withTiers));
    },

    async searchPublishedEvents(criteria = {}, sortBy = 'date') {
      const published = (await repository.listEvents()).filter((event) => event.status === 'published');
      const summaries = await Promise.all(
        published.map(async (event) => summarizeEvent(event, await repository.listTiersForEvent(event.id))),
      );
      return searchEvents(summaries, criteria, sortBy);
    },

    // One page of the search. The caller says how many (limit) and where to start
    // (offset). total is the number of matches before paging, so a screen can say
    // "Showing 20 of 1,342" and know when to stop asking for more.
    async searchPublishedEventsPage(criteria = {}, sortBy = 'date', { limit, offset } = {}) {
      const pageSize = limit === undefined ? DEFAULT_PAGE_SIZE : Math.min(requireWholeNumber(limit, 'limit', 1), MAX_PAGE_SIZE);
      const start = offset === undefined ? 0 : requireWholeNumber(offset, 'offset', 0);
      const all = await this.searchPublishedEvents(criteria, sortBy);
      return { events: all.slice(start, start + pageSize), total: all.length, limit: pageSize, offset: start };
    },
  };
}
