// S06: look at one event, choose a ticket type and a quantity.
import { getEvent, createBooking, joinWaitlist, ApiError, MAX_PER_BOOKING, currentUser } from "../api.js";
import { h, uniqueId } from "../dom.js";
import { formatMoney, describeDate, ticketWord } from "../money.js";

export async function eventView({ id }) {
  const { event } = await getEvent(id);
  const user = currentUser();
  const canBook = user?.role === "attendee"; // the server checks this too
  const date = describeDate(event.date);
  const anyAvailable = event.tiers.some((t) => t.seatsLeft > 0);
  const radioName = uniqueId("tier");

  let chosen = event.tiers.find((t) => t.seatsLeft > 0) ?? null;

  const nameId = uniqueId("buyer");
  const qtyId = uniqueId("qty");
  const nameInput = h("input", { id: nameId, name: "buyerName", autocomplete: "name", required: true, value: user?.name ?? "" });
  const qtyInput = h("input", { id: qtyId, name: "quantity", type: "number", inputmode: "numeric", min: 1, value: 1, step: 1 });
  const total = h("p", { class: "total", "aria-live": "polite" });
  const error = h("p", { class: "field-error", role: "alert", hidden: true, tabindex: "-1" });
  const submit = h("button", { type: "submit", class: "button button-primary" }, "Reserve tickets");

  // Who may book? Only a logged-in attendee. Everyone else gets told what to do.
  function loginNote() {
    if (canBook) return null;
    const here = encodeURIComponent(`#/event/${event.id}`);
    if (!user) {
      return h("p", { class: "notice" }, h("a", { href: `#/login?next=${here}` }, "Log in"), " or ", h("a", { href: `#/signup?next=${here}` }, "create an account"), " to book tickets.");
    }
    return h("p", { class: "notice", text: "Organizer accounts cannot book tickets. Log in with an attendee account to book." });
  }

  function maxFor(t) {
    return t ? Math.min(MAX_PER_BOOKING, t.seatsLeft) : 0;
  }

  function update() {
    const max = maxFor(chosen);
    qtyInput.max = String(Math.max(max, 1));
    qtyInput.disabled = !chosen || !canBook;
    submit.disabled = !chosen || !canBook;
    const qty = Number(qtyInput.value);
    if (chosen && Number.isInteger(qty) && qty >= 1 && qty <= max) {
      total.textContent = `Total: ${formatMoney(chosen.priceCents * qty)} for ${qty} ${ticketWord(qty)}`;
    } else if (chosen) {
      total.textContent = `Choose between 1 and ${max} tickets.`;
    } else {
      total.textContent = "";
    }
  }

  function tierRow(t) {
    const soldOut = t.seatsLeft === 0;
    const inputId = uniqueId("tier-option");
    const radio = h("input", { type: "radio", id: inputId, name: radioName, value: t.id, checked: !soldOut && chosen?.id === t.id, disabled: soldOut,
      onchange: () => { chosen = t; update(); } });
    let note = null;
    let extra = null;
    if (soldOut) {
      note = h("span", { class: "badge badge-soldout", text: "Sold out" });
      extra = waitlistControl(t);
    } else if (t.seatsLeft <= 10) note = h("span", { class: "badge badge-few", text: `Only ${t.seatsLeft} left` });
    return h("li", { class: "tier" + (soldOut ? " is-soldout" : "") },
      radio,
      h("label", { for: inputId },
        h("span", { class: "tier-name", text: t.name }),
        h("span", { class: "tier-price", text: formatMoney(t.priceCents) })),
      note,
      extra);
  }

  // S11: a sold-out ticket type can have a waitlist. Only attendees may join.
  function waitlistControl(t) {
    const here = encodeURIComponent(`#/event/${event.id}`);
    if (!user) return h("p", { class: "tier-extra" }, h("a", { href: `#/login?next=${here}` }, "Log in"), " to join the waitlist.");
    if (!canBook) return null;
    const message = h("span", { class: "tier-extra-text", role: "status" });
    const button = h("button", { type: "button", class: "button button-small", "aria-label": `Join the waitlist for ${t.name}` }, "Join the waitlist");
    const done = (text) => {
      button.hidden = true;
      message.replaceChildren(text, " ", h("a", { href: "#/tickets" }, "See My tickets"));
    };
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const { entry } = await joinWaitlist({ eventId: event.id, tierId: t.id });
        done(`You are number ${entry.position} in line.`);
      } catch (err) {
        button.disabled = false;
        if (err instanceof ApiError && err.code === "ALREADY_ON_WAITLIST") done("You are already on this waitlist.");
        else if (err instanceof ApiError && err.code === "NOT_SOLD_OUT") {
          message.textContent = "Seats are available now. Reloading…";
          setTimeout(() => location.reload(), 1500);
        } else if (err instanceof ApiError && err.code === "UNAUTHENTICATED") location.hash = `#/login?next=${here}`;
        else message.textContent = err instanceof ApiError ? err.message : "Could not join the waitlist. Try again.";
      }
    });
    return h("div", { class: "tier-extra" }, button, message);
  }

  const tiers = h("fieldset", { class: "tiers" },
    h("legend", { text: "Choose a ticket type" }),
    h("ul", {}, event.tiers.map(tierRow)));

  const form = h("form", { class: "booking", novalidate: true, "aria-label": "Reserve tickets" },
    tiers,
    anyAvailable ? null : h("p", { class: "notice-sold", text: "Every ticket type is sold out. You can join a waitlist below, or check the other events." }),
    loginNote(),
    h("div", { class: "field" }, h("label", { for: qtyId }, `Number of tickets (up to ${MAX_PER_BOOKING})`), qtyInput),
    h("div", { class: "field" }, h("label", { for: nameId }, "Name for the booking"), nameInput),
    total, error, submit);

  qtyInput.addEventListener("input", update);

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    error.focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!chosen) return showError("Choose a ticket type that is not sold out.");
    const quantity = Number(qtyInput.value);
    const max = maxFor(chosen);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) {
      qtyInput.focus();
      return showError(`Choose between 1 and ${max} tickets for ${chosen.name}.`);
    }
    if (nameInput.value.trim() === "") {
      nameInput.focus();
      return showError("Enter the name for the booking.");
    }
    submit.disabled = true;
    submit.textContent = "Reserving…";
    try {
      const { booking } = await createBooking({ eventId: event.id, tierId: chosen.id, buyerName: nameInput.value, quantity });
      location.hash = `#/checkout/${encodeURIComponent(booking.ref)}`;
    } catch (err) {
      submit.disabled = false;
      submit.textContent = "Reserve tickets";
      showError(err instanceof ApiError ? err.message : "The booking could not be made. Try again.");
      if (err instanceof ApiError && err.code === "SOLD_OUT") setTimeout(() => location.reload(), 2500);
      if (err instanceof ApiError && err.code === "UNAUTHENTICATED") location.hash = `#/login?next=${encodeURIComponent(`#/event/${event.id}`)}`;
    }
  });

  update();

  const element = h("section", { class: "page" },
    h("p", { class: "back" }, h("a", { href: "#/" }, "Back to all events")),
    event.status === "draft" ? h("p", { class: "banner banner-warn", text: "This event is a draft. Only you can see it. Publish it from My events so people can book." }) : null,
    h("div", { class: "event-head" },
      h("div", {},
        h("h1", { text: event.title }),
        h("p", { class: "lede", text: `${event.venue}, ${event.city}` }),
        h("p", { class: "when" }, h("time", { datetime: event.date, text: date.long }))),
      h("div", { class: "ticket-stub stub-large", "aria-hidden": "true" },
        h("span", { class: "stub-day", text: date.day }),
        h("span", { class: "stub-month", text: date.month }),
        h("span", { class: "stub-year", text: date.year }))),
    form);

  return { title: event.title, element };
}
