// Words for refunds and waitlist offers. Pure logic (no page, no data file), so Node can test it.
import { formatMoney } from "./money.js";

// The policy, in the same words everywhere on the site. (The SERVER decides the real amount.)
export const REFUND_POLICY_LINES = [
  "7 days or more before the event: 100% back.",
  "2 days or more before the event: 50% back.",
  "Less than 2 days before the event: nothing back. Your seats still go back on sale.",
];

// What to tell the person BEFORE they confirm a cancel.
// refund = { percent, refundCents, paid } from the server.  totalCents = what the booking cost.
export function refundMessage(refund, totalCents) {
  if (!refund || !refund.paid) return "You have not paid yet, so there is nothing to refund. Your seats go back on sale.";
  if (refund.refundCents === 0) {
    return totalCents === 0
      ? "This booking was free, so there is nothing to refund. Your seats go back on sale."
      : "The event is less than 2 days away, so you will get nothing back. Your seats go back on sale.";
  }
  const part = refund.percent === 100 ? "all of it" : `${refund.percent}% of ${formatMoney(totalCents)}`;
  return `You will get ${formatMoney(refund.refundCents)} back (${part}). Your seats go back on sale.`;
}

// After the cancel went through.
export function refundDoneMessage(refund) {
  if (!refund || !refund.paid) return "Booking cancelled. Your seats went back on sale.";
  if (refund.refundCents === 0) return "Booking cancelled. No refund is due, and your seats went back on sale.";
  return `Booking cancelled. ${formatMoney(refund.refundCents)} is on its way back to you.`;
}

// "Place 2 in line" / "Seat offered: respond in 12:30" / "Offer ran out"
export function waitlistStatusWords(entry, secondsLeftForOffer = null) {
  if (entry.status === "waiting") return `You are number ${entry.position} in line.`;
  if (entry.status === "offered") {
    return secondsLeftForOffer === null ? "A seat is being held for you." : `A seat is held for you. Accept within ${formatMinutesSeconds(secondsLeftForOffer)}.`;
  }
  if (entry.status === "expired") return "This offer ran out. The seat went to the next person.";
  if (entry.status === "accepted") return "You accepted this offer. Look for the booking in your tickets.";
  return "You left this waitlist.";
}

export function formatMinutesSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
