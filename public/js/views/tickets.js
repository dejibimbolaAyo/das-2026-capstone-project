// S13: my tickets. S09: cancel with a refund. S11 + S12: my waitlist places and offers.
// The server only ever sends the bookings and waitlist entries of the logged-in person.
import { listMyBookings, listMyWaitlist, getEvent, getRefundPreview, cancelBooking, acceptOffer, leaveWaitlist, ApiError } from "../api.js";
import { h } from "../dom.js";
import { formatMoney, describeDate, ticketWord } from "../money.js";
import { REFUND_POLICY_LINES, refundMessage, refundDoneMessage, waitlistStatusWords, formatMinutesSeconds } from "../refund.js";

const STATUS_WORDS = {
  pending: "Waiting for payment",
  paid: "Paid",
  cancelled: "Cancelled",
  expired: "Expired (time to pay ran out)",
  refunded: "Refunded",
};

const REFRESH_MS = 20_000; // look for new offers now and then

export async function ticketsView({ announce }) {
  let data = await load();
  let openPanel = null; // the booking ref whose "cancel?" question is open
  let refreshing = false;

  // One look-up per event (not per booking). If one fails, the others still show.
  async function load() {
    const [{ bookings }, { entries }] = await Promise.all([listMyBookings(), listMyWaitlist()]);
    const eventIds = [...new Set([...bookings.map((b) => b.eventId), ...entries.map((e) => e.eventId)])];
    const found = await Promise.all(eventIds.map((id) => getEvent(id).then((r) => r.event, (err) => (err instanceof ApiError && err.code === "NETWORK" ? Promise.reject(err) : null))));
    return { bookings, entries, events: new Map(eventIds.map((id, i) => [id, found[i]])) };
  }

  const body = h("div", { class: "tickets-body" });
  const status = h("p", { class: "flash", role: "status", hidden: true });

  function say(message) {
    status.textContent = message;
    status.hidden = !message;
    if (message) announce(message);
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      data = await load();
      paint();
    } catch (err) {
      say(err instanceof ApiError ? err.message : "Could not update the page. Try again.");
    } finally {
      refreshing = false;
    }
  }

  // ------------------------------------------------------------------ bookings
  function cancelPanel(booking) {
    const text = h("p", { class: "panel-text", text: "Checking what you would get back…" });
    const confirm = h("button", { type: "button", class: "button button-danger", disabled: true }, "Yes, cancel this booking");
    const keep = h("button", { type: "button", class: "button button-quiet", onclick: () => { openPanel = null; paint(); } }, "Keep my booking");
    const panel = h("div", { class: "refund-panel", role: "group", "aria-label": `Cancel booking ${booking.ref}` }, text, h("div", { class: "actions" }, confirm, keep));

    getRefundPreview(booking.ref).then(
      ({ refund }) => {
        text.textContent = refundMessage(refund, booking.totalCents);
        confirm.disabled = false;
        confirm.addEventListener("click", async () => {
          confirm.disabled = true;
          keep.disabled = true;
          try {
            const result = await cancelBooking(booking.ref);
            openPanel = null;
            say(refundDoneMessage(result.refund));
            await refresh();
          } catch (err) {
            if (err instanceof ApiError && err.code === "ALREADY_CANCELLED") {
              openPanel = null;
              say("That booking was already cancelled.");
              await refresh();
              return;
            }
            text.textContent = err instanceof ApiError ? err.message : "The booking could not be cancelled. Try again.";
            keep.disabled = false;
            confirm.disabled = false;
          }
        });
      },
      (err) => {
        text.textContent = err instanceof ApiError && err.code === "EVENT_STARTED"
          ? "This event has already started, so this booking can no longer be cancelled or refunded."
          : err instanceof ApiError ? err.message : "Could not check the refund. Try again.";
        keep.textContent = "Close";
      }
    );
    return panel;
  }

  function bookingCard(booking) {
    const event = data.events.get(booking.eventId);
    const tier = event?.tiers.find((t) => t.id === booking.tierId);
    const date = event ? describeDate(event.date) : null;
    const state = booking.status;
    const canCancel = state === "pending" || state === "paid";
    return h("li", { class: `ticket ticket-${state}` },
      h("div", { class: "ticket-body" },
        h("h2", {}, event ? h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title) : "Event no longer available"),
        event ? h("p", { class: "where", text: `${event.venue}, ${event.city}` }) : null,
        h("p", { text: `${booking.quantity} ${ticketWord(booking.quantity)}${tier ? `, ${tier.name}` : ""}: ${formatMoney(booking.totalCents)}` }),
        h("p", { class: `badge badge-status badge-${state}`, text: STATUS_WORDS[state] ?? state }),
        state === "refunded" ? h("p", { class: "muted", text: booking.refundCents ? `Refunded ${formatMoney(booking.refundCents)}.` : "No refund was due." }) : null,
        h("p", { class: "muted" }, "Booking ", h("strong", { class: "ref", text: booking.ref })),
        h("div", { class: "actions ticket-actions" },
          state === "pending" ? h("a", { class: "button button-primary", href: `#/checkout/${encodeURIComponent(booking.ref)}` }, "Pay now") : null,
          canCancel && openPanel !== booking.ref
            ? h("button", { type: "button", class: "button button-quiet", onclick: () => { openPanel = booking.ref; paint(); } }, state === "paid" ? "Cancel and get a refund" : "Cancel booking")
            : null),
        openPanel === booking.ref ? cancelPanel(booking) : null),
      h("div", { class: "ticket-stub" },
        date
          ? h("time", { datetime: event.date, "aria-label": date.long },
              h("span", { class: "stub-day", text: date.day }), h("span", { class: "stub-month", text: date.month }), h("span", { class: "stub-year", text: date.year }))
          : h("span", { text: "?" })));
  }

  // ---------------------------------------------------------------- waitlist
  function entryCard(entry) {
    const event = data.events.get(entry.eventId);
    const tier = event?.tiers.find((t) => t.id === entry.tierId);
    const offered = entry.status === "offered";
    const secs = offered ? Math.max(0, Math.ceil((Date.parse(entry.offerExpiresAt) - Date.now()) / 1000)) : null;
    const clock = offered ? h("strong", { class: "offer-clock", "data-expires": entry.offerExpiresAt, text: formatMinutesSeconds(secs) }) : null;
    const busyButtons = [];

    const accept = offered
      ? h("button", { type: "button", class: "button button-primary", onclick: async () => {
          busyButtons.forEach((b) => (b.disabled = true));
          try {
            const { booking } = await acceptOffer(entry.id);
            location.hash = `#/checkout/${encodeURIComponent(booking.ref)}`;
          } catch (err) {
            busyButtons.forEach((b) => (b.disabled = false));
            say(err instanceof ApiError && err.code === "OFFER_EXPIRED" ? "That offer ran out, and the seat went to the next person." : err instanceof ApiError ? err.message : "Could not accept the offer. Try again.");
            if (err instanceof ApiError && err.code === "OFFER_EXPIRED") await refresh();
          }
        } }, "Accept the seat")
      : null;
    const leave = entry.status === "waiting" || offered
      ? h("button", { type: "button", class: "button button-quiet", onclick: async () => {
          busyButtons.forEach((b) => (b.disabled = true));
          try {
            await leaveWaitlist(entry.id);
            say(offered ? "You turned the offer down. The seat goes to the next person." : "You left the waitlist.");
            await refresh();
          } catch (err) {
            busyButtons.forEach((b) => (b.disabled = false));
            say(err instanceof ApiError ? err.message : "Could not do that. Try again.");
          }
        } }, offered ? "No thanks" : "Leave the waitlist")
      : null;
    busyButtons.push(...[accept, leave].filter(Boolean));

    return h("li", { class: `offer offer-${entry.status}` },
      h("h3", {}, event ? h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title) : "Event no longer available"),
      h("p", { class: "where", text: tier ? `${tier.name}, ${formatMoney(tier.priceCents)}` : "" }),
      offered
        ? h("p", { class: "offer-line" }, "A seat is held for you. Accept within ", clock, ".")
        : h("p", { class: "offer-line", text: waitlistStatusWords(entry) }),
      accept || leave ? h("div", { class: "actions" }, accept, leave) : null);
  }

  function waitlistSection() {
    const shown = data.entries.filter((e) => e.status === "waiting" || e.status === "offered");
    const finished = data.entries.filter((e) => e.status === "expired").slice(0, 3);
    if (shown.length + finished.length === 0) return null;
    return h("section", { class: "waitlist-section", "aria-labelledby": "waitlist-title" },
      h("h2", { id: "waitlist-title", text: "Waitlist and offers" }),
      h("p", { class: "muted", text: "When a seat frees up, the first person in line is offered it. The seat is held for 15 minutes. If you do not accept, it goes to the next person." }),
      h("ul", { class: "offers" }, [...shown, ...finished].map(entryCard)));
  }

  function paint() {
    const { bookings } = data;
    body.replaceChildren(...[
      waitlistSection(),
      bookings.length === 0
        ? h("div", { class: "notice" },
            h("p", { text: "You have no tickets yet." }),
            h("p", {}, h("a", { class: "button button-primary", href: "#/" }, "Find an event")))
        : h("ul", { class: "tickets", "aria-label": "Your bookings" }, bookings.map(bookingCard)),
      h("details", { class: "policy" },
        h("summary", { text: "Refund policy" }),
        h("ul", {}, REFUND_POLICY_LINES.map((line) => h("li", { text: line }))),
        h("p", { class: "muted", text: "Unpaid bookings can be cancelled at any time. An unpaid booking is released by itself after 10 minutes." }))].filter(Boolean));
  }

  // The offer clocks tick once a second. When one reaches zero we ask the server what happened.
  const ticker = setInterval(() => {
    let over = false;
    for (const clock of body.querySelectorAll(".offer-clock")) {
      const left = Math.max(0, Math.ceil((Date.parse(clock.dataset.expires) - Date.now()) / 1000));
      clock.textContent = formatMinutesSeconds(left);
      if (left === 0) over = true;
    }
    if (over && openPanel === null) refresh();
  }, 1000);
  // New offers can arrive while the page is open (somebody else cancels).
  const poller = setInterval(() => {
    if (openPanel === null) refresh();
  }, REFRESH_MS);

  paint();
  const element = h("section", { class: "page" }, h("h1", { text: "My tickets" }), status, body);
  return { title: "My tickets", element, cleanup: () => { clearInterval(ticker); clearInterval(poller); } };
}
