// Build 9: sign up, log in, and say who you are.
// Passwords are hashed with scrypt and never returned. The token carries the
// user's id and role, signed with the server's secret.

import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { requireText } from '../domain/validation.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';

export const ROLES = ['attendee', 'organizer', 'staff'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = ({ id, name, email, role }) => ({ id, name, email, role });

export function createAuthService({ repository, authSecret, now = Date.now, tokenLifetimeSeconds = 8 * 60 * 60 }) {
  const issue = (user) => ({
    token: signToken({ sub: user.id, role: user.role }, authSecret, { expiresInSeconds: tokenLifetimeSeconds, now }),
    user: publicUser(user),
  });

  // Used to spend the same time on an unknown email as on a wrong password.
  let dummyHash;

  return {
    async signup(input) {
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new DomainError('VALIDATION', 'Request body must be a JSON object');
      }
      const name = requireText(input.name, 'name');
      const email = requireText(input.email, 'email').toLowerCase();
      if (email.length > 254 || !EMAIL.test(email)) throw new DomainError('VALIDATION', 'email must be a valid address');
      const { password } = input;
      if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
        throw new DomainError('VALIDATION', 'password must be 8 to 200 characters');
      }
      const role = input.role ?? 'attendee';
      if (!ROLES.includes(role)) throw new DomainError('VALIDATION', `role must be one of ${ROLES.join(', ')}`);

      if (await repository.findUserByEmail(email)) throw new DomainError('EMAIL_TAKEN', 'That email is already registered');

      const user = { id: newId(), name, email, role, passwordHash: await hashPassword(password) };
      try {
        await repository.insertUser(user);
      } catch (error) {
        // Two signups with the same email at the same moment: the UNIQUE constraint decides.
        if (/UNIQUE/i.test(String(error.message))) throw new DomainError('EMAIL_TAKEN', 'That email is already registered');
        throw error;
      }
      return issue(user);
    },

    async login(input) {
      const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input?.password === 'string' ? input.password : '';
      const user = email ? await repository.findUserByEmail(email) : undefined;

      dummyHash ??= await hashPassword('not-a-real-password');
      const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);

      // The same error and message for an unknown email and a wrong password,
      // so nobody can use the form to find out who has an account.
      if (!user || !ok) throw new DomainError('INVALID_CREDENTIALS', 'Wrong email or password');
      return issue(user);
    },

    async me(userId) {
      const user = await repository.findUserById(userId);
      if (!user) throw new DomainError('UNAUTHENTICATED', 'Log in again');
      return publicUser(user);
    },
  };
}
