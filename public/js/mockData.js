// Fake data, shaped like the real API (see docs/api-examples.md).
// Only api.js may import this file. Pages never do.
// Prices are whole cents (kobo): 250000 is ₦2,500.

function tier(id, name, priceCents, capacity, sold) {
  return { id, name, priceCents, capacity, sold, seatsLeft: capacity - sold };
}

export const mockEvents = [
  {
    id: 'evt-lagos-tech',
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Landmark Centre',
    startsAt: '2026-12-05T17:00:00Z',
    status: 'published',
    tiers: [tier('tier-lagos-general', 'General', 500000, 100, 40), tier('tier-lagos-vip', 'VIP', 1500000, 10, 10)],
  },
  {
    id: 'evt-abuja-jazz',
    title: 'Abuja Jazz Night',
    city: 'Abuja',
    venue: 'Transcorp Hilton',
    startsAt: '2026-12-12T19:00:00Z',
    status: 'published',
    tiers: [tier('tier-jazz-standard', 'Standard', 800000, 200, 150), tier('tier-jazz-table', 'Table for four', 4000000, 20, 3)],
  },
  {
    id: 'evt-ibadan-food',
    title: 'Ibadan Food Fair',
    city: 'Ibadan',
    venue: 'Cultural Centre Mokola',
    startsAt: '2026-12-19T10:00:00Z',
    status: 'published',
    tiers: [tier('tier-food-entry', 'Entry', 250000, 500, 120)],
  },
  {
    id: 'evt-lagos-comedy',
    title: 'Lagos Comedy Night',
    city: 'Lagos',
    venue: 'Muson Centre',
    startsAt: '2026-12-26T18:30:00Z',
    status: 'published',
    tiers: [tier('tier-comedy-regular', 'Regular', 1000000, 2, 0), tier('tier-comedy-front', 'Front row', 2500000, 5, 3)],
  },
  {
    id: 'evt-pharcyde-sold-out',
    title: 'Sold Out Live Concert',
    city: 'Port Harcourt',
    venue: 'Hotel Presidential',
    startsAt: '2027-01-09T20:00:00Z',
    status: 'published',
    tiers: [tier('tier-concert-ga', 'General admission', 1200000, 50, 50)],
  },
];
