// Build 2: search, filter and sort over event summaries.
// Pure functions only: they take events in and give a new list back. They never
// change the array or the events they are handed.
//
// A "summary" is what listEventSummaries() in inventory.js produces:
//   { id, title, city, venue, startsAt, status, minPriceCents, totalSeatsLeft, tierCount }

import { mergeSort } from './sorting.js';
import { DomainError } from './errors.js';
import { requireValidDate } from './validation.js';

// The tie-breaker for every sort: title first, then id, so the order is total.
function byTitleThenId(a, b) {
  const byTitle = String(a.title).localeCompare(String(b.title));
  return byTitle !== 0 ? byTitle : String(a.id).localeCompare(String(b.id));
}

export function filterEvents(summaries, { q, city, from, to, maxPriceCents, onlyAvailable } = {}) {
  let list = Array.isArray(summaries) ? summaries.slice() : [];

  if (q) {
    const needle = String(q).toLowerCase().trim();
    list = list.filter((event) =>
      String(event.title || '').toLowerCase().includes(needle) ||
      String(event.venue || '').toLowerCase().includes(needle));
  }

  if (city) {
    const wanted = String(city).toLowerCase().trim();
    list = list.filter((event) => String(event.city || '').toLowerCase() === wanted);
  }

  if (from) {
    const fromDate = requireValidDate(from, 'from');
    list = list.filter((event) => new Date(event.startsAt) >= fromDate);
  }

  if (to) {
    const toDate = requireValidDate(to, 'to');
    // A date-only 'to' means the whole day, so include everything up to 23:59:59.999.
    const endOfDay = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
    list = list.filter((event) => new Date(event.startsAt) <= endOfDay);
  }

  if (maxPriceCents !== undefined && maxPriceCents !== null) {
    if (!Number.isInteger(maxPriceCents)) {
      throw new DomainError('VALIDATION', 'maxPriceCents must be a whole number of cents');
    }
    // An event whose cheapest tier is within the maximum. Events with no tiers
    // have no price, so they are left out.
    list = list.filter((event) =>
      event.minPriceCents !== null &&
      event.minPriceCents !== undefined &&
      event.minPriceCents <= maxPriceCents);
  }

  if (onlyAvailable) {
    list = list.filter((event) => (event.totalSeatsLeft || 0) > 0);
  }

  return list;
}

export function sortEvents(summaries, sortBy) {
  const list = Array.isArray(summaries) ? summaries.slice() : [];
  if (!sortBy) return list;

  if (sortBy === 'date') {
    return mergeSort(list, (a, b) => {
      const da = new Date(a.startsAt).getTime();
      const db = new Date(b.startsAt).getTime();
      if (da !== db) return da - db; // earliest first
      return byTitleThenId(a, b);
    });
  }

  if (sortBy === 'price') {
    return mergeSort(list, (a, b) => {
      const pa = a.minPriceCents;
      const pb = b.minPriceCents;
      const aHasPrice = pa !== null && pa !== undefined;
      const bHasPrice = pb !== null && pb !== undefined;
      if (aHasPrice && bHasPrice && pa !== pb) return pa - pb; // cheapest first
      if (aHasPrice !== bHasPrice) return aHasPrice ? -1 : 1; // no price goes last
      return byTitleThenId(a, b);
    });
  }

  if (sortBy === 'availability') {
    return mergeSort(list, (a, b) => {
      const sa = a.totalSeatsLeft || 0;
      const sb = b.totalSeatsLeft || 0;
      if (sa !== sb) return sb - sa; // most seats left first
      return byTitleThenId(a, b);
    });
  }

  throw new DomainError('VALIDATION', `Unknown sortBy: ${sortBy}`);
}

export function searchEvents(summaries, criteria = {}, sortBy) {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
