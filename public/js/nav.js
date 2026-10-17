// Build 7: the account links in the header.
//
// mountNav() reads session.js and writes "Log in", or the user's email plus the
// links their role can use. This is convenience, NOT security: hiding "My
// events" from an attendee stops nothing, because the server checks the role on
// every request anyway.

import { el, clear } from './ui.js';
import { getUser, clearSession } from './session.js';

export function mountNav(nodeId = 'account-nav') {
  const node = document.getElementById(nodeId);
  if (!node) return;

  clear(node);
  const user = getUser();

  if (!user) {
    node.appendChild(el('a', { href: '/login.html', text: 'Log in' }));
    return;
  }

  node.appendChild(el('span', { class: 'nav-user', text: user.email, title: `Signed in as ${user.role}` }));
  if (user.role === 'organizer') {
    node.appendChild(el('a', { href: '/organizer.html', text: 'My events' }));
  }
  node.appendChild(el('a', { href: '/tickets.html', text: 'My tickets' }));
  node.appendChild(el('button', {
    type: 'button',
    class: 'link-button',
    text: 'Log out',
    on: {
      click: () => {
        clearSession();
        if (typeof location !== 'undefined') location.assign('/');
      },
    },
  }));
}
