import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Router } from './router.js';
import { DomainError } from '../domain/errors.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(
  new URL('../../public/', import.meta.url)
);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  res.end(JSON.stringify(data));
}

function errorResponse(res, statusCode, code, message) {
  sendJson(res, statusCode, {
    error: { code, message },
  });
}

function getStatusCode(error) {
  if (error instanceof DomainError) {
    if (error.code === 'NOT_FOUND') return 404;

    if (
      error.code === 'VALIDATION' ||
      error.code === 'INVALID_TRANSITION'
    ) {
      return 400;
    }
  }

  return 500;
}

async function readJsonBody(req) {
  if (!req.headers['content-type']?.includes('application/json')) {
    return undefined;
  }

  let raw = '';

  for await (const chunk of req) {
    raw += chunk;

    if (raw.length > 1024 * 1024) {
      const error = new Error('Request body is too large');
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
  }

  if (!raw.trim()) return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Request body must contain valid JSON');
    error.code = 'INVALID_JSON';
    throw error;
  }
}

async function serveStaticFile(req, res, pathname, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    errorResponse(res, 400, 'INVALID_PATH', 'Invalid file path');
    return true;
  }

  if (decodedPath.includes('\0')) {
    errorResponse(res, 400, 'INVALID_PATH', 'Invalid file path');
    return true;
  }

  if (decodedPath === '/') {
    decodedPath = '/index.html';
  }

  try {
    const root = await realpath(publicDir);
    const target = path.resolve(root, `.${decodedPath}`);
    const relativePath = path.relative(root, target);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      errorResponse(res, 403, 'FORBIDDEN', 'Access denied');
      return true;
    }

    const actualPath = await realpath(target);
    const actualRelative = path.relative(root, actualPath);

    if (
      actualRelative === '..' ||
      actualRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(actualRelative)
    ) {
      errorResponse(res, 403, 'FORBIDDEN', 'Access denied');
      return true;
    }

    const content = await readFile(actualPath);
    const extension = path.extname(actualPath).toLowerCase();

    res.writeHead(200, {
      'Content-Type':
        CONTENT_TYPES[extension] || 'application/octet-stream',
    });

    res.end(req.method === 'HEAD' ? undefined : content);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return false;
    }

    throw error;
  }
}

export function createApp({
  router = new Router(),
  publicDir = DEFAULT_PUBLIC_DIR,
} = {}) {
  router.get('/health', () => ({ status: 'ok' }));

  return createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url,
        `http://${req.headers.host || 'localhost'}`
      );

      if (url.pathname.startsWith('/api') || url.pathname === '/health') {
        let body;

        try {
          body = await readJsonBody(req);
        } catch (error) {
          if (error.code === 'INVALID_JSON') {
            errorResponse(res, 400, 'INVALID_JSON', error.message);
            return;
          }

          if (error.code === 'BODY_TOO_LARGE') {
            errorResponse(res, 413, 'BODY_TOO_LARGE', error.message);
            return;
          }

          throw error;
        }

        const match = router.match(req.method, url.pathname);

        if (!match) {
          errorResponse(res, 404, 'NOT_FOUND', 'API route not found');
          return;
        }

        const result = await match.handler({
          req,
          params: match.params,
          query: url.searchParams,
          body,
        });

        sendJson(res, 200, result ?? {});
        return;
      }

      const served = await serveStaticFile(
        req,
        res,
        url.pathname,
        publicDir
      );

      if (!served) {
        errorResponse(res, 404, 'NOT_FOUND', 'Resource not found');
      }
    } catch (error) {
      const statusCode = getStatusCode(error);

      if (statusCode === 500) {
        console.error('Internal server error:', error);
      }

      errorResponse(
        res,
        statusCode,
        statusCode === 500 ? 'INTERNAL_ERROR' : error.code,
        statusCode === 500 ? 'An unexpected error occurred' : error.message
      );
    }
  });
}