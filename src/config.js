import { DomainError } from "./domain/errors.js";

export function loadConfig(env = process.env) {
  const rawPort = env.PORT ?? "3000";
  if (String(rawPort).trim() === "") {
    throw new DomainError("VALIDATION", "PORT must be a whole number between 0 and 65535.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new DomainError("VALIDATION", "PORT must be a whole number between 0 and 65535.");
  }

  return Object.freeze({ port });
}
