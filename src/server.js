import http from "node:http";
import { createRouter } from "./routes/index.js";
import { sendError } from "./routes/respond.js";
import { createMemoryStore } from "./data/memoryStore.js";
import { createEventService } from "./services/eventService.js";
import { createBookingService } from "./services/bookingService.js";
import { createAuthService } from "./services/authService.js";
import { createWaitlistService } from "./services/waitlistService.js";
import { createSeatService } from "./services/seatService.js";
import { createMaintenance } from "./jobs/maintenance.js";

// The server only wires things together. It does not decide anything itself.
// It does not start listening: start.js does that, and the tests do it their own way.
//
//   store (data)  ->  services  ->  routes
// tokenSecret: the key that signs login tokens. If you give none, a random one is made, so every
// login stops working when the server restarts. Tests may pass a fast hashCost and a fake clock
// (clock: anything with a now() method, see src/lib/clock.js; or the older now: () => milliseconds).
// maintenanceIntervalMs: how often the server lets go of expired holds and offers. 0 = never by itself
// (the tests call server.maintenance.run() when they want it).
export function createServer({ publicDir, store = createMemoryStore(), tokenSecret, now, clock, hashCost, maintenanceIntervalMs = 0 } = {}) {
  const clockNow = clock ? () => clock.now() : now;
  const options = clockNow ? { now: clockNow } : {};
  const services = {
    events: createEventService(store),
    bookings: createBookingService(store, options),
    waitlist: createWaitlistService(store, options),
    auth: createAuthService(store, { secret: tokenSecret, now: clockNow, hashCost }),
  };
  const maintenance = createMaintenance({
    seats: createSeatService(store, options),
    log: (line) => console.log(line),
  });
  const route = createRouter({ publicDir, services });

  const server = http.createServer((req, res) => {
    Promise.resolve(route(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        sendError(req, res, 500, "INTERNAL", "Something went wrong on the server.");
      } else {
        res.end();
      }
    });
  });

  server.maintenance = maintenance;
  if (maintenanceIntervalMs > 0) {
    maintenance.start(maintenanceIntervalMs);
    server.on("close", () => maintenance.stop());
  }
  return server;
}
