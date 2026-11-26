// Build 9: who is calling, and are they allowed?
//
// Authentication  = who are you?    (a valid, unexpired, correctly signed token)
// Authorization   = what may you do? (your role, and whether the thing is yours)
//
// Roles are checked HERE, on the server. Hiding a button in the page is
// politeness, not security: anyone can send a request by hand.

import { DomainError } from '../domain/errors.js';
import { verifyToken } from '../lib/token.js';

export function createGuards({ authSecret, now = Date.now }) {
  function bearerToken(request) {
    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header) : null;
    return match ? match[1].trim() : null;
  }

  // No token: null (the caller is anonymous). A token that is not valid: an error.
  function optionalUser(request) {
    const token = bearerToken(request);
    if (!token) return null;
    const claims = verifyToken(token, authSecret, { now });
    if (!claims) throw new DomainError('UNAUTHENTICATED', 'Your session is not valid. Log in again.');
    return { id: claims.sub, role: claims.role };
  }

  function requireUser(request) {
    const user = optionalUser(request);
    if (!user) throw new DomainError('UNAUTHENTICATED', 'Log in first');
    return user;
  }

  function requireRole(request, ...roles) {
    const user = requireUser(request);
    if (!roles.includes(user.role)) {
      throw new DomainError('FORBIDDEN', `Only ${roles.join(' or ')} accounts can do that`);
    }
    return user;
  }

  return { optionalUser, requireUser, requireRole };
}
