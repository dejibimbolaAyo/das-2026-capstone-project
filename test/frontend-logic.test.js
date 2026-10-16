import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, nairaToCents, describeDate, ticketWord } from "../public/js/money.js";
import { secondsLeft, formatClock, milestoneMessage } from "../public/js/countdown.js";
import { digitsOnly, groupCardNumber, passesLuhn, validateCard } from "../public/js/card.js";
import { toApiQuery } from "../public/js/views/browse.js";

describe("website helpers: money", () => {
  test("formatMoney shows naira from whole cents", () => {
    assert.equal(formatMoney(800000), "₦8,000");
    assert.equal(formatMoney(123456789), "₦1,234,567.89");
    assert.equal(formatMoney(150), "₦1.50");
    assert.equal(formatMoney(5), "₦0.05");
    assert.equal(formatMoney(0), "Free");
  });
  test("formatMoney refuses things that are not whole cents", () => {
    for (const bad of [-1, 1.5, NaN, "100", null, undefined]) assert.equal(formatMoney(bad), "");
  });
  test("nairaToCents reads what a person types, with no decimal rounding", () => {
    assert.equal(nairaToCents("8,000"), 800000);
    assert.equal(nairaToCents("₦8000.5"), 800050);
    assert.equal(nairaToCents("0.1"), 10);
    assert.equal(nairaToCents("19.99"), 1999);
    assert.equal(nairaToCents(" 2 000 "), 200000);
    for (const bad of ["", "abc", "-5", "1.234", "1e3", "5.", ".5", "99999999999999999999"]) assert.equal(nairaToCents(bad), null, bad);
  });
  test("describeDate does not move the day with the computer's time zone", () => {
    const d = describeDate("2026-11-07");
    assert.deepEqual([d.day, d.month, d.year, d.weekday], ["07", "Nov", "2026", "Saturday"]);
    assert.equal(d.long, "Saturday 7 Nov 2026");
    assert.equal(describeDate("nonsense").long, "nonsense");
  });
  test("ticketWord", () => {
    assert.equal(ticketWord(1), "ticket");
    assert.equal(ticketWord(2), "tickets");
  });
});

describe("website helpers: countdown", () => {
  test("secondsLeft rounds up and never goes below zero", () => {
    assert.equal(secondsLeft(10_000, 0), 10);
    assert.equal(secondsLeft(10_000, 9_001), 1);
    assert.equal(secondsLeft(10_000, 10_000), 0);
    assert.equal(secondsLeft(10_000, 99_999), 0);
  });
  test("formatClock", () => {
    assert.equal(formatClock(600), "10:00");
    assert.equal(formatClock(59), "00:59");
    assert.equal(formatClock(61), "01:01");
    assert.equal(formatClock(-5), "00:00");
  });
  test("screen readers only hear a few milestones", () => {
    assert.ok(milestoneMessage(60));
    assert.ok(milestoneMessage(0));
    assert.equal(milestoneMessage(59), null);
    assert.equal(milestoneMessage(299), null);
  });
});

describe("website helpers: card form", () => {
  test("digits and grouping", () => {
    assert.equal(digitsOnly("4242-4242 abc"), "42424242");
    assert.equal(groupCardNumber("4242424242424242"), "4242 4242 4242 4242");
    assert.equal(groupCardNumber("42"), "42");
  });
  test("the two test cards pass the Luhn check, a typo does not", () => {
    assert.equal(passesLuhn("4242424242424242"), true);
    assert.equal(passesLuhn("4000 0000 0000 0002"), true);
    assert.equal(passesLuhn("4242424242424241"), false);
    assert.equal(passesLuhn("1234"), false);
  });
  test("validateCard: good card has no problems", () => {
    const now = new Date(2026, 9, 14);
    assert.deepEqual(validateCard({ number: "4242 4242 4242 4242", expiry: "12/29", cvc: "123" }, now), {});
    assert.deepEqual(validateCard({ number: "4242424242424242", expiry: "10/26", cvc: "1234" }, now), {}); // this month is still fine
  });
  test("validateCard: each bad field gets its own plain message", () => {
    const now = new Date(2026, 9, 14);
    const p = validateCard({ number: "", expiry: "13/29", cvc: "12" }, now);
    assert.match(p.number, /Enter the card number/);
    assert.match(p.expiry, /between 01 and 12/);
    assert.match(p.cvc, /3 or 4 digit/);
    assert.match(validateCard({ number: "4242424242424242", expiry: "09/26", cvc: "123" }, now).expiry, /expired/);
    assert.match(validateCard({ number: "4242424242424242", expiry: "1229", cvc: "123" }, now).expiry, /MM\/YY/);
    assert.match(validateCard({ number: "4242424242424241", expiry: "12/29", cvc: "123" }, now).number, /not valid/);
  });
});

describe("website helpers: filter boxes -> API query", () => {
  const blank = { q: "", city: "", from: "", to: "", max: "", sort: "date-asc" };
  test("empty boxes only ask for the sort", () => {
    assert.deepEqual(toApiQuery(blank), { query: { sort: "date", order: "asc" } });
  });
  test("boxes become API names, price becomes cents", () => {
    const { query } = toApiQuery({ q: " jazz ", city: "Lagos", from: "2026-11-01", to: "2026-12-01", max: "10,000", sort: "price-desc" });
    assert.deepEqual(query, { q: "jazz", city: "Lagos", dateFrom: "2026-11-01", dateTo: "2026-12-01", maxPriceCents: 1000000, sort: "price", order: "desc" });
  });
  test("bad input gives a message instead of a query", () => {
    assert.match(toApiQuery({ ...blank, from: "2026-12-01", to: "2026-11-01" }).problem, /end date is before/);
    assert.match(toApiQuery({ ...blank, max: "ten" }).problem, /number/);
  });
});
