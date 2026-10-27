import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DomainError } from '../domain/errors.js';
import { Router } from './router.js';

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public/', import.meta.url));
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendError(response, status, code, message) {
  sendJson(response, status, { error: { code, message } });
}

async function readJsonBody(request) {
  const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return undefined;

  let text = '';
  for await (const chunk of request) text += chunk;
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    throw new DomainError('INVALID_JSON', 'Request body must contain valid JSON');
  }
}

async function servePublicFile(response, pathname, publicDirectory, method) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, 'INVALID_PATH', 'The request path is invalid');
    return;
  }

  const root = resolve(publicDirectory);
  const requestedPath = resolve(root, `.${decodedPath === '/' ? '/index.html' : decodedPath}`);
  const relativePath = relative(root, requestedPath);
  if (isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    sendError(response, 404, 'NOT_FOUND', 'File not found');
    return;
  }

  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(requestedPath)]);
    const actualRelativePath = relative(realRoot, realFile);
    if (
      isAbsolute(actualRelativePath) ||
      actualRelativePath === '..' ||
      actualRelativePath.startsWith(`..${sep}`)
    ) {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }

    const fileStats = await stat(realFile);
    if (!fileStats.isFile()) {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }
    response.writeHead(200, {
      'content-length': fileStats.size,
      'content-type': CONTENT_TYPES[extname(realFile).toLowerCase()] ?? 'application/octet-stream',
    });
    if (method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(realFile);
    stream.on('error', () => {
      if (response.headersSent) response.destroy();
      else sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    });
    stream.pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      sendError(response, 404, 'NOT_FOUND', 'File not found');
      return;
    }
    throw error;
  }
}

export function createAppServer({ router = new Router(), publicDirectory = DEFAULT_PUBLIC_DIRECTORY } = {}) {
  if (!router.match('GET', '/health')) {
    router.get('/health', () => ({ status: 200, body: { status: 'ok' } }));
  }

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const route = router.match(request.method ?? 'GET', url.pathname);
      const body = await readJsonBody(request);

      if (route) {
        const result = await route.handler({ request, params: route.params, body });
        sendJson(response, result?.status ?? 200, result?.body ?? result ?? null);
      } else if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        sendError(response, 404, 'NOT_FOUND', 'API route not found');
      } else if (request.method === 'GET' || request.method === 'HEAD') {
        await servePublicFile(response, url.pathname, publicDirectory, request.method);
      } else {
        sendError(response, 404, 'NOT_FOUND', 'Route not found');
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      if (error instanceof DomainError) {
        sendError(response, 400, error.code, error.message);
        return;
      }
      sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    }
  });
}
