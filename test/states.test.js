import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  STATES,
  EVENTS,
  INITIAL_STATE,
  nextState,
  canTransition,
  isFinal,
  holdsSeats,
} from "../src/bookingStates.js";

// This is the booking life cycle written out AGAIN, by hand, on purpose.
// If someone edits the real table by mistake, this copy will disagree and a test fails.
const EXPECTED = {
  pending: { PAY: "paid", CANCEL: "cancelled", EXPIRE: "expired" },
  paid: { CANCEL: "refunded" },
  cancelled: {},
  expired: {},
  refunded: {},
};

describe("booking state machine: every state with every event", () => {
  for (const state of STATES) {
    for (const event of EVENTS) {
      const target = EXPECTED[state][event];
      if (target) {
        test(`${state} + ${event} -> ${target}`, () => {
          assert.equal(canTransition(state, event), true);
          assert.equal(nextState(state, event), target);
        });
      } else {
        test(`${state} + ${event} is refused with INVALID_STATE`, () => {
          assert.equal(canTransition(state, event), false);
          assert.throws(() => nextState(state, event), { code: "INVALID_STATE" });
        });
      }
    }
  }

  test("the table is complete: 5 states, 3 events, exactly 4 allowed moves", () => {
    assert.equal(STATES.length, 5);
    assert.equal(EVENTS.length, 3);
    let allowed = 0;
    for (const state of STATES) for (const event of EVENTS) if (canTransition(state, event)) allowed++;
    assert.equal(allowed, 4);
  });
});

describe("booking state machine: the rules that matter", () => {
  test("a new booking starts pending", () => {
    assert.equal(INITIAL_STATE, "pending");
  });

  test("paying a cancelled booking is refused", () => {
    assert.throws(() => nextState("cancelled", "PAY"), { code: "INVALID_STATE" });
  });

  test("paying twice is refused", () => {
    assert.throws(() => nextState("paid", "PAY"), { code: "INVALID_STATE" });
  });

  test("an expired booking cannot be paid or cancelled", () => {
    assert.throws(() => nextState("expired", "PAY"), { code: "INVALID_STATE" });
    assert.throws(() => nextState("expired", "CANCEL"), { code: "INVALID_STATE" });
  });

  test("a refunded booking cannot be cancelled again", () => {
    assert.throws(() => nextState("refunded", "CANCEL"), { code: "INVALID_STATE" });
  });

  test("a paid booking cannot expire", () => {
    assert.throws(() => nextState("paid", "EXPIRE"), { code: "INVALID_STATE" });
  });

  test("unknown states and events are refused, including odd words", () => {
    for (const bad of ["nonsense", "", undefined, null, "constructor", "toString", "__proto__"]) {
      assert.throws(() => nextState(bad, "PAY"), { code: "INVALID_STATE" }, `state ${String(bad)}`);
    }
    for (const bad of ["pay", "REFUND", "", undefined, null, "constructor"]) {
      assert.throws(() => nextState("pending", bad), { code: "INVALID_STATE" }, `event ${String(bad)}`);
    }
  });

  test("final states have no way out; pending and paid do", () => {
    assert.deepEqual(STATES.filter(isFinal), ["cancelled", "expired", "refunded"]);
    assert.equal(isFinal("nonsense"), false);
  });

  test("only pending and paid bookings hold seats", () => {
    assert.deepEqual(STATES.filter(holdsSeats), ["pending", "paid"]);
  });

  test("asking about a move never changes anything", () => {
    const before = JSON.stringify(EXPECTED);
    nextState("pending", "PAY");
    canTransition("paid", "CANCEL");
    assert.equal(JSON.stringify(EXPECTED), before);
    assert.equal(nextState("pending", "PAY"), "paid"); // same answer every time
  });
});
