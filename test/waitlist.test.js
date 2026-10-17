import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, MINUTE, DAY } from "./world.js";

// S11 (join the waitlist) and S12 (timed offers, in order).
// A freed seat becomes an OFFER for the first person in line. The offer HOLDS the seat.

let w;
afterEach(() => {
  w?.close();
  w = undefined;
});
const OFFER = 15 * MINUTE;

// Four people in a tier with 1 seat: Ada holds the seat, Bayo, Chidi and Dee wait in that order.
function lineOfThree() {
  w = makeWorld({ capacity: 1 });
  const held = w.book(w.ada, 1);
  const b = w.waitlist.join(w.eventId, w.tierId, w.bayo);
  const c = w.waitlist.join(w.eventId, w.tierId, w.chidi);
  const d = w.waitlist.join(w.eventId, w.tierId, w.dee);
  return { held, b, c, d };
}
const mine = (who) => w.waitlist.listMine(who);

describe("S11: joining the waitlist", () => {
  test("a sold-out tier: you join at the END of the line", () => {
    w = makeWorld({ capacity: 1 });
    w.book(w.ada, 1);
    const first = w.waitlist.join(w.eventId, w.tierId, w.bayo);
    const second = w.waitlist.join(w.eventId, w.tierId, w.chidi);
    assert.equal(first.status, "waiting");
    assert.equal(first.position, 1);
    assert.equal(second.position, 2);
    assert.ok(second.id > first.id);
  });

  test("a tier that still has seats: NOT_SOLD_OUT", () => {
    w = makeWorld({ capacity: 3 });
    w.book(w.ada, 2);
    assert.throws(() => w.waitlist.join(w.eventId, w.tierId, w.bayo), { code: "NOT_SOLD_OUT" });
    assert.deepEqual(mine(w.bayo), []);
  });

  test("joining twice: ALREADY_ON_WAITLIST, and you keep your place", () => {
    w = makeWorld({ capacity: 1 });
    w.book(w.ada, 1);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    w.waitlist.join(w.eventId, w.tierId, w.chidi);
    assert.throws(() => w.waitlist.join(w.eventId, w.tierId, w.bayo), { code: "ALREADY_ON_WAITLIST" });
    assert.equal(mine(w.bayo).length, 1);
    assert.equal(mine(w.bayo)[0].position, 1);
  });

  test("a held offer also counts as being on the list: ALREADY_ON_WAITLIST", () => {
    lineOfThree();
    w.bookings.cancel(w.store.bookings.listForUser(w.ada.id)[0].ref, w.ada); // Bayo is offered the seat
    assert.equal(mine(w.bayo)[0].status, "offered");
    assert.throws(() => w.waitlist.join(w.eventId, w.tierId, w.bayo), { code: "ALREADY_ON_WAITLIST" });
  });

  test("a tier that does not exist, an event that does not exist, a draft event", () => {
    w = makeWorld({ capacity: 1 });
    w.book(w.ada, 1);
    assert.throws(() => w.waitlist.join(w.eventId, "T9", w.bayo), { code: "NOT_FOUND" });
    assert.throws(() => w.waitlist.join("EV-999999", w.tierId, w.bayo), { code: "NOT_FOUND" });
    w.events.unpublish(w.eventId, w.org);
    assert.throws(() => w.waitlist.join(w.eventId, w.tierId, w.bayo), { code: "NOT_PUBLISHED" });
  });

  test("only logged-in attendees: nobody, an organizer", () => {
    w = makeWorld({ capacity: 1 });
    w.book(w.ada, 1);
    assert.throws(() => w.waitlist.join(w.eventId, w.tierId, null), { code: "UNAUTHENTICATED" });
    assert.throws(() => w.waitlist.join(w.eventId, w.tierId, w.org), { code: "FORBIDDEN" });
    assert.throws(() => w.waitlist.join(5, w.tierId, w.bayo), { code: "VALIDATION" });
  });

  test("you only ever see your own entries", () => {
    lineOfThree();
    assert.equal(mine(w.bayo).length, 1);
    assert.equal(mine(w.chidi).length, 1);
    assert.deepEqual(mine(w.ada), []);
    assert.equal(mine(w.chidi)[0].position, 2);
    assert.equal(mine(w.dee)[0].position, 3);
  });
});

describe("S12: offers go out IN ORDER", () => {
  test("three people wait in order A, B, C; a seat frees up: A is offered it, B and C are not", () => {
    const { held } = lineOfThree(); // Bayo = A, Chidi = B, Dee = C
    w.bookings.cancel(held.ref, w.ada);
    const a = mine(w.bayo)[0];
    assert.equal(a.status, "offered");
    assert.equal(Date.parse(a.offerExpiresAt), w.clock.now() + OFFER, "the offer lasts 15 minutes");
    assert.equal(mine(w.chidi)[0].status, "waiting");
    assert.equal(mine(w.dee)[0].status, "waiting");
    assert.equal(mine(w.chidi)[0].position, 1, "Chidi is now next in line");
    assert.equal(mine(w.dee)[0].position, 2);
  });

  test("the offer HOLDS the seat: a newcomer cannot buy it, and cannot jump the line", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    assert.equal(w.left(), 0);
    assert.throws(() => w.book(w.ada, 1), { code: "SOLD_OUT" });
    assert.equal(w.sold(), 1);
  });

  test("A does not accept in time: the seat passes to B, then to C, one step per offer", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    w.clock.advance(OFFER - 1);
    w.maintenance.run();
    assert.equal(mine(w.bayo)[0].status, "offered", "one millisecond early: still A's");

    w.clock.advance(1);
    const r = w.maintenance.run();
    assert.equal(r.expiredOffers.length, 1);
    assert.equal(r.newOffers.length, 1);
    assert.equal(mine(w.bayo)[0].status, "expired");
    assert.equal(mine(w.chidi)[0].status, "offered");
    assert.equal(mine(w.dee)[0].status, "waiting");
    assert.equal(w.sold(), 1, "the seat never became free in between");

    w.clock.advance(OFFER);
    w.maintenance.run();
    assert.equal(mine(w.chidi)[0].status, "expired");
    assert.equal(mine(w.dee)[0].status, "offered");
  });

  test("when nobody is left to offer to, the seat really becomes free", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    for (let i = 0; i < 3; i++) {
      w.clock.advance(OFFER);
      w.maintenance.run();
    }
    assert.deepEqual(mine(w.dee).map((e) => e.status), ["expired"]);
    assert.equal(w.left(), 1);
    assert.equal(w.book(w.ada, 1).status, "pending", "now anyone can buy it");
  });

  test("an expired offer cannot be accepted: OFFER_EXPIRED", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    const entryId = mine(w.bayo)[0].id;
    w.clock.advance(OFFER);
    w.maintenance.run();
    assert.throws(() => w.waitlist.accept(entryId, w.bayo), { code: "OFFER_EXPIRED" });
    assert.equal(mine(w.bayo)[0].status, "expired");
    assert.equal(w.store.bookings.listForUser(w.bayo.id).length, 0, "no booking was made");
  });

  test("even if the job has NOT run: accepting at the deadline is OFFER_EXPIRED, and the seat moves on", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    const entryId = mine(w.bayo)[0].id;
    w.clock.advance(OFFER); // exactly the deadline
    assert.throws(() => w.waitlist.accept(entryId, w.bayo), { code: "OFFER_EXPIRED" });
    assert.equal(mine(w.chidi)[0].status, "offered");
  });

  test("accepting in time turns the held seat into a pending booking for THAT person", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    const entryId = mine(w.bayo)[0].id;
    w.clock.advance(OFFER - 1);
    const booking = w.waitlist.accept(entryId, w.bayo);
    assert.equal(booking.status, "pending");
    assert.equal(booking.userId, w.bayo.id);
    assert.equal(booking.quantity, 1);
    assert.equal(booking.totalCents, 500000);
    assert.equal(Date.parse(booking.holdExpiresAt), w.clock.now() + 10 * MINUTE, "then 10 minutes to pay");
    assert.equal(w.sold(), 1, "the seat was already counted: no double counting");
    assert.equal(mine(w.bayo)[0].status, "accepted");
    assert.equal(w.bookings.pay(booking.ref, "tok_success", w.bayo).status, "paid");
    assert.equal(mine(w.chidi)[0].status, "waiting", "the others keep waiting");
  });

  test("an accepted offer cannot be accepted twice", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    const entryId = mine(w.bayo)[0].id;
    w.waitlist.accept(entryId, w.bayo);
    assert.throws(() => w.waitlist.accept(entryId, w.bayo), { code: "INVALID_STATE" });
    assert.equal(w.store.bookings.listForUser(w.bayo.id).length, 1);
    assert.equal(w.sold(), 1);
  });

  test("if the person who accepted never pays, the booking expires and the seat is offered to the next person", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    w.waitlist.accept(mine(w.bayo)[0].id, w.bayo);
    w.clock.advance(10 * MINUTE);
    const r = w.maintenance.run();
    assert.equal(r.expiredBookings.length, 1);
    assert.equal(mine(w.chidi)[0].status, "offered");
    assert.equal(w.sold(), 1);
  });

  test("you cannot accept somebody else's offer, or an entry that is only waiting", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    const bayoEntry = mine(w.bayo)[0].id;
    const chidiEntry = mine(w.chidi)[0].id;
    assert.throws(() => w.waitlist.accept(bayoEntry, w.chidi), { code: "NOT_FOUND" });
    assert.throws(() => w.waitlist.accept(bayoEntry, w.ada), { code: "NOT_FOUND" });
    assert.throws(() => w.waitlist.accept(chidiEntry, w.chidi), { code: "INVALID_STATE" }); // still waiting, no offer
    assert.throws(() => w.waitlist.accept(99999, w.bayo), { code: "NOT_FOUND" });
    assert.throws(() => w.waitlist.accept("1", w.bayo), { code: "NOT_FOUND" });
    assert.throws(() => w.waitlist.accept(bayoEntry, null), { code: "UNAUTHENTICATED" });
    assert.throws(() => w.waitlist.accept(bayoEntry, w.org), { code: "FORBIDDEN" });
    assert.equal(mine(w.bayo)[0].status, "offered");
  });
});

describe("S12: every way a seat can come free leads to an offer", () => {
  test("a refund (paid booking cancelled)", () => {
    w = makeWorld({ capacity: 1 });
    const paid = w.bookAndPay(w.ada, 1);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    w.bookings.cancel(paid.ref, w.ada);
    assert.equal(mine(w.bayo)[0].status, "offered");
  });

  test("an unpaid booking that runs out of time (the job)", () => {
    w = makeWorld({ capacity: 1 });
    w.book(w.ada, 1);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    w.clock.advance(10 * MINUTE);
    const r = w.maintenance.run();
    assert.equal(r.expiredBookings.length, 1);
    assert.equal(r.newOffers.length, 1);
    assert.equal(mine(w.bayo)[0].status, "offered");
  });

  test("somebody leaves the line while holding an offer", () => {
    const { held } = lineOfThree();
    w.bookings.cancel(held.ref, w.ada);
    const left = w.waitlist.leave(mine(w.bayo)[0].id, w.bayo);
    assert.equal(left.status, "left");
    assert.equal(mine(w.chidi)[0].status, "offered");
    assert.equal(w.sold(), 1);
  });

  test("several seats freed at once: one offer each, in order, and the rest stay free", () => {
    w = makeWorld({ capacity: 3 });
    const big = w.book(w.ada, 3);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    w.waitlist.join(w.eventId, w.tierId, w.chidi);
    w.bookings.cancel(big.ref, w.ada); // 3 seats free, 2 people waiting
    assert.equal(mine(w.bayo)[0].status, "offered");
    assert.equal(mine(w.chidi)[0].status, "offered");
    assert.equal(w.left(), 1, "one seat is really free");
    assert.equal(w.book(w.dee, 1).status, "pending");
  });

  test("a person who joined later is behind everyone who joined earlier, even after others left", () => {
    w = makeWorld({ capacity: 1 });
    const held = w.book(w.ada, 1);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    w.waitlist.join(w.eventId, w.tierId, w.chidi);
    w.waitlist.leave(mine(w.bayo)[0].id, w.bayo);
    w.waitlist.join(w.eventId, w.tierId, w.dee);
    w.bookings.cancel(held.ref, w.ada);
    assert.equal(mine(w.chidi)[0].status, "offered");
    assert.equal(mine(w.dee)[0].status, "waiting");
  });

  test("you can rejoin after you left, at the END of the line", () => {
    w = makeWorld({ capacity: 1 });
    w.book(w.ada, 1);
    w.waitlist.join(w.eventId, w.tierId, w.bayo);
    w.waitlist.join(w.eventId, w.tierId, w.chidi);
    w.waitlist.leave(mine(w.bayo)[0].id, w.bayo);
    const again = w.waitlist.join(w.eventId, w.tierId, w.bayo);
    assert.equal(again.position, 2);
    assert.equal(mine(w.chidi)[0].position, 1);
  });
});

describe("S12: leaving", () => {
  test("only your own entry, and only while it is open", () => {
    lineOfThree();
    const bayoEntry = mine(w.bayo)[0].id;
    assert.throws(() => w.waitlist.leave(bayoEntry, w.chidi), { code: "NOT_FOUND" });
    w.waitlist.leave(bayoEntry, w.bayo);
    assert.throws(() => w.waitlist.leave(bayoEntry, w.bayo), { code: "INVALID_STATE" });
    assert.equal(mine(w.chidi)[0].position, 1, "the line closed up");
  });
});

// ---------------------------------------------------------------------------------------------
// The rule that holds the whole system together, checked after a long random run of actions:
//   sold  =  seats in pending and paid bookings  +  offers that are being held
// If this is ever wrong, seats are leaking or being sold twice.
describe("S12: seats are never lost or double counted (random actions, fixed seed)", () => {
  function random(seed) {
    let x = seed;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  }

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    test(`seed ${seed}: 250 random actions`, () => {
      w = makeWorld({ capacity: 4 });
      const rnd = random(seed);
      const people = [w.ada, w.bayo, w.chidi, w.dee];
      const pick = (list) => list[Math.floor(rnd() * list.length)];
      const log = [];

      const check = (step) => {
        const tier = w.tierNow();
        const bookings = people.flatMap((p) => w.store.bookings.listForUser(p.id));
        const holding = bookings.filter((b) => b.status === "pending" || b.status === "paid").reduce((n, b) => n + b.quantity, 0);
        const offers = people.flatMap((p) => w.store.waitlist.listForUser(p.id)).filter((e) => e.status === "offered").length;
        assert.equal(tier.sold, holding + offers, `after step ${step} (${log.slice(-3).join(" | ")}): sold ${tier.sold} != ${holding} + ${offers}`);
        assert.ok(tier.sold >= 0 && tier.sold <= tier.capacity);
        // while somebody waits, no seat is idle
        const waiting = people.flatMap((p) => w.store.waitlist.listForUser(p.id)).filter((e) => e.status === "waiting").length;
        if (waiting > 0) assert.equal(tier.sold, tier.capacity, `after step ${step}: a seat is idle while ${waiting} wait`);
      };

      for (let step = 0; step < 250; step++) {
        const who = pick(people);
        const action = pick(["book", "book", "pay", "pay", "cancel", "cancel", "join", "join", "accept", "accept", "leave", "wait", "wait", "job"]);
        try {
          const myBookings = w.store.bookings.listForUser(who.id);
          const myEntries = w.store.waitlist.listForUser(who.id);
          if (action === "book") w.book(who, 1 + Math.floor(rnd() * 2));
          if (action === "pay") w.bookings.pay(pick(myBookings.length ? myBookings : [{ ref: "BK-999999" }]).ref, "tok_success", who);
          if (action === "cancel") w.bookings.cancel(pick(myBookings.length ? myBookings : [{ ref: "BK-999999" }]).ref, who);
          if (action === "join") w.waitlist.join(w.eventId, w.tierId, who);
          if (action === "accept") w.waitlist.accept(pick(myEntries.length ? myEntries : [{ id: -1 }]).id, who);
          if (action === "leave") w.waitlist.leave(pick(myEntries.length ? myEntries : [{ id: -1 }]).id, who);
          if (action === "wait") w.clock.advance(Math.floor(rnd() * 6) * MINUTE);
          if (action === "job") w.maintenance.run();
        } catch (err) {
          assert.equal(err.name, "DomainError", `unexpected crash in ${action}: ${err.stack}`);
        }
        log.push(`${who.name}:${action}`);
        check(step);
      }
    });
  }
});
