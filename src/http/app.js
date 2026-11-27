import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Router } from './router.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res, statusCode, code, message) {
  sendJson(res, statusCode, { error: { code, message } });
}

export async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  if (body.trim() === '') return {};
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { code: 'BAD_JSON', statusCode: 400 });
  }
}

export function createApp({ publicDir } = {}) {
  const rootDir = publicDir
    ? path.resolve(publicDir)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  const router = new Router();
  router.get('/health', (_req, res) => {
    sendJson(res, 200, { status: 'ok' });
  });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname.startsWith('/api')
        && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        try {
          req.body = await readJson(req);
        } catch {
          sendError(res, 400, 'BAD_JSON', 'Request body contains invalid JSON');
          return;
        }
      }

      if (await router.handle(req, res)) return;

      if (url.pathname.startsWith('/api')) {
        sendError(res, 404, 'NOT_FOUND', 'API route not found');
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        sendError(res, 400, 'BAD_REQUEST', 'Invalid URL path');
        return;
      }

      if (pathname.includes('\0')) {
        sendError(res, 400, 'BAD_REQUEST', 'Invalid URL path');
        return;
      }

      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(rootDir, relativePath);
      if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
        sendError(res, 403, 'FORBIDDEN', 'Path is outside the public folder');
        return;
      }

      try {
        const data = await fs.readFile(filePath);
        const extension = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
          'Content-Length': data.length,
        });
        res.end(data);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          sendError(res, 404, 'NOT_FOUND', 'File not found');
        } else {
          sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred');
        }
      }
    } catch {
      if (!res.headersSent) {
        sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred');
      } else {
        res.end();
      }
    }
  });
}

export default createApp;
