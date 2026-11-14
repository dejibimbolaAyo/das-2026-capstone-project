import { createServer } from "node:http";
import { realpath, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DomainError } from "../domain/errors.js";
import { createRouter } from "./router.js";

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const MAX_JSON_BYTES = 1024 * 1024;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(response, statusCode, value, headOnly = false) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
  });
  response.end(headOnly ? undefined : body);
}

function sendError(response, statusCode, code, message, headOnly = false) {
  sendJson(response, statusCode, { error: { code, message } }, headOnly);
}

function statusForCode(code) {
  if (code === "VALIDATION" || code === "INVALID_JSON" || code === "BAD_REQUEST") {
    return 400;
  }
  if (code === "NOT_FOUND") {
    return 404;
  }
  if (code === "CONFLICT" || code === "SOLD_OUT" || code === "INVALID_STATE" || code === "INVALID_TRANSITION") {
    return 409;
  }
  if (code === "PAYLOAD_TOO_LARGE") {
    return 413;
  }
  return 500;
}

async function readJsonBody(request) {
  const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    request.resume();
    return undefined;
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_JSON_BYTES) {
      throw new DomainError("PAYLOAD_TOO_LARGE", "The request body is too large.");
    }
    chunks.push(chunk);
  }

  if (bytes === 0) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("INVALID_JSON", "The request body must contain valid JSON.");
  }
}

function isWithinDirectory(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

async function serveStaticFile(request, response, pathname, publicDir) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "METHOD_NOT_ALLOWED", "This method is not supported for static files.");
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, "BAD_REQUEST", "The request path is not valid.");
    return;
  }
  if (decodedPath.includes("\0")) {
    sendError(response, 400, "BAD_REQUEST", "The request path is not valid.");
    return;
  }

  try {
    const root = await realpath(publicDir);
    let filePath = resolve(root, `.${decodedPath}`);
    if (!isWithinDirectory(root, filePath)) {
      sendError(response, 404, "NOT_FOUND", "The requested resource was not found.", request.method === "HEAD");
      return;
    }

    filePath = await realpath(filePath);
    if (!isWithinDirectory(root, filePath)) {
      sendError(response, 404, "NOT_FOUND", "The requested resource was not found.", request.method === "HEAD");
      return;
    }

    let details = await stat(filePath);
    if (details.isDirectory()) {
      filePath = await realpath(resolve(filePath, "index.html"));
      if (!isWithinDirectory(root, filePath)) {
        sendError(response, 404, "NOT_FOUND", "The requested resource was not found.", request.method === "HEAD");
        return;
      }
      details = await stat(filePath);
    }
    if (!details.isFile()) {
      sendError(response, 404, "NOT_FOUND", "The requested resource was not found.", request.method === "HEAD");
      return;
    }

    const contents = await readFile(filePath);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "content-length": contents.length,
      "x-content-type-options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      sendError(response, 404, "NOT_FOUND", "The requested resource was not found.", request.method === "HEAD");
      return;
    }
    throw error;
  }
}

export function createApp({ publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  const router = createRouter();
  router.get("/health", () => ({ status: "ok" }));

  return createServer(async (request, response) => {
    const headOnly = request.method === "HEAD";
    try {
      const url = new URL(request.url, "http://localhost");
      const body = await readJsonBody(request);
      const route = router.match(request.method, url.pathname);
      if (route) {
        const result = await route.handler({
          request,
          params: route.params,
          url,
          body,
        });
        sendJson(response, 200, result ?? null, headOnly);
        return;
      }

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        request.resume();
        sendError(response, 404, "NOT_FOUND", "The requested API route was not found.", headOnly);
        return;
      }

      await serveStaticFile(request, response, url.pathname, publicDir);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof DomainError) {
        sendError(response, statusForCode(error.code), error.code, error.message, headOnly);
        return;
      }
      if (error instanceof URIError) {
        sendError(response, 400, "BAD_REQUEST", "The request path is not valid.", headOnly);
        return;
      }
      console.error("Unhandled HTTP request error:", error);
      sendError(response, 500, "INTERNAL_ERROR", "An internal server error occurred.", headOnly);
    }
  });
}
