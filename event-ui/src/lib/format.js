// Money is whole cents everywhere. Only this file turns it into text.
export function formatMoney(cents) {
  const naira = cents / 100;
  return '₦' + naira.toLocaleString('en-NG', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

// 600 seconds -> "10:00"
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// "2500" or "2,500.50" -> 250000 / 250050 whole cents, or null if it is not money.
// Strings, not floats: 19.99 * 100 is 1998.9999999999998 in JavaScript.
export function parseMoneyToCents(text) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).replace(/,/g, '').trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
