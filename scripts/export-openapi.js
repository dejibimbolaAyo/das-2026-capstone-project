// Run with: npm run export:openapi
// Writes the OpenAPI document to docs/openapi.json, for tools that import a
// file (Hoppscotch, Postman, Insomnia). The live copy is GET /openapi.json.

import { writeFileSync } from 'node:fs';
import { openApiDocument } from '../src/http/openapi.js';
import { PORT } from '../src/config.js';

const file = new URL('../docs/openapi.json', import.meta.url);
const document = { ...openApiDocument, servers: [{ url: `http://localhost:${PORT}`, description: 'Local server' }] };
writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
console.log('Wrote docs/openapi.json');
