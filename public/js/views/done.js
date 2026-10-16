import { getBooking, getEvent } from "../api.js";
import { h } from "../dom.js";
import { formatMoney, describeDate, ticketWord } from "../money.js";

// The confirmation page after a paid booking.
export async function doneView({ ref }) {
  const { booking } = await getBooking(ref);
  if (booking.status !== "paid") {
    location.replace(`#/checkout/${encodeURIComponent(ref)}`);
    return { title: "Check out", element: h("p", { class: "notice", text: "This booking is not paid yet. Opening checkout…" }) };
  }
  const { event } = await getEvent(booking.eventId);
  const tier = event.tiers.find((t) => t.id === booking.tierId);
  const date = describeDate(event.date);

  const element = h("section", { class: "page narrow" },
    h("h1", { text: "You are going!" }),
    h("p", { class: "lede", text: `Payment received. ${booking.quantity} ${ticketWord(booking.quantity)} for ${booking.buyerName}.` }),
    h("article", { class: "ticket ticket-confirmed", "aria-label": "Your booking" },
      h("div", { class: "ticket-body" },
        h("h2", { text: event.title }),
        h("p", { class: "where", text: `${event.venue}, ${event.city}` }),
        h("p", { text: `${booking.quantity} × ${tier ? tier.name : "ticket"}` }),
        h("p", { class: "summary-total" }, `Paid ${formatMoney(booking.totalCents)}`),
        h("p", { class: "muted" }, "Booking reference ", h("strong", { class: "ref", text: booking.ref }))),
      h("div", { class: "ticket-stub" },
        h("time", { datetime: event.date, "aria-label": date.long },
          h("span", { class: "stub-day", text: date.day }),
          h("span", { class: "stub-month", text: date.month }),
          h("span", { class: "stub-year", text: date.year })))),
    h("p", {}, h("a", { class: "button", href: "#/" }, "Browse more events")));
  return { title: "Booking confirmed", element };
}
