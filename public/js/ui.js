// Build 6: small DOM helpers shared by the browser pages.
//
// Everything is built with document.createElement and textContent. Nothing here
// ever touches innerHTML, so event data can never be injected as markup.

export const MAX_TICKETS_PER_BOOKING = 10;

// el('p', { class: 'lede', text: 'Hi' }, childNode, 'more text')
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'on' && typeof value === 'object') {
      for (const [event, handler] of Object.entries(value)) {
        node.addEventListener(event, handler);
      }
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else if (typeof Node !== 'undefined' && child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// Money is whole cents; this is the ONE place it becomes readable.
// 250000 -> "₦2,500". No decimals unless the cents are not a whole naira.
export function formatMoney(cents) {
  const naira = (Number(cents) || 0) / 100;
  return `₦${naira.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// A quantity may never go above 10 or above the seats left, and never below 1.
// Returns 0 only when there are no seats at all (the tier is sold out).
export function clampQuantity(value, seatsLeft) {
  const max = Math.min(MAX_TICKETS_PER_BOOKING, Math.max(0, Math.floor(seatsLeft)));
  if (max < 1) return 0;

  let quantity = Math.trunc(Number(value));
  if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
  if (quantity > max) quantity = max;
  return quantity;
}

export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
