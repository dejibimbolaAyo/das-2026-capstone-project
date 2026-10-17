// Build 7: authentication (who are you) and authorization (may you do this).
//
// These are the only two places that read the Authorization header. A route
// handler asks the guard, gets a user back, or the request is refused:
//
//   const user = requireUser(req);            // any signed-in user
//   const user = requireRole(req, ['staff']); // a signed-in user with a role
//
// The role comes from the signed token, which the client cannot edit, so the
// answer is the server's, never the page's. The secret is injected once, when
// the guard is created, exactly like the services receive a repository.

import { DomainError } from '../domain/errors.js';
import { verifyToken } from '../lib/token.js';

function bearerToken(header) {
  if (typeof header !== 'string') return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (rest.length > 0) return null;
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function createGuards({ tokenSecret } = {}) {
  function requireUser(req) {
    const token = bearerToken(req.headers?.authorization);
    const claims = token ? verifyToken(token, { secret: tokenSecret }) : null;
    if (!claims || typeof claims.sub !== 'string' || claims.sub === '') {
      throw new DomainError('UNAUTHENTICATED', 'A valid bearer token is required');
    }
    return { userId: claims.sub, email: claims.email, role: claims.role };
  }

  function requireRole(req, roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    const user = requireUser(req);
    if (!allowed.includes(user.role)) {
      throw new DomainError('FORBIDDEN', 'Your role is not allowed to do this');
    }
    return user;
  }

  return { requireUser, requireRole };
}
