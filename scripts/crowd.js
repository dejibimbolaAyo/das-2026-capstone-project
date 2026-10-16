import { Worker } from "node:worker_threads";

// Sends a crowd at one tier, all at the same moment, each member on its own database connection.
//   workers x attemptsEach = how many people try
//   mode "safe"  = the real store (the fix)
//   mode "naive" = the buggy look-then-write version (needs attemptsEach = 1)
// Returns { succeeded, soldOut, failed: [...] } added up over the whole crowd.
export async function runCrowd({ dbFile, eventId, tierId, workers = 5, attemptsEach = 10, mode = "safe" }) {
  const control = new SharedArrayBuffer(16);
  const flags = new Int32Array(control);
  const totalAttempts = workers * attemptsEach;

  const threads = [];
  const ready = [];
  const finished = [];
  for (let n = 0; n < workers; n++) {
    const worker = new Worker(new URL("./ticketWorker.js", import.meta.url), {
      workerData: { dbFile, eventId, tierId, attempts: attemptsEach, mode, workerNo: n + 1, totalAttempts, control },
    });
    threads.push(worker);
    ready.push(
      new Promise((resolve, reject) => {
        worker.on("error", reject);
        worker.on("message", (m) => m.ready && resolve());
      })
    );
    finished.push(
      new Promise((resolve, reject) => {
        worker.on("error", reject);
        worker.on("message", (m) => m.done && resolve(m.result));
      })
    );
  }

  await Promise.all(ready); // everyone is at the start line
  Atomics.store(flags, 0, 1); // GO!
  Atomics.notify(flags, 0);

  const results = await Promise.all(finished);
  await Promise.all(threads.map((w) => w.terminate()));

  return results.reduce(
    (sum, r) => ({
      succeeded: sum.succeeded + r.succeeded,
      soldOut: sum.soldOut + r.soldOut,
      failed: [...sum.failed, ...r.failed],
    }),
    { succeeded: 0, soldOut: 0, failed: [] }
  );
}
