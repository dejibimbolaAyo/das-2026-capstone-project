// Build 7: signup, login and "who am I".
//
// The service never sees req/res and never stores or returns a raw password:
// signup hashes it, and every reply carries only {id, email, role}. The rule
// that matters most is in login: an unknown email and a wrong password give the
// SAME INVALID_CREDENTIALS, so a caller cannot discover who has an account.

import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { requireEmail, requirePassword } from '../domain/validation.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/token.js';

export const ROLES = Object.freeze(['attendee', 'organizer', 'staff']);

// The only shape a user is ever allowed to leave the service in. There is no
// passwordHash on it, so no route can leak one by accident.
function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

export function createAuthService(repository, { tokenSecret } = {}) {
  function issueToken(user) {
    return signToken(
      { sub: user.id, email: user.email, role: user.role },
      { secret: tokenSecret },
    );
  }

  return {
    async signup({ email, password, role = 'attendee' }) {
      const cleanEmail = requireEmail(email);
      const cleanPassword = requirePassword(password);
      if (!ROLES.includes(role)) {
        throw new DomainError('VALIDATION', 'role must be attendee, organizer or staff');
      }

      // UNIQUE(email) in the schema is the backstop; the rule lives here so a
      // repeat is answered with EMAIL_TAKEN instead of a raw database error.
      if (await repository.findUserByEmail(cleanEmail)) {
        throw new DomainError('EMAIL_TAKEN', 'That email is already registered');
      }

      const user = {
        id: newId(),
        email: cleanEmail,
        passwordHash: await hashPassword(cleanPassword),
        role,
      };
      await repository.saveUser(user);

      return { user: publicUser(user), token: issueToken(user) };
    },

    // Unknown email and wrong password both throw INVALID_CREDENTIALS with the
    // same message. Note the early return: we never hash when the user is
    // missing, which would leak the difference through timing.
    async login({ email, password }) {
      if (typeof email !== 'string' || typeof password !== 'string') {
        throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password');
      }
      const user = await repository.findUserByEmail(email.trim().toLowerCase());
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new DomainError('INVALID_CREDENTIALS', 'Invalid email or password');
      }
      return { user: publicUser(user), token: issueToken(user) };
    },

    async me(userId) {
      const user = await repository.findUserById(userId);
      if (!user) throw new DomainError('UNAUTHENTICATED', 'Authentication required');
      return publicUser(user);
    },
  };
}
