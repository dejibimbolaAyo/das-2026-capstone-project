import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "./src/server.js";

// SQLite is built into Node from version 22.13. Say so clearly if Node is older.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`This project needs Node 22.13 or newer. You have ${process.versions.node}.`);
  process.exit(1);
}
const { createSqliteStore } = await import("./src/data/sqliteStore.js");

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a whole number from 1 to 65535. You gave: ${process.env.PORT}`);
  process.exit(1);
}

// Where the data lives. The default is data/tickets.sqlite inside the project (not committed to Git).
// DB_FILE=:memory: gives a throw-away database that starts empty and is lost when you stop.
const dbFile = process.env.DB_FILE || fileURLToPath(new URL("./data/tickets.sqlite", import.meta.url));
if (dbFile !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });

let store;
try {
  store = createSqliteStore(dbFile);
} catch (err) {
  console.error(`Could not open the database "${dbFile}": ${err.message}`);
  process.exit(1);
}

// The secret key that signs login tokens. NEVER write it in the code or commit it to Git.
// Set it yourself (TOKEN_SECRET, at least 16 characters) to keep logins working across restarts.
// If you do not, a random one is made each time, and everybody has to log in again after a restart.
const tokenSecret = process.env.TOKEN_SECRET || undefined;
if (tokenSecret !== undefined && tokenSecret.length < 16) {
  console.error("TOKEN_SECRET must be at least 16 characters long.");
  store.close();
  process.exit(1);
}

const server = createServer({ publicDir, store, tokenSecret });

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Close the other server, or pick another port.`);
  } else {
    console.error(err);
  }
  store.close();
  process.exit(1);
});

server.listen(port, () => {
  console.log(`Server is running.`);
  console.log(`  Website:  http://localhost:${port}/`);
  console.log(`  Health:   http://localhost:${port}/health`);
  console.log(`  Database: ${dbFile === ":memory:" ? "in memory (lost when you stop)" : path.resolve(dbFile)}`);
  console.log(`  Logins:   ${tokenSecret ? "signed with your TOKEN_SECRET" : "signed with a random key (everyone logs in again after a restart)"}`);
  console.log(`Press Ctrl + C to stop.`);
});

process.on("SIGINT", () => {
  console.log("\nStopping the server.");
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeAllConnections();
});
