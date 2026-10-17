import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isHiddenPath, isInsideRoot } from "../src/routes/static.js";

// The static file server has two safety checks that back each other up.
// Each one is tested on its own here, so neither can quietly stop working.

describe("safety check 1: hidden names", () => {
  test("a dot at the start of any part is hidden", () => {
    for (const bad of ["/.env", "/.git/config", "/docs/.secret", "/..", "/../x", "/a/../b", "/a/./b", "/...x"]) {
      assert.equal(isHiddenPath(bad), true, bad);
    }
  });

  test("backslashes count as slashes too (Windows)", () => {
    for (const bad of ["/..\\x", "/docs\\..\\..\\x", "\\.env", "/a\\.b"]) {
      assert.equal(isHiddenPath(bad), true, bad);
    }
  });

  test("normal names are fine, including a dot in the middle or end", () => {
    for (const ok of ["/", "/index.html", "/docs/guide.html", "/css/app.min.css", "/a/b/c.txt", "/file."]) {
      assert.equal(isHiddenPath(ok), false, ok);
    }
  });
});

describe("safety check 2: stay inside the public folder", () => {
  const root = path.resolve("/srv/site");

  test("a file inside is allowed", () => {
    assert.equal(isInsideRoot(root, path.resolve(root, "./index.html")), true);
    assert.equal(isInsideRoot(root, path.resolve(root, "./docs/a/b.txt")), true);
  });

  test("the folder itself is not a file, so it is not allowed", () => {
    assert.equal(isInsideRoot(root, root), false);
  });

  test("a file outside is refused, however it was reached", () => {
    assert.equal(isInsideRoot(root, path.resolve(root, "./../outside.txt")), false);
    assert.equal(isInsideRoot(root, path.resolve(root, "./docs/../../outside.txt")), false);
    assert.equal(isInsideRoot(root, path.resolve("/etc/passwd")), false);
  });

  test("a folder that only STARTS with the same letters is not inside", () => {
    // /srv/site-evil/x.txt begins with "/srv/site" but is a different folder.
    assert.equal(isInsideRoot(root, path.resolve("/srv/site-evil/x.txt")), false);
  });
});
