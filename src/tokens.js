import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "./errors.js";

// SIGNED TOKENS (the idea behind JWT, written by hand so you can see every step).
//
// A token is three pieces joined by dots:   header.payload.signature
//   header    says how it is signed ("HS256" = HMAC with SHA-256)
//   payload   the facts: who (sub), when it was made (iat), when it stops working (exp)
//   signature a stamp made with the server's SECRET KEY over header+payload
//
// Anyone can READ a token (it is only base64 text). Nobody can CHANGE it without the secret,
// because the stamp would no longer match. So never put a password or private data in it.

const DEFAULT_TTL_SECONDS = 2 * 60 * 60; // a login lasts 2 hours
const MAX_TOKEN_LENGTH = 2000;

const encode = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

function stamp(secret, text) {
  return createHmac("sha256", secret).update(text).digest("base64url");
}

function refused(message = "Your login is not valid. Please log in again.") {
  return new DomainError("UNAUTHENTICATED", message);
}

export function signToken(claims, secret, { now = Date.now(), ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if ((typeof secret !== "string" && !Buffer.isBuffer(secret)) || secret.length < 16) {
    throw new Error("The token secret must be at least 16 characters long.");
  }
  const issuedAt = Math.floor(now / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ ...claims, iat: issuedAt, exp: issuedAt + ttlSeconds });
  return `${header}.${payload}.${stamp(secret, `${header}.${payload}`)}`;
}

// Gives back the payload, or throws UNAUTHENTICATED. Every kind of bad token gets the SAME
// kind of answer, so an attacker learns nothing about WHY it failed (except "expired").
export function verifyToken(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) throw refused();
  const parts = token.split(".");
  if (parts.length !== 3) throw refused();
  const [header, payload, signature] = parts;

  let head;
  try {
    head = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  } catch {
    throw refused();
  }
  // The famous trick: a token that says "alg: none" asks us to skip the check. We only accept HS256.
  if (head?.alg !== "HS256") throw refused();

  const expected = Buffer.from(stamp(secret, `${header}.${payload}`));
  const given = Buffer.from(signature);
  // timingSafeEqual compares in constant time (a normal === can leak how many letters matched).
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw refused();

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw refused();
  }
  if (claims === null || typeof claims !== "object" || typeof claims.sub !== "string") throw refused();
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(now / 1000)) {
    throw refused("Your login has expired. Please log in again.");
  }
  return claims;
}
