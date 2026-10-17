// S01: sign up and log in. One screen, two modes.
import { login, signup, ApiError, currentUser } from "../api.js";
import { h, uniqueId } from "../dom.js";

// "?next=#/checkout/BK-000001" brings the person back to where they were. Only our own # pages are allowed.
export function safeNext(next) {
  return typeof next === "string" && /^#\/[\w\-/?=&%.]*$/.test(next) && !next.includes("//") ? next : null;
}

export async function authView({ mode, query, announce }) {
  const isSignup = mode === "signup";
  const next = safeNext(query?.get("next"));
  const ids = { name: uniqueId("name"), email: uniqueId("email"), password: uniqueId("pw"), role: uniqueId("role") };

  const banner = h("div", { class: "banner", role: "alert", hidden: true, tabindex: "-1" });
  const submit = h("button", { type: "submit", class: "button button-primary" }, isSignup ? "Create account" : "Log in");

  const name = h("input", { id: ids.name, name: "name", autocomplete: "name", maxlength: 80 });
  const email = h("input", { id: ids.email, name: "email", type: "email", autocomplete: "email", inputmode: "email" });
  const password = h("input", { id: ids.password, name: "password", type: "password", autocomplete: isSignup ? "new-password" : "current-password", "aria-describedby": isSignup ? `${ids.password}-hint` : null });

  const roleOption = (value, label, checked) => h("label", { class: "choice" },
    h("input", { type: "radio", name: "role", value, checked }), h("span", { text: label }));

  const form = h("form", { class: "auth-form", novalidate: true, "aria-label": isSignup ? "Create an account" : "Log in" },
    banner,
    isSignup ? h("div", { class: "field" }, h("label", { for: ids.name }, "Your name"), name) : null,
    h("div", { class: "field" }, h("label", { for: ids.email }, "Email"), email),
    h("div", { class: "field" },
      h("label", { for: ids.password }, "Password"), password,
      isSignup ? h("p", { class: "muted", id: `${ids.password}-hint`, text: "At least 8 characters." }) : null),
    isSignup ? h("fieldset", { class: "roles" },
      h("legend", { text: "What do you want to do?" }),
      roleOption("attendee", "Buy tickets (attendee)", true),
      roleOption("organizer", "Sell tickets for my events (organizer)", false)) : null,
    submit);

  function showBanner(message) {
    banner.textContent = message;
    banner.hidden = false;
    banner.focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    banner.hidden = true;
    // Quick checks so the person gets help at once. The server checks everything again.
    if (isSignup && name.value.trim() === "") { name.focus(); return showBanner("Enter your name."); }
    if (email.value.trim() === "") { email.focus(); return showBanner("Enter your email address."); }
    if (password.value === "") { password.focus(); return showBanner(isSignup ? "Choose a password." : "Enter your password."); }

    submit.disabled = true;
    submit.textContent = isSignup ? "Creating account…" : "Logging in…";
    form.setAttribute("aria-busy", "true");
    try {
      const user = isSignup
        ? await signup({ name: name.value, email: email.value, password: password.value, role: form.elements.role.value })
        : await login({ email: email.value, password: password.value });
      announce(`Welcome, ${user.name}.`);
      location.hash = next ?? (user.role === "organizer" ? "#/organizer" : "#/");
    } catch (err) {
      submit.disabled = false;
      submit.textContent = isSignup ? "Create account" : "Log in";
      form.removeAttribute("aria-busy");
      password.value = ""; // never keep a failed password on screen
      showBanner(err instanceof ApiError ? err.message : "That did not work. Try again.");
      (err instanceof ApiError && err.code === "EMAIL_TAKEN" ? email : password).focus();
    }
  });

  const other = isSignup
    ? h("p", {}, "Already have an account? ", h("a", { href: next ? `#/login?next=${encodeURIComponent(next)}` : "#/login" }, "Log in"))
    : h("p", {}, "New here? ", h("a", { href: next ? `#/signup?next=${encodeURIComponent(next)}` : "#/signup" }, "Create an account"));

  const user = currentUser();
  const element = h("section", { class: "page narrow" },
    h("h1", { text: isSignup ? "Create your account" : "Log in" }),
    user ? h("p", { class: "notice", text: `You are logged in as ${user.name}. Log in again to switch accounts.` }) : null,
    form, other);
  return { title: isSignup ? "Sign up" : "Log in", element };
}
