// S13: my tickets. The server only ever sends the bookings of the logged-in person.
import { listMyBookings, getEvent, ApiError } from "../api.js";
import { h } from "../dom.js";
import { formatMoney, describeDate, ticketWord } from "../money.js";

const STATUS_WORDS = {
  pending: "Waiting for payment",
  paid: "Paid",
  cancelled: "Cancelled",
  expired: "Expired",
  refunded: "Refunded",
};

export async function ticketsView() {
  const { bookings } = await listMyBookings();

  // One look-up per event (not per booking). If one fails, the others still show.
  const eventIds = [...new Set(bookings.map((b) => b.eventId))];
  const found = await Promise.all(eventIds.map((id) => getEvent(id).then((r) => r.event, (err) => (err instanceof ApiError && err.code === "NETWORK" ? Promise.reject(err) : null))));
  const events = new Map(eventIds.map((id, i) => [id, found[i]]));

  function card(booking) {
    const event = events.get(booking.eventId);
    const tier = event?.tiers.find((t) => t.id === booking.tierId);
    const date = event ? describeDate(event.date) : null;
    const status = booking.status;
    return h("li", { class: `ticket ticket-${status}` },
      h("div", { class: "ticket-body" },
        h("h2", {}, event ? h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title) : "Event no longer available"),
        event ? h("p", { class: "where", text: `${event.venue}, ${event.city}` }) : null,
        h("p", { text: `${booking.quantity} ${ticketWord(booking.quantity)}${tier ? `, ${tier.name}` : ""}: ${formatMoney(booking.totalCents)}` }),
        h("p", { class: `badge badge-status badge-${status}`, text: STATUS_WORDS[status] ?? status }),
        h("p", { class: "muted" }, "Booking ", h("strong", { class: "ref", text: booking.ref })),
        status === "pending" ? h("p", {}, h("a", { class: "button button-primary", href: `#/checkout/${encodeURIComponent(booking.ref)}` }, "Pay now")) : null),
      h("div", { class: "ticket-stub" },
        date
          ? h("time", { datetime: event.date, "aria-label": date.long },
              h("span", { class: "stub-day", text: date.day }), h("span", { class: "stub-month", text: date.month }), h("span", { class: "stub-year", text: date.year }))
          : h("span", { text: "?" })));
  }

  const element = h("section", { class: "page" },
    h("h1", { text: "My tickets" }),
    bookings.length === 0
      ? h("div", { class: "notice" },
          h("p", { text: "You have no tickets yet." }),
          h("p", {}, h("a", { class: "button button-primary", href: "#/" }, "Find an event")))
      : h("ul", { class: "tickets", "aria-label": "Your bookings" }, bookings.map(card)));
  return { title: "My tickets", element };
}
