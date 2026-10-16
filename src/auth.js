import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { DomainError } from "./errors.js";

// AUTHENTICATION RULES: who is this person? (Authorization, "what may they do?", is in services/access.js.)

// Three roles. Anyone can sign up as an attendee or an organizer.
// Staff accounts cannot be self-made (a stranger must not be able to make themselves door staff).
export const ROLES = ["attendee", "organizer", "staff"];
export const SELF_SIGNUP_ROLES = ["attendee", "organizer"];

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128; // very long passwords would let someone make the server work too hard

export function normaliseEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// Checks a signup request. Returns clean values or throws VALIDATION.
export function checkSignup(input) {
  if (input === null || typeof input !== "object") {
    throw new DomainError("VALIDATION", "Signup needs a name, email, password and role.");
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = normaliseEmail(input.email);
  const { password, role } = input;

  if (name === "" || name.length > 80) throw new DomainError("VALIDATION", "Enter your name (up to 80 letters).");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DomainError("VALIDATION", "Enter a valid email address, like ada@example.com.");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new DomainError("VALIDATION", `The password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (!ROLES.includes(role)) {
    throw new DomainError("VALIDATION", `Choose a role: ${SELF_SIGNUP_ROLES.join(" or ")}.`);
  }
  if (!SELF_SIGNUP_ROLES.includes(role)) {
    throw new DomainError("FORBIDDEN", "Staff accounts cannot be created by signing up.");
  }
  return { name, email, password, role };
}

// PASSWORD HASHING. We never keep the password, only a "hash" of it.
// scrypt is slow ON PURPOSE, so a thief with the database cannot guess billions of passwords a second.
// The salt is random and different for every user, so two people with the same password
// get different hashes. Stored as:  scrypt$N$r$p$salt$hash   (the settings travel with the hash).
const DEFAULT_COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

function derive(password, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password, cost = DEFAULT_COST) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost);
  return ["scrypt", cost.N, cost.r, cost.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === "string" ? stored.split("$") : [];
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const cost = { N: Number(N), r: Number(r), p: Number(p) };
  if (![cost.N, cost.r, cost.p].every(Number.isInteger)) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), cost);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
