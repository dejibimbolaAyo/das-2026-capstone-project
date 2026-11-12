// Small helpers for building the page. All data goes in as text, never as HTML.

// el('button', { class: 'primary', text: 'Book', onclick: fn }, [child, 'text'])
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  const list = [].concat(children).filter((child) => child !== null && child !== undefined && child !== false);
  node.append(...list);
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

// The only place money is formatted. Amounts are whole cents: 250000 -> ₦2,500
export function formatMoney(cents) {
  const naira = cents / 100;
  return '₦' + naira.toLocaleString('en-NG', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

// 600 seconds -> "10:00"
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
