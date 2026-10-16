import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { createSqliteStore } from "../src/data/sqliteStore.js";
import { naiveBook } from "./naiveBooking.js";

// One "crowd member": a thread with its OWN connection to the database file,
// like a separate server process would have.
// It waits at the start line until the main thread says GO, so everyone starts together.
const { dbFile, eventId, tierId, attempts, mode, workerNo, totalAttempts, control } = workerData;
const flags = new Int32Array(control); // [0] = GO signal, [1] = how many reached the middle

const result = { succeeded: 0, soldOut: 0, failed: [] };

function record(err) {
  if (err?.code === "SOLD_OUT") result.soldOut += 1;
  else result.failed.push(`${err?.code ?? "ERROR"}: ${err?.message}`);
}

let store = null;
let rawDb = null;
if (mode === "safe") {
  store = createSqliteStore(dbFile);
} else {
  rawDb = new DatabaseSync(dbFile);
  rawDb.exec("PRAGMA busy_timeout = 5000");
}

parentPort.postMessage({ ready: true });
Atomics.wait(flags, 0, 0); // sleep until the main thread sets the GO flag

if (mode === "safe") {
  for (let i = 0; i < attempts; i++) {
    try {
      const event = store.requireEvent(eventId);
      store.bookings.book(event, tierId, `Person ${workerNo}-${i}`, 1);
      result.succeeded += 1;
    } catch (err) {
      record(err);
    }
  }
  store.close();
} else {
  // naive: everybody LOOKS, then everybody waits until all have looked, then everybody WRITES.
  const waitForEveryoneToLook = () => {
    Atomics.add(flags, 1, 1);
    while (Atomics.load(flags, 1) < totalAttempts) Atomics.wait(flags, 2, 0, 1);
  };
  for (let i = 0; i < attempts; i++) {
    try {
      await naiveBook(rawDb, eventId, tierId, `Person ${workerNo}-${i}`, 1, waitForEveryoneToLook);
      result.succeeded += 1;
    } catch (err) {
      record(err);
    }
  }
  rawDb.close();
}

parentPort.postMessage({ done: true, result });
