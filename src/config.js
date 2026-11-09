import { fileURLToPath } from 'node:url';

const portValue = process.env.PORT;
export const PORT = portValue === undefined || portValue === '' ? 3000 : Number(portValue);

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  throw new RangeError('PORT must be an integer between 0 and 65535');
}

// Where the server keeps its SQLite file. data/ is in .gitignore.
const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../data/ticketing.db', import.meta.url));
export const DATABASE_PATH = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
