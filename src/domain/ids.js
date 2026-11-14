import { randomBytes, randomUUID } from "node:crypto";

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newId() {
  return randomUUID();
}

export function newReference() {
  const bytes = randomBytes(8);
  let code = "";

  for (const byte of bytes) {
    code += REFERENCE_ALPHABET[byte & 31];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
