import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, MINUTE, DAY } from "./world.js";

// S10: unpaid bookings expire and give their seats back. The server enforces it itself.

let w;
afterEach(() => {
  w?.close();
  w = undefined;
});
const HOLD = 10 * MINUTE;

describe("S10: the expiry job", () => {
  test("a pending booking older than the hold becomes expired and its seats are released once", () => {
    w = makeWorld({ capacity: 5 });
    const b = w.book(w.ada, 2);
    assert.equal(w.left(), 3);
    w.clock.advance(HOLD + MINUTE);
    const result = w.maintenance.run();
    assert.deepEqual(result.expiredBookings, [b.ref]);
    assert.equal(w.bookings.find(b.ref, w.ada).status, "expired");
    assert.equal(w.left(), 5);
  });

  test("running the job again changes nothing (the seats are not released twice)", () => {
    w = makeWorld({ capacity: 5 });
    w.book(w.ada, 2);
    const keep = w.book(w.bayo, 1);
    w.clock.advance(HOLD + MINUTE);
    w.maintenance.run();
    const again = w.maintenance.run();
    assert.deepEqual(again, { expiredBookings: [], expiredOffers: [], newOffers: [] });
    assert.equal(w.sold(), 0, "both were unpaid, both expired, once each");
    assert.equal(keep.quantity, 1);
  });

  test("boundary: one millisecond before the deadline it is still pending; at the deadline it expires", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    w.clock.advance(HOLD - 1);
    assert.deepEqual(w.maintenance.run().expiredBookings, []);
    assert.equal(w.store.bookings.find(b.ref).status, "pending");
    w.clock.advance(1);
    assert.deepEqual(w.maintenance.run().expiredBookings, [b.ref]);
    assert.equal(w.store.bookings.find(b.ref).status, "expired");
  });

  test("a PAID booking is never touched by the job, however much time passes", () => {
    w = makeWorld({ capacity: 5 });
    const paid = w.bookAndPay(w.ada, 2);
    w.clock.advance(30 * DAY);
    assert.deepEqual(w.maintenance.run().expiredBookings, []);
    assert.equal(w.store.bookings.find(paid.ref).status, "paid");
    assert.equal(w.sold(), 2);
  });

  test("cancelled and already expired bookings are not touched again", () => {
    w = makeWorld({ capacity: 5 });
    const a = w.book(w.ada, 1);
    const b = w.book(w.bayo, 1);
    w.bookings.cancel(a.ref, w.ada);
    w.clock.advance(HOLD + MINUTE);
    assert.deepEqual(w.maintenance.run().expiredBookings, [b.ref]);
    assert.equal(w.store.bookings.find(a.ref).status, "cancelled");
    assert.equal(w.sold(), 0);
  });

  test("several bookings of different ages: only the overdue ones expire", () => {
    w = makeWorld({ capacity: 10 });
    const old1 = w.book(w.ada, 2);
    w.clock.advance(6 * MINUTE);
    const old2 = w.book(w.bayo, 3);
    w.clock.advance(5 * MINUTE); // Ada's is 11 minutes old, Bayo's 5
    assert.deepEqual(w.maintenance.run().expiredBookings, [old1.ref]);
    assert.equal(w.store.bookings.find(old2.ref).status, "pending");
    assert.equal(w.sold(), 3);
  });

  test("the freed seats can be booked by somebody else", () => {
    w = makeWorld({ capacity: 2 });
    w.book(w.ada, 2);
    assert.throws(() => w.book(w.bayo, 1), { code: "SOLD_OUT" });
    w.clock.advance(HOLD + MINUTE);
    w.maintenance.run();
    assert.equal(w.book(w.bayo, 2).status, "pending");
  });

  test("a booking cancelled by hand after it expired is refused", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    w.clock.advance(HOLD + MINUTE);
    w.maintenance.run();
    assert.throws(() => w.bookings.cancel(b.ref, w.ada), { code: "ALREADY_CANCELLED" });
    assert.equal(w.sold(), 0);
  });
});

describe("S10: paying an expired booking", () => {
  test("is refused with BOOKING_EXPIRED, and the seats are not taken back", () => {
    w = makeWorld({ capacity: 3 });
    const b = w.book(w.ada, 2);
    w.clock.advance(HOLD + MINUTE);
    w.maintenance.run();
    assert.throws(() => w.bookings.pay(b.ref, "tok_success", w.ada), { code: "BOOKING_EXPIRED" });
    assert.equal(w.bookings.find(b.ref, w.ada).status, "expired");
    assert.equal(w.left(), 3);
  });

  test("even if the job has NOT run yet: the server notices the moment you try to pay", () => {
    w = makeWorld({ capacity: 3 });
    const b = w.book(w.ada, 2);
    w.clock.advance(HOLD); // exactly at the deadline
    assert.throws(() => w.bookings.pay(b.ref, "tok_success", w.ada), { code: "BOOKING_EXPIRED" });
    assert.equal(w.left(), 3, "and the seats are free again");
  });

  test("one moment before the deadline, paying still works", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    w.clock.advance(HOLD - 1);
    assert.equal(w.bookings.pay(b.ref, "tok_success", w.ada).status, "paid");
  });

  test("reading your booking shows it as expired, without waiting for the job", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    w.clock.advance(HOLD + 1);
    assert.equal(w.bookings.find(b.ref, w.ada).status, "expired");
    assert.equal(w.bookings.listMine(w.ada)[0].status, "expired");
  });

  test("a declined card does not extend the hold", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    w.clock.advance(5 * MINUTE);
    assert.throws(() => w.bookings.pay(b.ref, "tok_declined", w.ada), { code: "PAYMENT_DECLINED" });
    w.clock.advance(5 * MINUTE);
    assert.throws(() => w.bookings.pay(b.ref, "tok_success", w.ada), { code: "BOOKING_EXPIRED" });
  });

  test("a booking someone else made still looks like NOT_FOUND, expired or not", () => {
    w = makeWorld();
    const b = w.book(w.ada, 1);
    w.clock.advance(HOLD + 1);
    assert.throws(() => w.bookings.pay(b.ref, "tok_success", w.bayo), { code: "NOT_FOUND" });
  });
});
