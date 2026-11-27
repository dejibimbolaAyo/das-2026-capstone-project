export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, path, handler) {
    const normalizedMethod = method.toUpperCase();
    const paramNames = [];
    const pattern = path
      .split('/')
      .map((segment) => {
        const colonMatch = /^:([A-Za-z_][A-Za-z0-9_]*)$/.exec(segment);
        if (colonMatch) {
          paramNames.push(colonMatch[1]);
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({
      method: normalizedMethod,
      path,
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      handler,
    });
    return this;
  }

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

  match(method, path) {
    const normalizedMethod = method.toUpperCase();
    for (const route of this.routes) {
      if (route.method !== normalizedMethod) continue;
      const match = route.pattern.exec(path);
      if (!match) continue;
      const params = {};
      route.paramNames.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1]);
      });
      return { params, handler: route.handler, route };
    }
    return undefined;
  }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const matched = this.match(req.method || 'GET', url.pathname);
    if (!matched) return false;
    await matched.handler(req, res, matched.params);
    return true;
  }
}

export function createRouter() {
  return new Router();
}

export default Router;
