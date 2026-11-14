import { DomainError } from "../domain/errors.js";

function normalizePath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new DomainError("VALIDATION", "A route path must be an absolute path without a query or fragment.");
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

export class Router {
  #routes = [];

  add(method, path, handler) {
    const normalizedMethod = typeof method === "string" ? method.toUpperCase() : "";
    if (!/^[A-Z]+$/.test(normalizedMethod)) {
      throw new DomainError("VALIDATION", "A route method is required.");
    }
    if (typeof handler !== "function") {
      throw new DomainError("VALIDATION", "A route handler must be a function.");
    }

    const normalizedPath = normalizePath(path);
    const segments = normalizedPath === "/" ? [] : normalizedPath.slice(1).split("/");
    const paramNames = new Set();
    const parts = segments.map((segment) => {
      if (!segment.startsWith(":")) {
        return { value: segment };
      }

      const name = segment.slice(1);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || paramNames.has(name)) {
        throw new DomainError("VALIDATION", "Route parameter names must be unique valid identifiers.");
      }
      paramNames.add(name);
      return { name };
    });

    if (this.#routes.some((route) => route.method === normalizedMethod && route.path === normalizedPath)) {
      throw new DomainError("CONFLICT", `Route ${normalizedMethod} ${normalizedPath} is already registered.`);
    }

    this.#routes.push({ method: normalizedMethod, path: normalizedPath, parts, handler });
    return this;
  }

  get(path, handler) {
    return this.add("GET", path, handler);
  }

  match(method, path) {
    if (typeof method !== "string" || typeof path !== "string") {
      return undefined;
    }

    const normalizedMethod = method.toUpperCase();
    const url = new URL(path, "http://router.local");
    const normalizedPath = normalizePath(url.pathname);
    const segments = normalizedPath === "/" ? [] : normalizedPath.slice(1).split("/");

    for (const route of this.#routes) {
      if (route.method !== normalizedMethod || route.parts.length !== segments.length) {
        continue;
      }

      const params = {};
      let matches = true;
      for (let index = 0; index < segments.length; index += 1) {
        const part = route.parts[index];
        if (part.name) {
          params[part.name] = decodeURIComponent(segments[index]);
        } else if (part.value !== segments[index]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return { handler: route.handler, params };
      }
    }
    return undefined;
  }
}

export function createRouter() {
  return new Router();
}
