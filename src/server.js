import http from "node:http";
import { createRouter } from "./routes/index.js";
import { sendError } from "./routes/respond.js";
import { createMemoryStore } from "./data/memoryStore.js";
import { createEventService } from "./services/eventService.js";
import { createBookingService } from "./services/bookingService.js";
import { createAuthService } from "./services/authService.js";

// The server only wires things together. It does not decide anything itself.
// It does not start listening: start.js does that, and the tests do it their own way.
//
//   store (data)  ->  services  ->  routes
// tokenSecret: the key that signs login tokens. If you give none, a random one is made, so every
// login stops working when the server restarts. Tests may pass a fast hashCost and a fake clock.
export function createServer({ publicDir, store = createMemoryStore(), tokenSecret, now, hashCost } = {}) {
  const services = {
    events: createEventService(store),
    bookings: createBookingService(store, { now }),
    auth: createAuthService(store, { secret: tokenSecret, now, hashCost }),
  };
  const route = createRouter({ publicDir, services });

  return http.createServer((req, res) => {
    Promise.resolve(route(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        sendError(req, res, 500, "INTERNAL", "Something went wrong on the server.");
      } else {
        res.end();
      }
    });
  });
}
