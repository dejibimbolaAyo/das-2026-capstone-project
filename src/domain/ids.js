
import { randomUUID, randomBytes } from "node:crypto";

export function newId() {
  return randomUUID();
}

export function newReference() {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);

  const reference = Array.from(bytes, (byte) => {
    return ALPHABET[byte % ALPHABET.length];
  });

  if (!reference.some((character) => /[2-9]/.test(character))) {
    reference[7] = ALPHABET[bytes[0] % 8 + 24];
  }

  if (!reference.some((character) => /[A-Z]/.test(character))) {
    reference[0] = ALPHABET[bytes[1] % 24];
  }

  return reference.join("");
}
