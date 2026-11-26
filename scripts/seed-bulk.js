// Run with: npm run seed:bulk            (2,000 events)
//           npm run seed:bulk -- 50000   (any number you like)
// Adds lots of made-up events so you can measure search, sorting and page speed.
// Needs the demo organizer: run `npm run seed` first (this script also makes it if missing).
// The data is repeatable: the same number gives the same events every time.
// Added events are titled "... #1", "... #2" and so on, so they are easy to spot.

import { DATABASE_PATH } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createAuthService } from '../src/services/authService.js';
import { addBulkEvents } from './lib/bulkEvents.js';

const COUNT = Number(process.argv[2] ?? 2000);
if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 1_000_000) {
  console.error('Give a whole number of events between 1 and 1,000,000, for example: npm run seed:bulk -- 5000');
  process.exit(1);
}

const db = openDatabase(DATABASE_PATH);
const repository = createSqliteRepository({ db });
try {
  const auth = createAuthService({ repository, authSecret: 'seed-script-not-used-for-tokens' });
  const organizer =
    (await repository.findUserByEmail('organizer@demo.test')) ??
    (await auth.signup({ name: 'Demo Organizer', email: 'organizer@demo.test', password: 'demo-password-1', role: 'organizer' })).user;

  const startedAt = performance.now();
  const tiers = addBulkEvents(db, organizer.id, COUNT);
  const ms = performance.now() - startedAt;
  const total = db.prepare("SELECT COUNT(*) AS n FROM events WHERE status = 'published'").get().n;
  console.log(`Added ${COUNT} events and ${tiers} ticket tiers in ${ms.toFixed(0)} ms.`);
  console.log(`The database now has ${total} published events: ${DATABASE_PATH}`);
} finally {
  repository.close();
}
