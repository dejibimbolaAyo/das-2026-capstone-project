// A small HTTP router supporting methods and dynamic route parameters.

export class Router {
  constructor() {
    this.routes = [];
  }

  // Register a route.
  add(method, path, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Route handler must be a function');
    }

    this.routes.push({
      method: method.toUpperCase(),
      path,
      segments: this.#splitPath(path),
      handler,
    });

    return this;
  }

  // Convenience methods for common HTTP methods.
  get(path, handler) {
    return this.add('GET', path, handler);
  }

  post(path, handler) {
    return this.add('POST', path, handler);
  }

  put(path, handler) {
    return this.add('PUT', path, handler);
  }

  patch(path, handler) {
    return this.add('PATCH', path, handler);
  }

  delete(path, handler) {
    return this.add('DELETE', path, handler);
  }

  // Find a matching route and extract its parameters.
  match(method, pathname) {
    const requestSegments = this.#splitPath(pathname);

    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;

      if (route.segments.length !== requestSegments.length) continue;

      const params = {};
      let matched = true;

      for (let index = 0; index < route.segments.length; index += 1) {
        const expected = route.segments[index];
        const actual = requestSegments[index];

        if (expected.startsWith(':')) {
          try {
            const key = expected.slice(1);
            params[key] = decodeURIComponent(actual);
          } catch {
            matched = false;
            break;
          }
        } else if (expected !== actual) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return {
          handler: route.handler,
          params,
        };
      }
    }

    return undefined;
  }

  // Split a path into individual segments.
  #splitPath(path) {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new TypeError('Route path must start with /');
    }

    if (path === '/') return [];

    return path.replace(/\/+$/, '').slice(1).split('/');
  }
}