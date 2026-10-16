// S02, S03, S04: the organizer dashboard. Make events, add ticket types, publish and unpublish.
import { listMyEvents, createEvent, addTier, publishEvent, unpublishEvent, ApiError } from "../api.js";
import { h, uniqueId } from "../dom.js";
import { formatMoney, nairaToCents, describeDate } from "../money.js";

export async function organizerView({ announce }) {
  const { events: first } = await listMyEvents();

  const list = h("ul", { class: "manage-list", "aria-label": "Your events" });
  const status = h("p", { class: "result-count", role: "status" });

  function showMessage(target, message, isError = true) {
    target.textContent = message;
    target.hidden = !message;
    target.classList.toggle("field-error", isError);
  }

  async function refresh() {
    const { events } = await listMyEvents();
    list.replaceChildren(...events.map(eventCard));
    status.textContent = events.length === 0 ? "You have no events yet. Create your first one above." : `${events.length} ${events.length === 1 ? "event" : "events"}.`;
  }

  // ---- create an event
  const f = { title: uniqueId("title"), city: uniqueId("city"), venue: uniqueId("venue"), date: uniqueId("date") };
  const createError = h("p", { class: "field-error", role: "alert", hidden: true, tabindex: "-1" });
  const createButton = h("button", { type: "submit", class: "button button-primary" }, "Create event");
  const inputs = {
    title: h("input", { id: f.title, name: "title", maxlength: 120 }),
    city: h("input", { id: f.city, name: "city", maxlength: 80 }),
    venue: h("input", { id: f.venue, name: "venue", maxlength: 120 }),
    date: h("input", { id: f.date, name: "date", type: "date" }),
  };
  const createForm = h("form", { class: "manage-form", novalidate: true, "aria-label": "Create an event" },
    h("h2", { text: "Create an event" }),
    h("div", { class: "field-grid" },
      h("div", { class: "field" }, h("label", { for: f.title }, "Title"), inputs.title),
      h("div", { class: "field" }, h("label", { for: f.city }, "City"), inputs.city),
      h("div", { class: "field" }, h("label", { for: f.venue }, "Venue"), inputs.venue),
      h("div", { class: "field" }, h("label", { for: f.date }, "Date"), inputs.date)),
    createError, createButton);

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    createError.hidden = true;
    const empty = Object.entries(inputs).find(([, el]) => el.value.trim() === "");
    if (empty) {
      empty[1].focus();
      return showMessage(createError, "Fill in the title, city, venue and date.");
    }
    createButton.disabled = true;
    createButton.textContent = "Creating…";
    try {
      const { event } = await createEvent({ title: inputs.title.value.trim(), city: inputs.city.value.trim(), venue: inputs.venue.value.trim(), date: inputs.date.value });
      createForm.reset();
      await refresh();
      announce(`Event ${event.title} created as a draft. Add a ticket type, then publish it.`);
      inputs.title.focus();
    } catch (err) {
      showMessage(createError, err instanceof ApiError ? err.message : "The event could not be created. Try again.");
      createError.focus();
    } finally {
      createButton.disabled = false;
      createButton.textContent = "Create event";
    }
  });

  // ---- one event on the dashboard
  function eventCard(event) {
    const date = describeDate(event.date);
    const published = event.status === "published";
    const note = h("p", { class: "field-error", role: "alert", hidden: true, tabindex: "-1" });

    const toggle = h("button", { type: "button", class: "button" + (published ? "" : " button-primary") }, published ? "Unpublish" : "Publish");
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      note.hidden = true;
      try {
        await (published ? unpublishEvent(event.id) : publishEvent(event.id));
        await refresh();
        announce(published ? `${event.title} is now a draft.` : `${event.title} is published.`);
      } catch (err) {
        toggle.disabled = false;
        showMessage(note, err instanceof ApiError ? err.message : "That did not work. Try again.");
        note.focus();
      }
    });

    // add a ticket type
    const ids = { name: uniqueId("tier-name"), price: uniqueId("tier-price"), cap: uniqueId("tier-cap") };
    const tierName = h("input", { id: ids.name, name: "name", maxlength: 60 });
    const tierPrice = h("input", { id: ids.price, name: "price", inputmode: "decimal", placeholder: "0 for free" });
    const tierCap = h("input", { id: ids.cap, name: "capacity", type: "number", min: 1, step: 1, inputmode: "numeric" });
    const tierError = h("p", { class: "field-error", role: "alert", hidden: true, tabindex: "-1" });
    const tierForm = h("form", { class: "tier-form", novalidate: true, "aria-label": `Add a ticket type to ${event.title}` },
      h("div", { class: "field-grid" },
        h("div", { class: "field" }, h("label", { for: ids.name }, "Ticket type name"), tierName),
        h("div", { class: "field" }, h("label", { for: ids.price }, "Price (₦)"), tierPrice),
        h("div", { class: "field" }, h("label", { for: ids.cap }, "Number of seats"), tierCap)),
      tierError,
      h("button", { type: "submit", class: "button" }, "Add ticket type"));
    tierForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      tierError.hidden = true;
      const priceCents = nairaToCents(tierPrice.value);
      const capacity = Number(tierCap.value);
      if (tierName.value.trim() === "") { tierName.focus(); return showMessage(tierError, "Enter a name for the ticket type."); }
      if (priceCents === null) { tierPrice.focus(); return showMessage(tierError, "Enter the price as a number, like 5000 or 2500.50. Use 0 for free."); }
      if (!Number.isInteger(capacity) || capacity < 1) { tierCap.focus(); return showMessage(tierError, "Enter how many seats, as a whole number of 1 or more."); }
      try {
        await addTier(event.id, { name: tierName.value.trim(), priceCents, capacity });
        await refresh();
        announce(`Ticket type added to ${event.title}.`);
      } catch (err) {
        showMessage(tierError, err instanceof ApiError ? err.message : "The ticket type could not be added. Try again.");
        tierError.focus();
      }
    });

    return h("li", { class: "manage-card" },
      h("div", { class: "manage-head" },
        h("h2", {}, h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title)),
        h("p", { class: `badge badge-status ${published ? "badge-paid" : "badge-pending"}`, text: published ? "Published" : "Draft" })),
      h("p", { class: "where", text: `${date.long}, ${event.venue}, ${event.city}` }),
      event.tiers.length === 0
        ? h("p", { class: "muted", text: "No ticket types yet. Add one before you publish." })
        : h("ul", { class: "tier-summary" }, event.tiers.map((t) => h("li", {}, `${t.name}: ${formatMoney(t.priceCents)}, ${t.capacity - t.seatsLeft} of ${t.capacity} sold`))),
      h("details", { class: "add-tier" }, h("summary", { text: "Add a ticket type" }), tierForm),
      note,
      h("p", { class: "actions" }, toggle));
  }

  list.replaceChildren(...first.map(eventCard));
  status.textContent = first.length === 0 ? "You have no events yet. Create your first one above." : `${first.length} ${first.length === 1 ? "event" : "events"}.`;

  const element = h("section", { class: "page" },
    h("h1", { text: "My events" }),
    h("p", { class: "lede", text: "Create an event, add ticket types, then publish it so people can book." }),
    createForm, status, list);
  return { title: "My events", element };
}
