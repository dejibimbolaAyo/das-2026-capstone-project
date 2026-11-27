import { DomainError } from './errors.js';
import { mergeSort } from './sorting.js';

function dateBound(value, endOfDay = false) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', 'Date filters must be ISO date strings');
  }

  const datePart = value.slice(0, 10);
  const validDatePart = /^\d{4}-\d{2}-\d{2}$/.test(datePart);
  const dateOnly = value.length === 10;
  if (!validDatePart || (!dateOnly && value[10] !== 'T')) {
    throw new DomainError('VALIDATION', 'Date filters must be ISO date strings');
  }

  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    throw new DomainError('VALIDATION', 'Date filters must be valid dates');
  }

  if (dateOnly) {
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`).getTime();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION', 'Date filters must be valid dates');
  }
  return date.getTime();
}

function validatePrice(value) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new DomainError('VALIDATION', 'maxPriceCents must be a non-negative whole number');
  }
}

export function filterEvents(summaries, {
  q = '',
  city,
  from,
  to,
  maxPriceCents,
  onlyAvailable = false,
} = {}) {
  if (typeof q !== 'string' || (city !== undefined && typeof city !== 'string')) {
    throw new DomainError('VALIDATION', 'Search text and city must be strings');
  }
  validatePrice(maxPriceCents);

  const fromTime = dateBound(from);
  const toTime = dateBound(to, true);
  const query = q.trim().toLocaleLowerCase();
  const cityQuery = city?.trim().toLocaleLowerCase();

  return summaries.filter((event) => {
    const searchableText = `${event.title} ${event.venue ?? ''}`.toLocaleLowerCase();
    if (query && !searchableText.includes(query)) return false;
    if (cityQuery && event.city.toLocaleLowerCase() !== cityQuery) return false;

    const eventTime = new Date(event.startsAt).getTime();
    if (fromTime !== undefined && eventTime < fromTime) return false;
    if (toTime !== undefined && eventTime > toTime) return false;
    if (maxPriceCents !== undefined
      && (event.minPriceCents === null || event.minPriceCents > maxPriceCents)) return false;
    if (onlyAvailable && event.seatsLeft <= 0) return false;
    return true;
  });
}

function compareText(left, right) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function compareTitleAndId(left, right) {
  return compareText(left.title, right.title) || compareText(left.id, right.id);
}

function compareEvents(left, right, sortBy) {
  let comparison = 0;

  if (sortBy === 'date') {
    const leftDay = new Date(left.startsAt).toISOString().slice(0, 10);
    const rightDay = new Date(right.startsAt).toISOString().slice(0, 10);
    comparison = compareText(leftDay, rightDay);
  } else if (sortBy === 'price') {
    if (left.minPriceCents === null) return right.minPriceCents === null ? compareTitleAndId(left, right) : 1;
    if (right.minPriceCents === null) return -1;
    comparison = left.minPriceCents - right.minPriceCents;
  } else {
    comparison = right.seatsLeft - left.seatsLeft;
  }

  return comparison || compareTitleAndId(left, right);
}

export function sortEvents(summaries, sortBy) {
  if (!['date', 'price', 'availability'].includes(sortBy)) {
    throw new DomainError('VALIDATION', 'sortBy must be date, price, or availability');
  }
  return mergeSort(summaries, (left, right) => compareEvents(left, right, sortBy));
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}

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
