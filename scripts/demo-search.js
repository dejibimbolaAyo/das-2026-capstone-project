// Run with: npm run demo:search
// A guided tour of the Build 2 search, filter and sort logic in the terminal.

import {
  createStore,
  createEvent,
  addTier,
  bookTickets,
  publishEvent,
  listEventSummaries,
} from '../src/domain/inventory.js';
import { searchEvents, sortEvents } from '../src/domain/eventSearch.js';

const store = createStore();

function seed({ title, city, venue, startsAt, priceCents, capacity }) {
  const event = createEvent(store, { title, city, venue, startsAt, organizerId: 'organizer-1' });
  addTier(store, event.id, { name: 'General', priceCents, capacity });
  publishEvent(store, event.id);
  return event;
}

seed({ title: 'Lagos Tech Meetup', city: 'Lagos', venue: 'Yaba Hub', startsAt: '2026-12-05T17:00:00Z', priceCents: 500_000, capacity: 100 });
seed({ title: 'Abuja Jazz Night', city: 'Abuja', venue: 'Transcorp Hilton', startsAt: '2026-12-06T19:00:00Z', priceCents: 300_000, capacity: 50 });

// A third event in Lagos that we sell out, to show availability filtering.
const soldOut = seed({ title: 'Lagos Startup Pitch', city: 'Lagos', venue: 'Yaba Hub', startsAt: '2026-12-05T10:00:00Z', priceCents: 750_000, capacity: 1 });
bookTickets(store, soldOut.tierIds[0], 'ada', 1);

const all = listEventSummaries(store, { publishedOnly: true });
console.log(`Seeded ${all.length} published events.\n`);

function show(label, events) {
  console.log(label);
  if (events.length === 0) console.log('  (none)');
  for (const event of events) {
    const price = event.minPriceCents === null ? 'no price' : `${event.minPriceCents / 100} NGN`;
    console.log(`  - ${event.title} (${event.city}, ${price}, ${event.totalSeatsLeft} seats left)`);
  }
  console.log();
}

show('All published events:', all);
show('Search q="jazz" (matches title or venue, any case):', searchEvents(all, { q: 'jazz' }));
show('Filter city="lagos":', searchEvents(all, { city: 'lagos' }));
show('Filter up to the date 2026-12-05 (whole day):', searchEvents(all, { to: '2026-12-05' }));
show('Only events with seats left:', searchEvents(all, { onlyAvailable: true }));
show('Sort by date (earliest first):', sortEvents(all, 'date'));
show('Sort by price (cheapest first, no price last):', sortEvents(all, 'price'));
show('Sort by availability (most seats left first):', sortEvents(all, 'availability'));

const before = JSON.stringify(all);
searchEvents(all, { q: 'lagos', city: 'Lagos' }, 'price');
console.log(`Original list unchanged after a search? ${JSON.stringify(all) === before}`);
