import fs from "node:fs/promises";
import path from "node:path";
import { sendError } from "./respond.js";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

// The browser is told: only run scripts and styles that come from THIS site, never load anything
// from other sites, and never let another site put this one inside a frame. If a bug ever let someone
// inject a <script> or a stolen link into a page, the browser itself would refuse to run or load it.
const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

// SAFETY CHECK 1: hidden names. Any part of the address that starts with a dot is refused.
// That covers .env, .git and also ".." (the "go up one folder" trick).
// Windows treats a backslash like a slash, so we split on both.
export function isHiddenPath(urlPath) {
  return urlPath.split(/[\\/]/).some((part) => part.startsWith("."));
}

// SAFETY CHECK 2: the real path must still be INSIDE the public folder.
// We add the separator so that "/site-evil/x" is not mistaken for being inside "/site".
export function isInsideRoot(root, filePath) {
  return filePath.startsWith(root + path.sep);
}

// Serves files from ONE folder (publicDir) and nothing outside it.
// The two safety checks above back each other up, so one mistake does not open the door.
export function createStaticHandler(publicDir) {
  const root = path.resolve(publicDir);

  return async function serveStatic(req, res, pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return sendError(req, res, 400, "BAD_REQUEST", "That address is not valid.");
    }
    if (decoded.includes("\0")) {
      return sendError(req, res, 400, "BAD_REQUEST", "That address is not valid.");
    }

    // "/" and "/folder/" mean index.html
    if (decoded.endsWith("/")) decoded += "index.html";

    // Safety check 1
    if (isHiddenPath(decoded)) {
      return sendError(req, res, 404, "NOT_FOUND", "Nothing here.");
    }

    // Safety check 2: work out the real path, then make sure it is still inside root.
    const filePath = path.resolve(root, "." + decoded);
    if (!isInsideRoot(root, filePath)) {
      return sendError(req, res, 404, "NOT_FOUND", "Nothing here.");
    }

    let data;
    try {
      const info = await fs.stat(filePath);
      if (!info.isFile()) return sendError(req, res, 404, "NOT_FOUND", "Nothing here.");
      data = await fs.readFile(filePath);
    } catch {
      return sendError(req, res, 404, "NOT_FOUND", "Nothing here.");
    }

    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": data.length,
      "X-Content-Type-Options": "nosniff",
      ...SECURITY_HEADERS,
    });
    res.end(req.method === "HEAD" ? undefined : data);
  };
}
