import { DomainError } from '../domain/errors.js';

export class Router {
  #routes = [];

  add(method, path, handler) {
    if (typeof method !== 'string' || !method.trim() || typeof path !== 'string' || !path.startsWith('/')) {
      throw new TypeError('A route requires an HTTP method and an absolute path');
    }
    if (typeof handler !== 'function') throw new TypeError('A route handler must be a function');

    const segments = path.split('/').slice(1);
    this.#routes.push({ method: method.toUpperCase(), path, segments, handler });
    return this;
  }

  get(path, handler) {
    return this.add('GET', path, handler);
  }

  post(path, handler) {
    return this.add('POST', path, handler);
  }

  match(method, path) {
    const requestedSegments = path.split('/').slice(1);

    for (const route of this.#routes) {
      if (route.method !== method.toUpperCase() || route.segments.length !== requestedSegments.length) continue;

      const params = {};
      let matches = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const expected = route.segments[index];
        const actual = requestedSegments[index];
        if (expected.startsWith(':')) {
          if (!actual) {
            matches = false;
            break;
          }
          try {
            params[expected.slice(1)] = decodeURIComponent(actual);
          } catch {
            throw new DomainError('INVALID_PATH', 'The request path is invalid');
          }
        } else if (expected !== actual) {
          matches = false;
          break;
        }
      }
      if (matches) return { handler: route.handler, params };
    }
    return null;
  }
}
