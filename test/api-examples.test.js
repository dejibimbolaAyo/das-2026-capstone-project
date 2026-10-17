import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "../src/server.js";
import { createMemoryStore } from "../src/data/memoryStore.js";
import { createSqliteStore } from "../src/data/sqliteStore.js";

// Replays EVERY curl example in docs/api-examples.md against a fresh test server,
// in order, and checks the status and the JSON answer match what the page says.
// If the code changes and the page is not updated, this test fails.

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const doc = fs.readFileSync(root + "docs/api-examples.md", "utf8");

// Split a command line into words. Double quotes keep words together.
function words(line) {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

// Each example is: ### title, a ``` curl command ```, "Expected: **NNN ...**", a ```json answer```.
const examples = [...doc.matchAll(/### (\d+)\. (.+?)\n([\s\S]*?)```\n(curl .+?)\n```\s+Expected: \*\*(\d{3}) [^*]+\*\*\s+```json\n([\s\S]+?)\n```/g)].map((m) => ({
  number: Number(m[1]),
  title: m[2],
  // "set ORG=" in the note means: the token in this answer is saved under the name ORG
  saveAs: /`set (\w+)=`/.exec(m[3])?.[1] ?? null,
  command: words(m[4]),
  status: Number(m[5]),
  json: JSON.parse(m[6]),
}));

// Tokens and times change every run, so the page shows "<token>" and "<time>".
// We check the real answer LOOKS right, then swap it for the placeholder before comparing.
function maskLikeThePage(actual, expected) {
  if (expected === "<token>" && typeof actual === "string" && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(actual)) return "<token>";
  if (expected === "<time>" && typeof actual === "string" && Math.abs(Date.parse(actual) - Date.now()) < 16 * 60_000) return "<time>";
  if (Array.isArray(actual) && Array.isArray(expected)) return actual.map((v, i) => maskLikeThePage(v, expected[i]));
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    return Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, maskLikeThePage(v, expected[k])]));
  }
  return actual;
}

test("the page has examples, numbered 1, 2, 3... with no gaps", () => {
  assert.ok(examples.length >= 30, `found only ${examples.length} examples`);
  examples.forEach((ex, i) => assert.equal(ex.number, i + 1));
  const headings = [...doc.matchAll(/^### \d+\./gm)].length;
  assert.equal(examples.length, headings, "an example heading could not be read");
});


// The page must be true on BOTH stores: in memory, and on a brand new SQLite database.
for (const [label, makeStore] of [
  ["memory", () => createMemoryStore()],
  ["SQLite", () => createSqliteStore(":memory:")],
]) {
  describe(`examples on the ${label} store`, () => {
    let server;
    let store;
    let base;
    before(async () => {
      store = makeStore();
      server = createServer({ publicDir, store, hashCost: { N: 1024, r: 8, p: 1 } });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    });

    // One test that runs them all in order (they depend on each other).
    test("every example in docs/api-examples.md gives the documented answer", async () => {
      const tokens = {}; // %ORG%, %ATT% ... in the page become the real tokens we were given
      for (const ex of examples) {
        const args = ex.command.slice(1).map((a) => a.replace(/%(\w+)%/g, (_, name) => tokens[name] ?? assert.fail(`example ${ex.number}: %${name}% was never saved`))); // drop the word "curl"
        let method = "GET";
        const headers = {};
        let body;
        let url;
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === "-X") method = args[++i];
          else if (a === "-H") {
            const [k, ...v] = args[++i].split(":");
            headers[k.trim()] = v.join(":").trim();
          } else if (a === "-d") {
            const target = args[++i];
            assert.ok(target.startsWith("@"), `example ${ex.number}: -d must point at a file`);
            body = fs.readFileSync(root + target.slice(1), "utf8");
          } else if (a.startsWith("http://localhost:3000")) url = a.replace("http://localhost:3000", base);
          else assert.fail(`example ${ex.number}: unknown curl word ${a}`);
        }
        assert.ok(url, `example ${ex.number}: no address`);

        // curl uses POST when there is a body and no -X; our commands always say -X.
        const res = await fetch(url, { method, headers, body });
        const actual = await res.json();
        if (ex.saveAs) tokens[ex.saveAs] = actual.token;
        const label = `example ${ex.number} (${ex.title})`;
        assert.equal(res.status, ex.status, `${label}: wrong status. Got ${JSON.stringify(actual)}`);
        assert.deepEqual(maskLikeThePage(actual, ex.json), ex.json, `${label}: the answer differs from the page`);
      }
    });

  });
}

test("the JSON body files the page uses all exist", () => {
  const files = [...doc.matchAll(/-d @(\S+?)(?:"|\s)/g)].map((m) => m[1].replace(/"$/, ""));
  assert.ok(files.length >= 5);
  for (const f of files) assert.ok(fs.existsSync(root + f), `${f} is missing`);
});

// bad-json.json is broken ON PURPOSE (example 22 tests the "broken JSON" error).
// Editors like VS Code show a red warning on it, and it is tempting to "fix" it. Don't.
test("bad-json.json is still broken on purpose, and every other body file is valid JSON", () => {
  const dir = root + "docs/api-examples/";
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const text = fs.readFileSync(dir + name, "utf8");
    let valid = true;
    try {
      JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      valid = false;
    }
    if (name === "bad-json.json") {
      assert.equal(valid, false, "docs/api-examples/bad-json.json must stay BROKEN. It was fixed by mistake. Undo your change to it: git checkout -- docs/api-examples/bad-json.json");
    } else {
      assert.equal(valid, true, `docs/api-examples/${name} must be valid JSON`);
    }
  }
});
