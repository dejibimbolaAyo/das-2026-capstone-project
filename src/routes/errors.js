import { DomainError } from "../services/errors.js";
import { sendError } from "./respond.js";

// ROUTES layer: turns a problem into the one standard error reply.
// Every error code the rules can throw must have a status here.
// (test/api.test.js checks that no code is missing.)
export const STATUS_BY_CODE = {
  VALIDATION: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  PAYMENT_DECLINED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  SOLD_OUT: 409,
  NOT_PUBLISHED: 409,
  NOT_SOLD_OUT: 409,
  INVALID_STATE: 409,
  ALREADY_CANCELLED: 409,
  EMAIL_TAKEN: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  BUSY: 503,
};

// A thrown error comes here. Known problems get their own status.
// Anything unexpected becomes a plain 500, and the details stay in the server log.
export function sendCaughtError(req, res, err) {
  const known = err instanceof DomainError || err instanceof HttpProblem;
  const status = known ? STATUS_BY_CODE[err.code] : undefined;
  if (status === 401) return sendError(req, res, 401, err.code, err.message, { "WWW-Authenticate": "Bearer" });
  if (status) return sendError(req, res, status, err.code, err.message);
  console.error(err);
  return sendError(req, res, 500, "INTERNAL", "Something went wrong on the server.");
}

// For problems the routes find themselves (bad JSON, too big, wrong type...).
export class HttpProblem extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HttpProblem";
    this.code = code;
  }
}
