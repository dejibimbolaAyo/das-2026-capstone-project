import { handleHealth } from "./health.js";
import { createStaticHandler } from "./static.js";
import { createApiHandler } from "./api.js";
import { sendError } from "./respond.js";

// ROUTES layer: look at the address and the method, then hand over to the right handler.
// Rules of thumb for this layer: no business rules here, and no storage here.
export function createRouter({ publicDir, services }) {
  const serveStatic = createStaticHandler(publicDir);
  const handleApi = createApiHandler({ services });

  return async function route(req, res) {
    if (typeof req.url !== "string" || !req.url.startsWith("/") || req.url.startsWith("//")) {
      return sendError(req, res, 400, "BAD_REQUEST", "That address is not valid.");
    }

    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return sendError(req, res, 400, "BAD_REQUEST", "That address is not valid.");
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(req, res, url);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendError(req, res, 405, "METHOD_NOT_ALLOWED", "Only GET and HEAD are allowed here.", {
        Allow: "GET, HEAD",
      });
    }

    if (url.pathname === "/health") return handleHealth(req, res);
    return serveStatic(req, res, url.pathname);
  };
}
