import { DomainError } from "./errors.js";
import { mergeSort } from "./sorting.js";

function invalid(message) {
  throw new DomainError("VALIDATION", message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isoTimestamp(value, label) {
  if (typeof value !== "string") {
    invalid(`${label} must be an ISO date string.`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match) {
    invalid(`${label} must be an ISO date string.`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const timestamp = Date.parse(value);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !Number.isFinite(timestamp)
  ) {
    invalid(`${label} must be a valid ISO date string.`);
  }

  return timestamp;
}

function dateOnlyEnd(value, timestamp) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return timestamp + 24 * 60 * 60 * 1000 - 1;
  }
  return timestamp;
}

function tiersOf(summary) {
  return Array.isArray(summary.tiers) ? summary.tiers : [];
}

function cheapestPrice(summary) {
  let cheapest;
  for (const tier of tiersOf(summary)) {
    if (Number.isSafeInteger(tier.priceCents) && tier.priceCents >= 0) {
      if (cheapest === undefined || tier.priceCents < cheapest) {
        cheapest = tier.priceCents;
      }
    }
  }
  return cheapest;
}

function availableSeats(summary) {
  return tiersOf(summary).reduce(
    (total, tier) => total + (Number.isSafeInteger(tier.available) && tier.available > 0 ? tier.available : 0),
    0,
  );
}

function compareText(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function tieBreak(left, right) {
  return compareText(left.title, right.title) || compareText(left.id, right.id);
}

export function filterEvents(summaries, criteria = {}) {
  if (!Array.isArray(summaries)) {
    invalid("summaries must be an array.");
  }
  if (!isRecord(criteria)) {
    invalid("criteria must be an object.");
  }

  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;
  if (q !== undefined && typeof q !== "string") {
    invalid("q must be a string.");
  }
  if (city !== undefined && typeof city !== "string") {
    invalid("city must be a string.");
  }
  if (from !== undefined) {
    isoTimestamp(from, "from");
  }
  if (to !== undefined) {
    isoTimestamp(to, "to");
  }
  if (
    maxPriceCents !== undefined &&
    (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)
  ) {
    invalid("maxPriceCents must be a non-negative whole number of cents.");
  }
  if (onlyAvailable !== undefined && typeof onlyAvailable !== "boolean") {
    invalid("onlyAvailable must be a boolean.");
  }

  const fromTimestamp = from === undefined ? undefined : isoTimestamp(from, "from");
  const toTimestamp = to === undefined ? undefined : dateOnlyEnd(to, isoTimestamp(to, "to"));
  const query = q?.toLowerCase();
  const cityQuery = city?.toLowerCase();

  return summaries.filter((summary) => {
    if (query !== undefined) {
      const title = String(summary.title ?? "").toLowerCase();
      const venue = String(summary.venue ?? "").toLowerCase();
      if (!title.includes(query) && !venue.includes(query)) {
        return false;
      }
    }
    if (cityQuery !== undefined && String(summary.city ?? "").toLowerCase() !== cityQuery) {
      return false;
    }
    if (fromTimestamp !== undefined || toTimestamp !== undefined) {
      const eventTimestamp = isoTimestamp(summary.date, "event date");
      if (fromTimestamp !== undefined && eventTimestamp < fromTimestamp) {
        return false;
      }
      if (toTimestamp !== undefined && eventTimestamp > toTimestamp) {
        return false;
      }
    }
    if (maxPriceCents !== undefined) {
      const price = cheapestPrice(summary);
      if (price === undefined || price > maxPriceCents) {
        return false;
      }
    }
    if (onlyAvailable && availableSeats(summary) === 0) {
      return false;
    }
    return true;
  });
}

export function sortEvents(summaries, sortBy) {
  if (!Array.isArray(summaries)) {
    invalid("summaries must be an array.");
  }
  if (!["date", "price", "availability"].includes(sortBy)) {
    invalid(`Unknown event sort option "${sortBy}".`);
  }

  const compare = (left, right) => {
    let order = 0;
    if (sortBy === "date") {
      order = isoTimestamp(left.date, "event date") - isoTimestamp(right.date, "event date");
    } else if (sortBy === "price") {
      const leftPrice = cheapestPrice(left);
      const rightPrice = cheapestPrice(right);
      if (leftPrice === undefined && rightPrice !== undefined) {
        order = 1;
      } else if (leftPrice !== undefined && rightPrice === undefined) {
        order = -1;
      } else if (leftPrice !== undefined && rightPrice !== undefined) {
        order = leftPrice - rightPrice;
      }
    } else {
      order = availableSeats(right) - availableSeats(left);
    }
    return order || tieBreak(left, right);
  };

  return mergeSort(summaries, compare);
}

export function searchEvents(summaries, criteria, sortBy) {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
