import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { BOOKING_STATES, BOOKING_TRANSITIONS, assertTransition, canTransition } from "../src/domain/bookingStateMachine.js";
import { DomainError } from "../src/domain/errors.js";
import { createApp } from "../src/http/app.js";
import { createRouter } from "../src/http/router.js";

test("booking state machine accepts every allowed transition", () => {
  for (const [from, destinations] of Object.entries(BOOKING_TRANSITIONS)) {
    for (const to of destinations) {
      assert.equal(canTransition(from, to), true);
      assert.equal(assertTransition(from, to), true);
    }
  }
});

test("booking state machine rejects every other transition with INVALID_TRANSITION", () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      if (BOOKING_TRANSITIONS[from].includes(to)) {
        continue;
      }

      assert.equal(canTransition(from, to), false);
      assert.throws(
        () => assertTransition(from, to),
        (error) => error instanceof DomainError && error.code === "INVALID_TRANSITION",
        `${from} must not transition to ${to}`,
      );
    }
  }
  assert.equal(canTransition("unknown", "paid"), false);
  assert.throws(
    () => assertTransition("pending", "unknown"),
    (error) => error instanceof DomainError && error.code === "INVALID_TRANSITION",
  );
});

test("router matches method and path parameters", () => {
  const router = createRouter();
  const handler = () => "matched";
  router.add("GET", "/events/:eventId/bookings/:reference", handler);

  const match = router.match("GET", "/events/event-7/bookings/ABCD-1234?view=full");
  assert.equal(match.handler, handler);
  assert.deepEqual(match.params, { eventId: "event-7", reference: "ABCD-1234" });
  assert.equal(router.match("POST", "/events/event-7/bookings/ABCD-1234"), undefined);
  assert.equal(router.match("GET", "/events/event-7"), undefined);
});

test("config defaults to 3000 and reads a valid PORT", () => {
  assert.deepEqual(loadConfig({}), { port: 3000 });
  assert.deepEqual(loadConfig({ PORT: "4321" }), { port: 4321 });
  assert.throws(
    () => loadConfig({ PORT: "not-a-port" }),
    (error) => error instanceof DomainError && error.code === "VALIDATION",
  );
});

test("HTTP app serves health, structured errors, and only files inside public", async () => {
  const server = createApp();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { status: "ok" });

    const unknownResponse = await fetch(`${baseUrl}/api/unknown`);
    assert.equal(unknownResponse.status, 404);
    const notFound = await unknownResponse.json();
    assert.equal(notFound.error.code, "NOT_FOUND");
    assert.equal(typeof notFound.error.message, "string");
    assert.equal("stack" in notFound.error, false);

    const badJsonResponse = await fetch(`${baseUrl}/api/unknown`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(badJsonResponse.status, 400);
    const badJson = await badJsonResponse.json();
    assert.equal(badJson.error.code, "INVALID_JSON");
    assert.equal("stack" in badJson.error, false);

    const staticResponse = await fetch(`${baseUrl}/`);
    assert.equal(staticResponse.status, 200);
    assert.match(await staticResponse.text(), /Event Ticketing/);

    const escapedResponse = await fetch(`${baseUrl}/..%2F..%2FREADME.md`);
    assert.equal(escapedResponse.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
