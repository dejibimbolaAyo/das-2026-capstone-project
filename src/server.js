import { pathToFileURL } from 'node:url';
import { createAppServer } from './http/app.js';
import { PORT } from './config.js';

export function startServer(port = PORT) {
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`Event ticketing server listening on port ${port}`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
