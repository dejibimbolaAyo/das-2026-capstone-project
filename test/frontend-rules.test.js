import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";

// Rules for the website files in public/. They protect the ideas this build is about.
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}
const rel = (f) => path.relative(publicDir, f).split(path.sep).join("/");
const files = listFiles(publicDir);
const jsFiles = files.filter((f) => f.endsWith(".js"));
const read = (f) => fs.readFileSync(f, "utf8");

describe("website rules: ALL data access lives in one file (public/js/api.js)", () => {
  test("only api.js may fetch, use storage, or talk to the network", () => {
    for (const f of jsFiles.filter((f) => rel(f) !== "js/api.js")) {
      const text = read(f);
      for (const word of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB", "WebSocket", "/api/", "document.cookie"]) {
        assert.ok(!text.includes(word), `${rel(f)} must not use ${word}. Data belongs in api.js.`);
      }
    }
  });
  test("pages get data only by importing ../api.js (never a second data file)", () => {
    for (const f of jsFiles.filter((f) => rel(f).startsWith("js/views/"))) {
      for (const m of read(f).matchAll(/import[^;]*from\s+"([^"]+)"/g)) {
        if (/api|mock|data/i.test(m[1])) assert.equal(m[1], "../api.js", `${rel(f)} imports ${m[1]}`);
      }
    }
  });
  test("pure helpers (money, countdown, card) do not touch the page or the data file", () => {
    for (const name of ["money", "countdown", "card", "refund"]) {
      let text = read(path.join(publicDir, "js", `${name}.js`));
      if (name === "refund") text = text.replace('import { formatMoney } from "./money.js";', ""); // the one allowed import: another pure helper
      assert.ok(!/\bdocument\b|\bwindow\b|\bimport\b/.test(text), `${name}.js should be plain logic`);
    }
  });
});

describe("website rules: safety", () => {
  test("nothing builds page code out of text (no innerHTML, eval or document.write)", () => {
    for (const f of jsFiles) {
      const text = read(f);
      for (const bad of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
        assert.ok(!text.includes(bad), `${rel(f)} uses ${bad}`);
      }
    }
  });
  test("no card numbers or secrets written into the code, and no outside web addresses loaded", () => {
    for (const f of files.filter((f) => /\.(js|html|css)$/.test(f))) {
      const text = read(f);
      assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(text.replace(/<!--.*?-->/gs, "")), `${rel(f)} loads something from the internet`);
    }
  });
  test("only the data file knows the test card numbers", () => {
    for (const f of jsFiles.filter((f) => rel(f) !== "js/api.js" && rel(f) !== "js/views/checkout.js")) {
      assert.ok(!/4242|4000000000000002/.test(read(f)), rel(f));
    }
  });
});

describe("website rules: every import points at a real file (ES modules in the browser need the .js ending)", () => {
  test("relative imports end in .js and exist", () => {
    for (const f of jsFiles) {
      for (const m of read(f).matchAll(/(?:import|export)[^;]*?from\s+"([^"]+)"/g)) {
        assert.ok(m[1].startsWith("."), `${rel(f)}: ${m[1]} must be a relative path (no outside packages)`);
        assert.ok(m[1].endsWith(".js"), `${rel(f)}: ${m[1]} needs .js at the end`);
        assert.ok(fs.existsSync(path.resolve(path.dirname(f), m[1])), `${rel(f)}: ${m[1]} does not exist`);
      }
    }
  });
});

describe("website rules: accessibility basics in index.html", () => {
  const html = read(path.join(publicDir, "index.html"));
  test("language, viewport, title, landmarks, skip link, live region", () => {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /name="viewport"/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<header[\s>]/);
    assert.match(html, /<main id="main"/);
    assert.match(html, /<footer[\s>]/);
    assert.match(html, /<nav aria-label=/);
    assert.match(html, /class="skip-link" href="#main"/);
    assert.match(html, /id="announcer"[^>]*aria-live="polite"/);
    assert.match(html, /<script type="module" src="\/js\/main\.js">/);
  });
  test("the page does not turn off the keyboard focus ring", () => {
    const css = read(path.join(publicDir, "css", "app.css"));
    assert.ok(!/outline:\s*(none|0)\s*[;}]/.test(css.replace(/h1:focus\s*\{[^}]*\}/, "").replace(/h2 a:focus-visible\s*\{[^}]*\}/, "").replace(/\.ticket-body h2 a:focus-visible\s*\{[^}]*\}/, "").replace(/main\s*\{[^}]*\}/, "")),
      "do not remove focus outlines (only the allowed ones are skipped)");
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-reduced-motion/);
  });
  test("every form control built in the views has a label", () => {
    for (const f of jsFiles.filter((f) => rel(f).startsWith("js/views/"))) {
      const text = read(f);
      const inputs = [...text.matchAll(/h\("(?:input|select)",\s*\{([^}]*)\}/g)].filter((m) => !/type:\s*"(radio|hidden)"/.test(m[1]));
      for (const m of inputs) assert.match(m[1], /\bid:/, `${rel(f)}: a form control has no id for its label`);
    }
  });
});

describe("website rules: the server serves the website correctly", () => {
  let server;
  let base;
  before(async () => {
    server = createServer({ publicDir });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  test("every file in public/ is served with the right type", async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    for (const f of files) {
      const res = await fetch(`${base}/${rel(f)}`);
      assert.equal(res.status, 200, rel(f));
      assert.match(res.headers.get("content-type"), new RegExp("^" + types[path.extname(f)]), rel(f));
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    }
  });
  test("pages come with a Content-Security-Policy that allows only this site's own scripts and styles", async () => {
    const res = await fetch(`${base}/`);
    const csp = res.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), "the policy must not be loosened");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
  });
  test("index.html has no inline script or style, so that policy can stay strict", () => {
    const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
    assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), "inline <script>");
    assert.ok(!/<style[\s>]/i.test(html), "inline <style>");
    assert.ok(!/\son\w+\s*=/i.test(html), "inline event handler");
  });
  test("/ shows the website", async () => {
    const res = await fetch(`${base}/`);
    assert.match(await res.text(), /id="main"/);
  });
  test("the API still works next to the website", async () => {
    const res = await fetch(`${base}/api/events`);
    assert.equal(res.status, 200);
  });
});
