import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";

const realPublicDir = fileURLToPath(new URL("../public", import.meta.url));

// ---- small helpers: start a server on a free port, make one request, stop it ----
function listen(publicDir) {
  const server = createServer({ publicDir });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function stop(server) {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
}

// rawPath is sent exactly as written (no tidying up), so we can try sneaky addresses.
function request(server, rawPath, method = "GET") {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: rawPath, method, agent: false, headers: { Connection: "close" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function assertErrorShape(res, status, code) {
  assert.equal(res.status, status);
  assert.match(res.headers["content-type"], /^application\/json/);
  const data = JSON.parse(res.body);
  assert.deepEqual(Object.keys(data), ["error"]);
  assert.deepEqual(Object.keys(data.error).sort(), ["code", "message"]);
  assert.equal(data.error.code, code);
  assert.equal(typeof data.error.message, "string");
}

describe("server: /health", () => {
  let server;
  before(async () => (server = await listen(realPublicDir)));
  after(() => stop(server));

  test("GET /health answers 200 with {status: ok}", async () => {
    const res = await request(server, "/health");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^application\/json/);
    assert.deepEqual(JSON.parse(res.body), { status: "ok" });
  });

  test("a query string does not break it", async () => {
    const res = await request(server, "/health?check=1");
    assert.equal(res.status, 200);
  });

  test("HEAD /health answers 200 with no body", async () => {
    const res = await request(server, "/health", "HEAD");
    assert.equal(res.status, 200);
    assert.equal(res.body, "");
    assert.equal(res.headers["content-length"], String(Buffer.byteLength('{"status":"ok"}')));
  });

  test("the real public/index.html is served at / and links to /health", async () => {
    const res = await request(server, "/");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^text\/html/);
    assert.match(res.body, /Event Ticketing/);
    assert.match(res.body, /href="\/health"/);
  });
});

describe("server: static files", () => {
  let server;
  let tmp;

  before(async () => {
    // parent/
    //   outside.txt          <- a secret OUTSIDE the public folder
    //   public/
    //     index.html  app.css  app.js  data.json  notes.xyz  .env
    //     docs/index.html
    //     empty/
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "static-test-"));
    const pub = path.join(tmp, "public");
    fs.mkdirSync(path.join(pub, "docs"), { recursive: true });
    fs.mkdirSync(path.join(pub, "empty"));
    fs.writeFileSync(path.join(tmp, "outside.txt"), "SECRET");
    fs.writeFileSync(path.join(pub, "index.html"), "<h1>home</h1>");
    fs.writeFileSync(path.join(pub, "app.css"), "body{}");
    fs.writeFileSync(path.join(pub, "app.js"), "console.log(1)");
    fs.writeFileSync(path.join(pub, "data.json"), '{"a":1}');
    fs.writeFileSync(path.join(pub, "notes.xyz"), "unknown type");
    fs.writeFileSync(path.join(pub, ".env"), "PASSWORD=hunter2");
    fs.writeFileSync(path.join(pub, "docs", "index.html"), "<h1>docs</h1>");
    server = await listen(pub);
  });

  after(async () => {
    await stop(server);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("/ serves index.html", async () => {
    const res = await request(server, "/");
    assert.equal(res.status, 200);
    assert.equal(res.body, "<h1>home</h1>");
    assert.match(res.headers["content-type"], /^text\/html/);
  });

  test("files get the right content type", async () => {
    const types = {
      "/app.css": /^text\/css/,
      "/app.js": /^text\/javascript/,
      "/data.json": /^application\/json/,
      "/notes.xyz": /^application\/octet-stream/,
    };
    for (const [url, pattern] of Object.entries(types)) {
      const res = await request(server, url);
      assert.equal(res.status, 200, url);
      assert.match(res.headers["content-type"], pattern, url);
      assert.equal(res.headers["x-content-type-options"], "nosniff", url);
    }
  });

  test("/docs/ serves the index.html inside that folder", async () => {
    const res = await request(server, "/docs/");
    assert.equal(res.status, 200);
    assert.equal(res.body, "<h1>docs</h1>");
  });

  test("HEAD sends headers and the right length, but no body", async () => {
    const res = await request(server, "/app.css", "HEAD");
    assert.equal(res.status, 200);
    assert.equal(res.body, "");
    assert.equal(res.headers["content-length"], "6");
  });

  test("a missing file is 404 in the standard error shape", async () => {
    assertErrorShape(await request(server, "/nope.html"), 404, "NOT_FOUND");
  });

  test("a folder with no index.html is 404, and so is a folder without the slash", async () => {
    assertErrorShape(await request(server, "/empty/"), 404, "NOT_FOUND");
    assertErrorShape(await request(server, "/docs"), 404, "NOT_FOUND");
  });

  test("hidden files (starting with a dot) are never served", async () => {
    const res = await request(server, "/.env");
    assertErrorShape(res, 404, "NOT_FOUND");
    assert.ok(!res.body.includes("hunter2"));
  });

  test("addresses that try to climb out of the public folder are refused", async () => {
    const attempts = [
      "/../outside.txt",
      "/%2e%2e/outside.txt",
      "/..%2foutside.txt",
      "/%2e%2e%2foutside.txt",
      "/docs/../../outside.txt",
      "/docs/%2e%2e/%2e%2e/outside.txt",
      "/..\\outside.txt",
      "/....//outside.txt",
    ];
    for (const attempt of attempts) {
      const res = await request(server, attempt);
      assert.ok(!res.body.includes("SECRET"), `leaked through ${attempt}`);
      assert.notEqual(res.status, 200, attempt);
    }
  });

  test("badly written addresses are 400, not a crash", async () => {
    assertErrorShape(await request(server, "/%E0%A4%A"), 400, "BAD_REQUEST");
    assertErrorShape(await request(server, "/a%00b"), 400, "BAD_REQUEST");
  });

  test("the server keeps working after bad requests", async () => {
    await request(server, "/%E0%A4%A");
    await request(server, "/../outside.txt");
    const res = await request(server, "/health");
    assert.equal(res.status, 200);
  });
});

describe("server: methods and error shape", () => {
  let server;
  before(async () => (server = await listen(realPublicDir)));
  after(() => stop(server));

  test("POST, PUT, PATCH and DELETE are 405 and say which methods are allowed", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await request(server, "/health", method);
      assertErrorShape(res, 405, "METHOD_NOT_ALLOWED");
      assert.equal(res.headers.allow, "GET, HEAD", method);
    }
  });

  test("every kind of error comes back in the same shape", async () => {
    assertErrorShape(await request(server, "/missing"), 404, "NOT_FOUND");
    assertErrorShape(await request(server, "/health", "POST"), 405, "METHOD_NOT_ALLOWED");
    assertErrorShape(await request(server, "/%E0%A4%A"), 400, "BAD_REQUEST");
  });
});
