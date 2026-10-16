import { HttpProblem } from "./errors.js";

// Reads the request body as JSON. Gives back a plain object.
//   no body            -> {}
//   too big            -> 413
//   not JSON content   -> 415
//   broken JSON        -> 400 BAD_REQUEST
//   JSON but not {...} -> 400 VALIDATION
export async function readJsonBody(req, limit = 100_000) {
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpProblem("PAYLOAD_TOO_LARGE", `The body is too big. The limit is ${limit} bytes.`);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new HttpProblem("PAYLOAD_TOO_LARGE", `The body is too big. The limit is ${limit} bytes.`);
    }
    chunks.push(chunk);
  }

  let text = Buffer.concat(chunks).toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // Windows editors sometimes add this
  if (text.trim() === "") return {};

  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new HttpProblem("UNSUPPORTED_MEDIA_TYPE", "Send the body as JSON with Content-Type: application/json.");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpProblem("BAD_REQUEST", "The body is not valid JSON.");
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpProblem("VALIDATION", "The body must be a JSON object, like { ... }.");
  }
  return data;
}
