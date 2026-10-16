import { DomainError } from "./errors.js";
import { isValidIsoDate, lowestPriceCents } from "./events.js";

function isWholeCents(n) {
  return Number.isInteger(n) && n >= 0;
}

// S05: search and filter events.
// Returns a NEW array. The list you pass in is never changed.
// Only PUBLISHED events can be found. Every filter is optional.
//
// filters:
//   text           words to find in the title, city or venue
//   city           exact city (any capital letters)
//   dateFrom       earliest date, like "2026-12-01"
//   dateTo         latest date, like "2026-12-31"
//   minPriceCents  the event's cheapest tier must cost at least this
//   maxPriceCents  the event's cheapest tier must cost at most this
export function searchEvents(events, filters) {
  // No filters at all (undefined or null) means "show everything that is published".
  const { text, city, dateFrom, dateTo, minPriceCents, maxPriceCents } = filters ?? {};

  if (dateFrom != null && !isValidIsoDate(dateFrom)) {
    throw new DomainError("VALIDATION", "dateFrom must look like 2026-12-01.");
  }
  if (dateTo != null && !isValidIsoDate(dateTo)) {
    throw new DomainError("VALIDATION", "dateTo must look like 2026-12-31.");
  }
  if (dateFrom != null && dateTo != null && dateFrom > dateTo) {
    throw new DomainError("VALIDATION", "dateFrom cannot be after dateTo.");
  }
  if (minPriceCents != null && !isWholeCents(minPriceCents)) {
    throw new DomainError("VALIDATION", "minPriceCents must be a whole number of cents, 0 or more.");
  }
  if (maxPriceCents != null && !isWholeCents(maxPriceCents)) {
    throw new DomainError("VALIDATION", "maxPriceCents must be a whole number of cents, 0 or more.");
  }
  if (minPriceCents != null && maxPriceCents != null && minPriceCents > maxPriceCents) {
    throw new DomainError("VALIDATION", "minPriceCents cannot be more than maxPriceCents.");
  }

  const needle = typeof text === "string" ? text.trim().toLowerCase() : "";
  const wantedCity = typeof city === "string" ? city.trim().toLowerCase() : "";

  return events.filter((event) => {
    if (event.status !== "published") return false;

    if (needle) {
      const haystack = `${event.title} ${event.city} ${event.venue}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (wantedCity && event.city.toLowerCase() !== wantedCity) return false;
    if (dateFrom != null && event.date < dateFrom) return false;
    if (dateTo != null && event.date > dateTo) return false;

    const price = lowestPriceCents(event);
    if (minPriceCents != null && price < minPriceCents) return false;
    if (maxPriceCents != null && price > maxPriceCents) return false;

    return true;
  });
}
