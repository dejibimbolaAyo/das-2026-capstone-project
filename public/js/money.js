// Small helpers for showing money and dates. No DOM here, so they can be tested in Node.
// Money is ALWAYS whole cents (kobo) inside the program. We only turn it into text for people.

export function formatMoney(cents) {
  if (!Number.isInteger(cents) || cents < 0) return "";
  if (cents === 0) return "Free";
  const naira = Math.floor(cents / 100);
  const kobo = cents % 100;
  const nairaText = String(naira).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "₦" + nairaText + (kobo ? "." + String(kobo).padStart(2, "0") : "");
}

// "8,000" or "8000.50" or "₦8000"  ->  800000 (cents).  Anything else -> null.
// Done with text, not with decimals, so there is no rounding surprise like 0.1 + 0.2.
export function nairaToCents(text) {
  const cleaned = String(text ?? "").replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "2026-11-07" -> { day: "07", month: "Nov", year: "2026", weekday: "Saturday", long: "Saturday 7 Nov 2026" }
// We read the parts from the text itself so the time zone of the computer can never shift the day.
export function describeDate(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate));
  if (!m) return { day: "", month: "", year: "", weekday: "", long: String(isoDate ?? "") };
  const [, year, month, day] = m;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()];
  const monthName = MONTHS[Number(month) - 1];
  return { day, month: monthName, year, weekday, long: `${weekday} ${Number(day)} ${monthName} ${year}` };
}

export function ticketWord(quantity) {
  return quantity === 1 ? "ticket" : "tickets";
}
