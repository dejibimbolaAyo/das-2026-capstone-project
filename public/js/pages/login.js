// Build 7: the login and signup page.
//
// Both forms call public/js/api.js, which stores the token through session.js.
// A failed login shows the API's message (the same one for a wrong password and
// an unknown email) and never says which was wrong.

import { login, signup, ApiError } from '../api.js';
import { isLoggedIn, getUser } from '../session.js';
import { mountNav } from '../nav.js';

const params = new URLSearchParams(location.search);
const next = params.get('next') || '/';

const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const signupForm = document.getElementById('signup-form');
const signupStatus = document.getElementById('signup-status');

function show(node, message, kind = 'error') {
  node.textContent = message;
  node.className = `status status-${kind}`;
}

function busy(button, text) {
  if (!button) return;
  button.disabled = true;
  button.dataset.label = button.textContent;
  button.textContent = text;
}

function ready(button) {
  if (!button) return;
  button.disabled = false;
  if (button.dataset.label) button.textContent = button.dataset.label;
}

async function run(status, button, work, onSuccess) {
  show(status, 'Working...', 'info');
  busy(button, 'Please wait...');
  try {
    const result = await work();
    await onSuccess(result);
  } catch (error) {
    show(status, error instanceof ApiError ? error.message : 'Something went wrong.');
    ready(button);
  }
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  run(loginStatus, button, () => login({
    email: document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  }), (session) => {
    redirectFor(session.user);
  });
});

signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const button = signupForm.querySelector('button[type="submit"]');
  run(signupStatus, button, () => signup({
    email: document.getElementById('signup-email').value,
    password: document.getElementById('signup-password').value,
    role: document.getElementById('signup-role').value,
  }), (session) => {
    redirectFor(session.user);
  });
});

// Where to land after a successful login: the page the visitor came from, or
// the home page their role cares about most.
function redirectFor(user) {
  if (next !== '/') {
    location.assign(next);
    return;
  }
  location.assign(user.role === 'organizer' ? '/organizer.html' : '/tickets.html');
}

mountNav();

if (isLoggedIn()) {
  show(loginStatus, `You are already signed in as ${getUser()?.email ?? 'a user'}.`, 'info');
}
