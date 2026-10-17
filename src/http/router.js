// Build 3: a tiny router. It matches an HTTP method plus a path, and supports
// :params in the path (for example /api/events/:id). It knows nothing about HTTP
// itself, so it is easy to test on its own.

function splitPath(path) {
  return String(path)
    .split('/')
    .filter((segment) => segment.length > 0);
}

function matchSegments(routeSegments, pathSegments) {
  if (routeSegments.length !== pathSegments.length) return null;

  const params = {};
  for (let i = 0; i < routeSegments.length; i += 1) {
    const routePart = routeSegments[i];
    const pathPart = pathSegments[i];

    if (routePart.startsWith(':')) {
      params[routePart.slice(1)] = decodeURIComponent(pathPart);
    } else if (routePart !== pathPart) {
      return null;
    }
  }
  return params;
}

export function createRouter() {
  const routes = [];

  function add(method, path, handler) {
    routes.push({ method: String(method).toUpperCase(), segments: splitPath(path), handler });
    return router;
  }

  function match(method, path) {
    const wanted = String(method).toUpperCase();
    const parts = splitPath(path);

    for (const route of routes) {
      if (route.method !== wanted) continue;
      const params = matchSegments(route.segments, parts);
      if (params) return { handler: route.handler, params };
    }
    return null;
  }

  const router = {
    add,
    match,
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),
    put: (path, handler) => add('PUT', path, handler),
    patch: (path, handler) => add('PATCH', path, handler),
    delete: (path, handler) => add('DELETE', path, handler),
  };
  return router;
}
