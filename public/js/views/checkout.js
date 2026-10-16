// S07: check out. A countdown shows how long the seats are held, then a mock card form.
import { getBooking, getEvent, payBooking, cancelBooking, ApiError, SUCCESS_TEST_CARD, DECLINED_TEST_CARD } from "../api.js";

const FALLBACK_HOLD_MS = 10 * 60 * 1000;
import { h, uniqueId } from "../dom.js";
import { formatMoney, describeDate } from "../money.js";
import { secondsLeft, formatClock, milestoneMessage } from "../countdown.js";
import { groupCardNumber, validateCard } from "../card.js";

export async function checkoutView({ ref, announce }) {
  const { booking } = await getBooking(ref);

  if (booking.status === "paid") {
    location.replace(`#/done/${encodeURIComponent(ref)}`);
    return { title: "Paid", element: h("p", { class: "notice", text: "Already paid. Opening your tickets…" }) };
  }

  const { event } = await getEvent(booking.eventId);
  const tier = event.tiers.find((t) => t.id === booking.tierId);
  const date = describeDate(event.date);
  const parsed = Date.parse(booking.holdExpiresAt);
  const expiresAt = Number.isFinite(parsed) ? parsed : Date.now() + FALLBACK_HOLD_MS;

  const summary = h("section", { class: "summary", "aria-labelledby": "summary-title" },
    h("h2", { id: "summary-title", text: "Your order" }),
    h("p", { class: "summary-event", text: event.title }),
    h("p", { text: `${date.long}, ${event.venue}, ${event.city}` }),
    h("p", { text: `${booking.quantity} × ${tier ? tier.name : "ticket"} (${formatMoney(tier ? tier.priceCents : 0)} each)` }),
    h("p", { class: "summary-total" }, `Total ${formatMoney(booking.totalCents)}`),
    h("p", { class: "muted", text: `Booking ${booking.ref} for ${booking.buyerName}` }));

  // ---- the countdown
  const clock = h("span", { class: "clock", role: "timer", "aria-live": "off" });
  const clockBox = h("div", { class: "hold" },
    h("p", { class: "hold-label", id: "hold-label", text: "Your seats are held for" }),
    clock);

  // ---- the card form
  const ids = { number: uniqueId("card"), expiry: uniqueId("exp"), cvc: uniqueId("cvc") };
  const fieldError = (id) => h("p", { class: "field-error", id: `${id}-error`, hidden: true });
  const errors = { number: fieldError(ids.number), expiry: fieldError(ids.expiry), cvc: fieldError(ids.cvc) };
  const number = h("input", { id: ids.number, name: "number", inputmode: "numeric", autocomplete: "cc-number", placeholder: "1234 5678 9012 3456", "aria-describedby": `${ids.number}-error` });
  const expiry = h("input", { id: ids.expiry, name: "expiry", inputmode: "numeric", autocomplete: "cc-exp", placeholder: "MM/YY", maxlength: 5, "aria-describedby": `${ids.expiry}-error` });
  const cvc = h("input", { id: ids.cvc, name: "cvc", inputmode: "numeric", autocomplete: "cc-csc", maxlength: 4, "aria-describedby": `${ids.cvc}-error` });
  const banner = h("div", { class: "banner", role: "alert", hidden: true, tabindex: "-1" });
  const pay = h("button", { type: "submit", class: "button button-primary" }, `Pay ${formatMoney(booking.totalCents)}`);

  const field = (key, label, control) => h("div", { class: "field" }, h("label", { for: ids[key] }, label), control, errors[key]);

  const form = h("form", { class: "pay-form", novalidate: true, "aria-label": "Pay with card" },
    h("h2", { text: "Pay with card" }),
    banner,
    field("number", "Card number", number),
    h("div", { class: "field-row" }, field("expiry", "Expiry date", expiry), field("cvc", "Security code", cvc)),
    pay,
    h("details", { class: "test-cards" },
      h("summary", { text: "Test cards for this practice site" }),
      h("ul", {},
        h("li", {}, h("strong", { text: "Works: " }), groupCardNumber(SUCCESS_TEST_CARD)),
        h("li", {}, h("strong", { text: "Declined: " }), groupCardNumber(DECLINED_TEST_CARD))),
      h("p", { class: "muted", text: "Use any future expiry date and any 3 digit code." })));

  const cancel = h("button", { type: "button", class: "button button-quiet", onclick: onCancel }, "Cancel this booking");
  const timeUp = h("div", { class: "banner banner-warn", role: "alert", hidden: true },
    h("p", { text: "Time is up and your seats were released. Nothing was charged." }),
    h("p", {}, h("a", { class: "button", href: `#/event/${encodeURIComponent(event.id)}` }, "Choose tickets again")));

  number.addEventListener("input", () => { number.value = groupCardNumber(number.value); });
  expiry.addEventListener("input", () => {
    const digits = expiry.value.replace(/\D/g, "").slice(0, 4);
    expiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });

  function setFieldError(key, message) {
    const input = { number, expiry, cvc }[key];
    errors[key].textContent = message ?? "";
    errors[key].hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function showBanner(message) {
    banner.textContent = message;
    banner.hidden = false;
    banner.focus();
  }

  let finished = false;
  let busy = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (finished || busy) return;
    banner.hidden = true;
    const problems = validateCard({ number: number.value, expiry: expiry.value, cvc: cvc.value });
    for (const key of ["number", "expiry", "cvc"]) setFieldError(key, problems[key]);
    const firstBad = ["number", "expiry", "cvc"].find((k) => problems[k]);
    if (firstBad) { ({ number, expiry, cvc })[firstBad].focus(); return; }

    busy = true;
    pay.disabled = true;
    pay.textContent = "Paying…";
    form.setAttribute("aria-busy", "true");
    try {
      await payBooking(ref, { cardNumber: number.value });
      finished = true;
      location.hash = `#/done/${encodeURIComponent(ref)}`;
    } catch (err) {
      pay.textContent = `Try again: pay ${formatMoney(booking.totalCents)}`;
      if (err instanceof ApiError && err.code === "PAYMENT_DECLINED") {
        // The booking stays pending: the seats are still held, so the person can try again.
        showBanner("Your card was declined. No money was taken. Check the card details or try a different card. Your seats are still held.");
        number.focus();
      } else if (err instanceof ApiError && err.code === "INVALID_STATE") {
        lockForm();
      } else {
        showBanner(err instanceof ApiError ? err.message : "The payment could not be sent. Try again.");
      }
    } finally {
      busy = false;
      form.removeAttribute("aria-busy");
      if (!finished && !expired) pay.disabled = false;
    }
  });

  async function onCancel() {
    if (finished) return;
    cancel.disabled = true;
    try {
      await cancelBooking(ref);
      finished = true;
      location.hash = `#/event/${encodeURIComponent(event.id)}`;
    } catch (err) {
      cancel.disabled = false;
      showBanner(err instanceof ApiError ? err.message : "The booking could not be cancelled. Try again.");
    }
  }

  // ---- the timer
  let expired = false;
  function lockForm() {
    expired = true;
    // Until the server releases late bookings by itself, we ask it to, so the seats really go back on sale.
    cancelBooking(ref).catch(() => {});
    for (const el of form.elements) el.disabled = true;
    cancel.hidden = true;
    form.hidden = true;
    timeUp.hidden = false;
    clockBox.classList.add("is-over");
  }
  let lastSeconds = null;
  function tick() {
    const left = secondsLeft(expiresAt, Date.now());
    clock.textContent = formatClock(left);
    if (left !== lastSeconds) {
      const message = milestoneMessage(left);
      if (message && !expired) announce(message);
      lastSeconds = left;
    }
    clockBox.classList.toggle("is-low", left <= 60);
    if (left === 0 && !expired) {
      lockForm();
      clock.textContent = "00:00";
    }
  }
  tick();
  const timer = setInterval(tick, 250);

  const element = h("section", { class: "page checkout" },
    h("p", { class: "back" }, h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, "Back to the event")),
    h("h1", { text: "Check out" }),
    clockBox,
    h("div", { class: "checkout-grid" }, summary, h("div", {}, form, timeUp, h("p", { class: "cancel-row" }, cancel))));

  return { title: "Check out", element, cleanup: () => clearInterval(timer) };
}
