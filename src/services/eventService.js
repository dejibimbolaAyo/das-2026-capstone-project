import {
  createStore,
  createEvent as createDomainEvent,
  addTier as addDomainTier,
  publishEvent as publishDomainEvent,
  unpublishEvent as unpublishDomainEvent,
} from '../domain/inventory.js';

import {
  summarizeEvent,
  searchEvents,
} from '../domain/eventSearch.js';

// Create a new event
export async function createEvent(repository, input, userId) {
  const store = createStore();

  const event = createDomainEvent(store, {
    ...input,
    organizerId: userId,
  });

  return repository.createEvent(event);
}

// Add a ticket tier to an event
export async function addTier(repository, eventId, input) {
  const event = await repository.getEventById(eventId);

  const store = createStore();

  if (event) {
    store.events.set(eventId, event);
  }

  const existingTiers = await repository.listTiersByEventId(eventId);

  for (const tier of existingTiers) {
    store.tiers.set(tier.id, tier);
  }

  const tier = addDomainTier(store, eventId, input);

  await repository.createTier(tier);
  await repository.updateEvent(eventId, event);

  return tier;
}

// Publish an event
export async function publishEvent(repository, eventId) {
  const event = await repository.getEventById(eventId);

  const store = createStore();

  if (event) {
    store.events.set(eventId, event);
  }

  const updatedEvent = publishDomainEvent(store, eventId);

  return repository.updateEvent(eventId, updatedEvent);
}

// Unpublish an event
export async function unpublishEvent(repository, eventId) {
  const event = await repository.getEventById(eventId);

  const store = createStore();

  if (event) {
    store.events.set(eventId, event);
  }

  const updatedEvent = unpublishDomainEvent(store, eventId);

  return repository.updateEvent(eventId, updatedEvent);
}

// List and search published events
export async function listPublishedEvents(
  repository,
  criteria = {},
  sortBy = 'date'
) {
  const events = await repository.listEvents();
  const summaries = [];

  for (const event of events) {
    if (event.status !== 'published') {
      continue;
    }

    const tiers = await repository.listTiersByEventId(event.id);

    summaries.push(summarizeEvent(event, tiers));
  }

  return searchEvents(summaries, criteria, sortBy);
}