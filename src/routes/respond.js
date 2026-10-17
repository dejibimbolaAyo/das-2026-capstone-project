// ROUTES layer helpers: every reply is built here, so replies always look the same.
// Errors always have this shape:  { "error": { "code": "...", "message": "..." } }

export function sendJson(req, res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

export function sendError(req, res, status, code, message, extraHeaders = {}) {
  sendJson(req, res, status, { error: { code, message } }, extraHeaders);
}
