// Pure functions: events in, events out. No store, no side effects.
// That makes them trivial to test and reuse (the API and the UI can share them).

import { mergeSort } from './sorting.js';
import { DomainError } from './errors.js';

// A summary is what the event list shows: the event plus numbers from its tiers.
export function summarizeEvent(event, tiers) {
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    tierCount: tiers.length,
    minPriceCents: tiers.length ? Math.min(...tiers.map((t) => t.priceCents)) : null,
    seatsLeft: tiers.reduce((total, t) => total + (t.capacity - t.sold), 0),
  };
}
function parseDate(value, field, { endOfDay = false } = {}) {
  const dateText = String(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateText);
  const dateTimeMatch = /^(\d{4}-\d{2}-\d{2})T/.exec(dateText);
  const calendarDate = isDateOnly ? dateText : dateTimeMatch?.[1];

  if (calendarDate) {
    const parsedDay = new Date(`${calendarDate}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDay.getTime()) ||
      parsedDay.toISOString().slice(0, 10) !== calendarDate
    ) {
      throw new DomainError('VALIDATION', `${field} must be a valid date`);
    }
  }

  const time = new Date(value).getTime();

  if (Number.isNaN(time)) {
    throw new DomainError('VALIDATION', `${field} must be a valid date`);
  }

  return endOfDay && isDateOnly
    ? time + 24 * 60 * 60 * 1000 - 1
    : time;
}
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function getSeatsLeft(event) {
  if (Number.isFinite(event.seatsLeft)) {
    return event.seatsLeft;
  }

  if (Array.isArray(event.tiers)) {
    return event.tiers.reduce((total, tier) => {
      if (Number.isFinite(tier.seatsLeft)) {
        return total + tier.seatsLeft;
      }

      return total + ((tier.capacity ?? 0) - (tier.sold ?? 0));
    }, 0);
  }

  return 0;
}
export function filterEvents(
  summaries,
  { q, city, from, to, maxPriceCents, onlyAvailable } = {}
) {
  const text = q?.trim().toLowerCase();
  const wantedCity = city?.trim().toLowerCase();

  const fromTime = from ? parseDate(from, 'from') : undefined;
  const toTime = to ? parseDate(to, 'to', { endOfDay: true }) : undefined;

  if (
    maxPriceCents !== undefined &&
    (!Number.isInteger(maxPriceCents) || maxPriceCents < 0)
  ) {
    throw new DomainError(
      'VALIDATION',
      'maxPriceCents must be a whole number of cents'
    );
  }

  return summaries.filter((event) => {
    if (text && !`${event.title} ${event.venue}`.toLowerCase().includes(text)) {
      return false;
    }

    if (wantedCity && event.city.toLowerCase() !== wantedCity) {
      return false;
    }

    const startsAt = new Date(event.startsAt).getTime();

    if (fromTime !== undefined && startsAt < fromTime) return false;
    if (toTime !== undefined && startsAt > toTime) return false;

    if (
      maxPriceCents !== undefined &&
      (event.minPriceCents === null || event.minPriceCents > maxPriceCents)
    ) {
      return false;
    }

      if (onlyAvailable && getSeatsLeft(event) <= 0) return false;

    return true;
  });
}

// Tie-breaker so the order is always the same, even when the main keys are equal.
const byTitleThenId = (a, b) =>
  compareText(a.title.toLowerCase(), b.title.toLowerCase()) || compareText(a.id, b.id);

const SORTERS = {
  // ISO date strings sort correctly as plain text.
  date: (a, b) => compareText(a.startsAt, b.startsAt) || byTitleThenId(a, b),
  // Events with no tiers have no price: put them last.
  price: (a, b) => {
    const priceA = a.minPriceCents ?? Infinity;
    const priceB = b.minPriceCents ?? Infinity;
    return (priceA === priceB ? 0 : priceA < priceB ? -1 : 1) || byTitleThenId(a, b);
  },
  // Most seats left first.
  availability: (a, b) =>
  getSeatsLeft(b) - getSeatsLeft(a) || byTitleThenId(a, b),
};

export const SORT_OPTIONS = Object.keys(SORTERS);

export function sortEvents(summaries, sortBy = 'date') {
  if (!Object.hasOwn(SORTERS, sortBy)) {
    throw new DomainError('VALIDATION', `sort must be one of: ${SORT_OPTIONS.join(', ')}`);
  }
  return mergeSort(summaries, SORTERS[sortBy]);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
