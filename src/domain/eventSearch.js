// Search and sorting work on event lists without changing the caller's list.

function tiersForEvent(event, tiers) {
  return (event.tierIds ?? [])
    .map((tierId) => tiers.get(tierId))
    .filter(Boolean);
}

function eventPrice(event, tiers) {
  return tiersForEvent(event, tiers)
    .reduce((lowest, tier) => Math.min(lowest, tier.priceCents), Infinity);
}

function eventAvailability(event, tiers) {
  return tiersForEvent(event, tiers)
    .reduce((total, tier) => total + tier.capacity - tier.sold, 0);
}

function dateBound(value, endOfDay = false) {
  if (value === undefined) return undefined;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Date filters must be valid date strings');
  }
  return date.getTime();
}

function validatePriceFilter(value, name) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new TypeError(`${name} must be a non-negative whole number of cents`);
  }
}

/**
 * Return matching events in their original order.
 * Price filters match an event when at least one tier is in the price range.
 */
export function searchEvents(events, tiers, filters = {}) {
  const {
    text = '',
    city,
    startDate,
    endDate,
    minPriceCents,
    maxPriceCents,
  } = filters;

  validatePriceFilter(minPriceCents, 'minPriceCents');
  validatePriceFilter(maxPriceCents, 'maxPriceCents');

  const start = dateBound(startDate);
  const end = dateBound(endDate, true);
  const query = text.trim().toLocaleLowerCase();
  const cityQuery = city?.trim().toLocaleLowerCase();

  return events.filter((event) => {
    const searchableText = `${event.title} ${event.city} ${event.venue ?? ''}`.toLocaleLowerCase();
    if (query && !searchableText.includes(query)) return false;
    if (cityQuery && event.city.toLocaleLowerCase() !== cityQuery) return false;

    const eventTime = new Date(event.startsAt).getTime();
    if (start !== undefined && eventTime < start) return false;
    if (end !== undefined && eventTime > end) return false;

    if (minPriceCents !== undefined || maxPriceCents !== undefined) {
      const eventTiers = tiersForEvent(event, tiers);
      const hasMatchingPrice = eventTiers.some((tier) =>
        (minPriceCents === undefined || tier.priceCents >= minPriceCents)
        && (maxPriceCents === undefined || tier.priceCents <= maxPriceCents));
      if (!hasMatchingPrice) return false;
    }

    return true;
  });
}

function compareEvents(left, right, by, tiers) {
  let leftValue;
  let rightValue;

  if (by === 'date') {
    leftValue = new Date(left.startsAt).getTime();
    rightValue = new Date(right.startsAt).getTime();
  } else if (by === 'price') {
    leftValue = eventPrice(left, tiers);
    rightValue = eventPrice(right, tiers);
  } else {
    leftValue = eventAvailability(left, tiers);
    rightValue = eventAvailability(right, tiers);
  }

  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}

function merge(left, right, compare) {
  const result = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    // Taking from the left on ties keeps equal events in their original order.
    if (compare(left[leftIndex], right[rightIndex]) <= 0) {
      result.push(left[leftIndex]);
      leftIndex += 1;
    } else {
      result.push(right[rightIndex]);
      rightIndex += 1;
    }
  }

  return result.concat(left.slice(leftIndex), right.slice(rightIndex));
}

function mergeSort(events, compare) {
  if (events.length < 2) return events;

  const middle = Math.floor(events.length / 2);
  const left = mergeSort(events.slice(0, middle), compare);
  const right = mergeSort(events.slice(middle), compare);
  return merge(left, right, compare);
}

/**
 * Sort by date, cheapest tier price, or total seats left, using a stable merge sort.
 */
export function sortEvents(events, tiers, { by = 'date', direction = 'asc' } = {}) {
  if (!['date', 'price', 'availability'].includes(by)) {
    throw new TypeError('Sort by must be date, price, or availability');
  }
  if (!['asc', 'desc'].includes(direction)) {
    throw new TypeError('Sort direction must be asc or desc');
  }

  const directionMultiplier = direction === 'asc' ? 1 : -1;
  const compare = (left, right) => directionMultiplier * compareEvents(left, right, by, tiers);
  return mergeSort(events.slice(), compare);
}
