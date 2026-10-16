// The checkout countdown. Pure functions: you give them the clock, so tests can fake time.

export function secondsLeft(expiresAtMs, nowMs) {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(s / 60)).padStart(2, "0");
  const seconds = String(s % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// Screen readers should NOT hear every second. They hear a short message at a few moments only.
const MILESTONES = new Map([
  [300, "5 minutes left to pay."],
  [60, "1 minute left to pay."],
  [30, "30 seconds left to pay."],
  [10, "10 seconds left to pay."],
  [0, "Time is up. Your seats have been released."],
]);

export function milestoneMessage(seconds) {
  return MILESTONES.get(seconds) ?? null;
}
