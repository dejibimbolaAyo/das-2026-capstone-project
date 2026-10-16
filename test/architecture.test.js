import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// These tests READ the source files and check the layered design from docs/architecture.md.
// If someone breaks the layering, a test fails and names the file.
//
//   rules     src/*.js            the business rules. They import only other rules.
//   data      src/data/*.js       keeping things. Imports rules.
//   services  src/services/*.js   things a person does. Imports rules (the store is passed in).
//   routes    src/routes/*.js     HTTP. Imports other routes and services (never rules or data).
//   server    src/server.js       wires the layers together.

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const ALLOWED = {
  rules: ["rules"],
  data: ["rules", "data"],
  services: ["rules", "services"],
  routes: ["routes", "services"],
  server: ["routes", "services", "data", "rules", "server"],
};

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

function layerOf(file) {
  const parts = path.relative(SRC, file).split(path.sep);
    if (parts.length > 1) return parts[0] === "domain" ? "rules" : parts[0]; // routes, services, data (domain counts as rules)
  return parts[0] === "server.js" ? "server" : "rules";
}

// Every "from '...'" and "import('...')" in a file.
function importsOf(file) {
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

// Pure checker: give it a list of { file, layer, imports }, get back the broken rules.
function findViolations(modules) {
  const problems = [];
  for (const mod of modules) {
    for (const spec of mod.imports) {
      if (spec.startsWith("node:")) continue;
      if (!spec.startsWith(".")) {
        problems.push(`${mod.file} imports "${spec}", which is an outside package`);
        continue;
      }
      const target = path.resolve(path.dirname(mod.abs), spec);
      const targetLayer = layerOf(target);
      if (!ALLOWED[mod.layer].includes(targetLayer)) {
        problems.push(`${mod.file} (${mod.layer}) must not import ${spec} (${targetLayer})`);
      }
    }
  }
  return problems;
}

const modules = listJsFiles(SRC).map((abs) => ({
  file: path.relative(SRC, abs).split(path.sep).join("/"),
  abs,
  layer: layerOf(abs),
  imports: importsOf(abs),
}));

describe("architecture: the layers", () => {
  test("every layer has files in it", () => {
    for (const layer of ["rules", "data", "services", "routes", "server"]) {
      assert.ok(modules.some((m) => m.layer === layer), `no files in the ${layer} layer`);
    }
  });

  test("no file breaks the layering rules", () => {
    assert.deepEqual(findViolations(modules), []);
  });

  for (const layer of Object.keys(ALLOWED)) {
    test(`${layer} layer only imports from: ${ALLOWED[layer].join(", ")}`, () => {
      const mine = modules.filter((m) => m.layer === layer);
      assert.deepEqual(findViolations(mine), []);
    });
  }

  test("no outside packages: only this project's files and node: built-ins", () => {
    const outsiders = modules.flatMap((m) =>
      m.imports.filter((spec) => !spec.startsWith(".") && !spec.startsWith("node:"))
    );
    assert.deepEqual(outsiders, []);
  });
});

describe("architecture: the checker really catches mistakes", () => {
  const fake = (rel, layer, imports) => ({ file: rel, abs: path.join(SRC, rel), layer, imports });

  test("a route that reaches into the data layer is caught", () => {
    const bad = [fake("routes/bad.js", "routes", ["../data/memoryStore.js"])];
    assert.equal(findViolations(bad).length, 1);
  });

  test("a route that imports a rule directly is caught (it must go through a service)", () => {
    const bad = [fake("routes/bad.js", "routes", ["../events.js"])];
    assert.equal(findViolations(bad).length, 1);
  });

  test("a route may import a service", () => {
    const fine = [fake("routes/ok.js", "routes", ["../services/errors.js"])];
    assert.deepEqual(findViolations(fine), []);
  });

  test("a rule that reaches up into a service is caught", () => {
    const bad = [fake("events.js", "rules", ["./services/eventService.js"])];
    assert.equal(findViolations(bad).length, 1);
  });

  test("a service that reaches into a route or the data layer is caught", () => {
    const bad = [
      fake("services/a.js", "services", ["../routes/health.js"]),
      fake("services/b.js", "services", ["../data/memoryStore.js"]),
    ];
    assert.equal(findViolations(bad).length, 2);
  });

  test("an outside package is caught", () => {
    const bad = [fake("routes/a.js", "routes", ["express"])];
    assert.equal(findViolations(bad).length, 1);
  });

  test("allowed imports are not flagged", () => {
    const fine = [
      fake("routes/a.js", "routes", ["./respond.js", "node:http"]),
      fake("services/a.js", "services", ["../events.js"]),
    ];
    assert.deepEqual(findViolations(fine), []);
  });
});
