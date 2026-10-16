import { h } from "../dom.js";

// "Not found", "not allowed", "no connection" and "something went wrong" pages.
// Each one says what happened AND what to do next.
export async function messageView({ kind, detail = "", role = "", onRetry }) {
  const pages = {
    notfound: ["We cannot find that page", "The event or booking you asked for does not exist, or the link is wrong."],
    forbidden: ["This page is not for your account", role === "organizer"
      ? "Only organizer accounts can open this page. Log in with an organizer account."
      : "Only attendee accounts can open this page. Log in with an attendee account."],
    network: ["Cannot reach the server", "Check that the server is running and your connection works, then try again."],
    error: ["Something went wrong", `${detail || "The page could not load."} Try again in a moment.`],
  };
  const [title, text] = pages[kind] ?? pages.error;
  const retry = onRetry && (kind === "network" || kind === "error");
  return {
    title,
    element: h("section", { class: "page narrow" },
      h("h1", { text: title }),
      h("p", { text }),
      h("p", { class: "actions" },
        retry ? h("button", { type: "button", class: "button button-primary", onclick: onRetry }, "Try again") : null,
        h("a", { class: "button", href: "#/" }, "See all events"))),
  };
}
