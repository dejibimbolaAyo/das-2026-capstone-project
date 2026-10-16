import { sendJson } from "./respond.js";

// GET /health  ->  200 {"status":"ok"}
// Used to ask "is the server alive?".
export function handleHealth(req, res) {
  sendJson(req, res, 200, { status: "ok" });
}
