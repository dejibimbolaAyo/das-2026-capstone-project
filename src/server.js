import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createApp } from "./http/app.js";
import { loadConfig } from "./config.js";

export function startServer(port = loadConfig().port) {
  const server = createApp();
  server.listen(port, () => {
    const address = server.address();
    console.log(`Event ticketing server listening on port ${typeof address === "object" ? address.port : port}.`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer();
}
