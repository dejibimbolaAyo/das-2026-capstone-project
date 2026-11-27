import { pathToFileURL } from 'node:url';
import { getPort } from './config.js';
import { createApp } from './http/app.js';

export function startServer(options = {}) {
  const port = options.port ?? getPort();
  const host = options.host ?? '127.0.0.1';
  const server = createApp(options);
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`Server listening on http://${host}:${actualPort}`);
  });
  return server;
}

export { createApp };

const isDirectRun = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) startServer();
