// A tiny helper to build page elements safely.
// We never build page code out of text. Text goes in as plain text, so a title like
// "<img onerror=...>" is shown as plain words and can never run as code.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  addChildren(el, children);
  return el;
}

function addChildren(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) addChildren(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

let idCounter = 0;
export function uniqueId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}
