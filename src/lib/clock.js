// A CLOCK is something the code ASKS for the time, instead of calling Date.now() everywhere.
// Why: a test can then hold the time still, or jump forward 10 minutes, without waiting.
//
//   const clock = createFakeClock("2026-12-01T10:00:00Z");
//   clock.advance(10 * 60_000);      // ten minutes pass, instantly
//   clock.now();                     // milliseconds, like Date.now()

export function createSystemClock() {
  return { now: () => Date.now() };
}

// startAt: milliseconds, or a date text like "2026-12-01T10:00:00Z".
export function createFakeClock(startAt = "2026-01-01T00:00:00Z") {
  let current = typeof startAt === "number" ? startAt : Date.parse(startAt);
  if (!Number.isFinite(current)) throw new Error("createFakeClock needs a time it can understand.");
  return {
    now: () => current,
    set(time) {
      current = typeof time === "number" ? time : Date.parse(time);
      if (!Number.isFinite(current)) throw new Error("clock.set needs a time it can understand.");
    },
    advance(ms) {
      if (!Number.isFinite(ms)) throw new Error("clock.advance needs a number of milliseconds.");
      current += ms;
    },
  };
}
