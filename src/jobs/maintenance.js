// JOBS layer: work the server does by itself, on a timer, with nobody asking.
//
// The maintenance job lets go of everything that has run out of time:
//   unpaid bookings (their seats come back), waitlist offers that were not accepted,
// and then offers each freed seat to the next person waiting.
//
// The job is a plain function, so the tests call run() directly with a fake clock.
// Only the real server starts the timer (see start.js), so tests never leave a timer running.
export function createMaintenance({ seats, log = () => {} }) {
  let timer = null;

  function run() {
    const result = seats.sweep();
    const parts = [];
    if (result.expiredBookings.length) parts.push(`${result.expiredBookings.length} unpaid booking(s) expired`);
    if (result.expiredOffers.length) parts.push(`${result.expiredOffers.length} offer(s) ran out`);
    if (result.newOffers.length) parts.push(`${result.newOffers.length} seat(s) offered`);
    if (parts.length) log(`Maintenance: ${parts.join(", ")}.`);
    return result;
  }

  return {
    run,
    // Run every intervalMs. unref() means the timer never keeps the program alive by itself.
    start(intervalMs) {
      if (!Number.isInteger(intervalMs) || intervalMs < 100) {
        throw new Error("The maintenance interval must be a whole number of milliseconds, 100 or more.");
      }
      if (timer) return;
      timer = setInterval(() => {
        try {
          run();
        } catch (err) {
          console.error("Maintenance job failed:", err.message); // keep running; try again next time
        }
      }, intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
