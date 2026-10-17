// Build 4/5/7: the server entry point.
//
//   npm start                 # PORT defaults to 3000
//   PORT=8080 npm start       # pick a port
//   DB_PATH=/tmp/x.db npm start
//   TOKEN_SECRET=... npm start  # sign tokens with your own key
//
// `buildServer()` composes the pieces: a repository, the services that hold the
// business rules, the guards that check tokens and roles, the routes that
// translate HTTP, and the app. It returns a node:http server WITHOUT starting
// it, so the tests can listen on a free port and pass their own in-memory
// repository.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createRouter } from './http/router.js';
import { registerRoutes } from './http/routes.js';
import { createApp } from './http/app.js';
import { createGuards } from './http/guards.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { createAuthService } from './services/authService.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';

export function buildServer({
  config = loadConfig(),
  repository = createSqliteRepository({ path: config.dbPath }),
  paymentGateway = createMockPaymentGateway(),
} = {}) {
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, paymentGateway);
  const authService = createAuthService(repository, { tokenSecret: config.tokenSecret });
  const guards = createGuards({ tokenSecret: config.tokenSecret });

  const router = createRouter();
  registerRoutes(router, { eventService, bookingService, authService, guards });

  const app = createApp({ router, publicDir: config.publicDir });
  return createServer((req, res) => {
    app(req, res);
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const config = loadConfig();
  if (!process.env.TOKEN_SECRET) {
    console.warn('TOKEN_SECRET is not set: using a random key for this run (tokens expire on restart).');
  }
  const server = buildServer({ config });
  server.listen(config.port, () => {
    console.log(`Ticketing server listening on http://localhost:${config.port}`);
    console.log(`Database: ${config.dbPath}`);
  });
}
