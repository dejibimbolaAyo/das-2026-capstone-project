// S05: browse, filter and sort events.
import { listEvents, ApiError } from "../api.js";
import { h, uniqueId } from "../dom.js";
import { formatMoney, nairaToCents, describeDate } from "../money.js";

const SORTS = [
  ["date-asc", "Soonest first"],
  ["date-desc", "Latest first"],
  ["price-asc", "Cheapest first"],
  ["price-desc", "Most expensive first"],
  ["availability-asc", "Fewest seats left"],
  ["availability-desc", "Most seats left"],
];

// The filter boxes live in the address (#/?city=Lagos) so the back button and sharing a link work.
function readValues(query) {
  const sort = query.get("sort");
  return {
    q: query.get("q") ?? "",
    city: query.get("city") ?? "",
    from: query.get("from") ?? "",
    to: query.get("to") ?? "",
    max: query.get("max") ?? "",
    sort: SORTS.some(([key]) => key === sort) ? sort : "date-asc",
  };
}

// Turns the box values into an API query. Returns { query } or { problem }.
export function toApiQuery(values) {
  const query = {};
  if (values.q.trim()) query.q = values.q.trim();
  if (values.city) query.city = values.city;
  if (values.from) query.dateFrom = values.from;
  if (values.to) query.dateTo = values.to;
  if (values.from && values.to && values.from > values.to) {
    return { problem: "The end date is before the start date. Change one of them." };
  }
  if (values.max.trim()) {
    const cents = nairaToCents(values.max);
    if (cents === null) return { problem: "Enter the highest price as a number, for example 10000." };
    query.maxPriceCents = cents;
  }
  const [sort, order] = values.sort.split("-");
  query.sort = sort;
  query.order = order;
  return { query };
}

function totalSeatsLeft(event) {
  return event.tiers.reduce((sum, t) => sum + t.seatsLeft, 0);
}

function ticketCard(event) {
  const date = describeDate(event.date);
  const soldOut = totalSeatsLeft(event) === 0;
  // Show the cheapest tier that can still be bought.
  const prices = event.tiers.filter((t) => t.seatsLeft > 0).map((t) => t.priceCents);
  const from = prices.length ? Math.min(...prices) : 0;
  return h("li", { class: "ticket" + (soldOut ? " is-soldout" : "") },
    h("div", { class: "ticket-body" },
      h("h2", {}, h("a", { href: `#/event/${encodeURIComponent(event.id)}` }, event.title)),
      h("p", { class: "where", text: `${event.venue}, ${event.city}` }),
      soldOut
        ? h("p", { class: "badge badge-soldout", text: "Sold out" })
        : h("p", { class: "price" }, from === 0 ? "Free entry available" : `From ${formatMoney(from)}`)),
    h("div", { class: "ticket-stub" },
      h("time", { datetime: event.date, "aria-label": date.long },
        h("span", { class: "stub-day", text: date.day }),
        h("span", { class: "stub-month", text: date.month }),
        h("span", { class: "stub-year", text: date.year }))));
}

export async function browseView({ query, announce }) {
  const values = readValues(query);
  const everything = (await listEvents({})).events;
  const cities = [...new Set(everything.map((e) => e.city))].sort();

  const ids = { q: uniqueId("q"), city: uniqueId("city"), from: uniqueId("from"), to: uniqueId("to"), max: uniqueId("max"), sort: uniqueId("sort") };
  const problem = h("p", { class: "field-error", role: "alert", hidden: true });
  const list = h("ul", { class: "tickets", "aria-label": "Events" });
  const count = h("p", { class: "result-count", "aria-live": "polite" });

  const input = (key, label, attrs = {}) => h("div", { class: "field" },
    h("label", { for: ids[key] }, label),
    h("input", { id: ids[key], name: key, value: values[key], ...attrs }));

  const citySelect = h("select", { id: ids.city, name: "city" },
    h("option", { value: "" }, "All cities"),
    cities.map((c) => h("option", { value: c, selected: c === values.city }, c)));
  const sortSelect = h("select", { id: ids.sort, name: "sort" },
    SORTS.map(([key, label]) => h("option", { value: key, selected: key === values.sort }, label)));

  const form = h("form", { class: "filters", role: "search", "aria-label": "Find events", novalidate: true },
    input("q", "Search", { type: "search", placeholder: "Title, city or venue", autocomplete: "off" }),
    h("div", { class: "field" }, h("label", { for: ids.city }, "City"), citySelect),
    input("from", "From date", { type: "date" }),
    input("to", "To date", { type: "date" }),
    input("max", "Highest price (₦)", { type: "text", inputmode: "decimal", placeholder: "No limit", autocomplete: "off" }),
    h("div", { class: "field" }, h("label", { for: ids.sort }, "Sort by"), sortSelect),
    h("div", { class: "filter-actions" },
      h("button", { type: "button", class: "button button-quiet", onclick: clearAll }, "Clear filters")));

  function currentValues() {
    const data = new FormData(form);
    return Object.fromEntries(["q", "city", "from", "to", "max", "sort"].map((k) => [k, String(data.get(k) ?? "")]));
  }

  let latest = 0;
  async function refresh(speak) {
    const now = currentValues();
    // Keep the address in step with the boxes, without adding a history step per keystroke.
    const shown = new URLSearchParams();
    for (const [k, v] of Object.entries(now)) if (v && !(k === "sort" && v === "date-asc")) shown.set(k, v);
    history.replaceState(null, "", "#/" + (shown.size ? "?" + shown : ""));

    const built = toApiQuery(now);
    problem.hidden = !built.problem;
    problem.textContent = built.problem ?? "";
    if (built.problem) return;

    const token = ++latest;
    list.setAttribute("aria-busy", "true");
    try {
      const { events } = await listEvents(built.query);
      if (token !== latest) return;
      list.replaceChildren(...events.map(ticketCard));
      const message = events.length === 0
        ? "No events match. Remove a filter to see more."
        : `${events.length} ${events.length === 1 ? "event" : "events"} found.`;
      count.textContent = message;
      count.classList.toggle("is-empty", events.length === 0);
    } catch (error) {
      if (token !== latest) return;
      list.replaceChildren();
      count.textContent = error instanceof ApiError ? error.message : "Events could not load. Try again.";
    } finally {
      if (token === latest) list.removeAttribute("aria-busy");
    }
  }

  function clearAll() {
    form.reset();
    for (const el of form.elements) {
      if (el.name === "sort") el.value = "date-asc";
      else if (el.name) el.value = "";
    }
    refresh();
    form.elements.q.focus();
  }

  form.addEventListener("input", () => refresh());
  form.addEventListener("submit", (e) => { e.preventDefault(); refresh(); });

  const element = h("section", { class: "page" },
    h("div", { class: "page-head" },
      h("h1", { text: "Find your next event" }),
      h("p", { class: "lede", text: "Pick a night out, choose your tickets and pay in a minute." })),
    form, problem, count, list);

  await refresh();
  return { title: "Events", element };
}
