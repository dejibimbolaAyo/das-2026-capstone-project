import { pathToFileURL } from 'node:url';
import { createAppServer } from './http/app.js';
import { Router } from './http/router.js';
import { registerApiRoutes } from './http/routes.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createBookingService } from './services/bookingService.js';
import { createEventService } from './services/eventService.js';
import { DATABASE_PATH, PORT } from './config.js';

// The one place where the layers are wired together. Tests call this too, and
// can pass in their own repository or payment gateway. With no repository, it
// uses an empty SQLite database in memory.
export function createTicketingServer({
  repository = createSqliteRepository(),
  paymentGateway = createMockPaymentGateway(),
} = {}) {
  const eventService = createEventService({ repository });
  const bookingService = createBookingService({ repository, paymentGateway });
  const router = registerApiRoutes(new Router(), { eventService, bookingService });
  return createAppServer({ router });
}

// The real server keeps its data in a SQLite file, so it survives a restart.
export function startServer(port = PORT, databasePath = DATABASE_PATH) {
  const repository = createSqliteRepository({ path: databasePath });
  const server = createTicketingServer({ repository });
  server.on('close', () => repository.close());
  server.listen(port, () => {
    console.log(`Event ticketing server listening on port ${port}`);
    console.log(`Data is stored in ${databasePath}`);
  });

  const shutDown = () => server.close(() => process.exit(0));
  process.once('SIGINT', shutDown);
  process.once('SIGTERM', shutDown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
