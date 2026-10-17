import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hashPassword, verifyPassword, checkSignup } from "../src/auth.js";
import { signToken, verifyToken } from "../src/tokens.js";

const SECRET = "a-secret-for-tests-only-123";
const CHEAP = { N: 1024, r: 8, p: 1 }; // fast settings, for the tests only

describe("password hashing", () => {
  test("the password is not in the hash, and the right password checks out", async () => {
    const hash = await hashPassword("correct horse battery", CHEAP);
    assert.match(hash, /^scrypt\$1024\$8\$1\$[\w-]+\$[\w-]+$/);
    assert.ok(!hash.includes("correct"));
    assert.equal(await verifyPassword("correct horse battery", hash), true);
    assert.equal(await verifyPassword("correct horse batterY", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });
  test("the same password gives a different hash each time (random salt)", async () => {
    const a = await hashPassword("same password", CHEAP);
    const b = await hashPassword("same password", CHEAP);
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same password", a), true);
    assert.equal(await verifyPassword("same password", b), true);
  });
  test("a damaged or foreign stored hash never verifies (and never crashes)", async () => {
    for (const bad of [undefined, null, "", "plain-text-password", "scrypt$1$2$3", "md5$a$b$c$d$e", "scrypt$x$8$1$AAAA$AAAA"]) {
      assert.equal(await verifyPassword("anything", bad), false, String(bad));
    }
  });
  test("the real default settings are strong (N is 16384 or more)", async () => {
    const hash = await hashPassword("x".repeat(8));
    assert.ok(Number(hash.split("$")[1]) >= 16384);
  });
});

describe("signup checks", () => {
  const good = { name: "  Ada  ", email: " Ada@Example.COM ", password: "longenough", role: "attendee" };
  test("a good signup is cleaned up: trimmed name, lower-case email", () => {
    assert.deepEqual(checkSignup(good), { name: "Ada", email: "ada@example.com", password: "longenough", role: "attendee" });
    assert.equal(checkSignup({ ...good, role: "organizer" }).role, "organizer");
  });
  test("each bad field is a VALIDATION problem", () => {
    for (const bad of [
      undefined, null, "text",
      { ...good, name: "" }, { ...good, name: "x".repeat(81) }, { ...good, name: 5 },
      { ...good, email: "" }, { ...good, email: "no-at-sign" }, { ...good, email: "a@b" }, { ...good, email: "a b@c.com" },
      { ...good, password: "short" }, { ...good, password: "x".repeat(129) }, { ...good, password: 12345678 },
      { ...good, role: "admin" }, { ...good, role: undefined },
    ]) {
      assert.throws(() => checkSignup(bad), { code: "VALIDATION" }, JSON.stringify(bad));
    }
  });
  test("nobody can sign up as staff", () => {
    assert.throws(() => checkSignup({ ...good, role: "staff" }), { code: "FORBIDDEN" });
  });
});

describe("signed tokens", () => {
  const now = Date.parse("2026-10-15T10:00:00Z");
  const token = () => signToken({ sub: "U-000001", role: "attendee" }, SECRET, { now });

  test("a token has three parts and carries who, when made and when it ends", () => {
    assert.equal(token().split(".").length, 3);
    const claims = verifyToken(token(), SECRET, { now });
    assert.equal(claims.sub, "U-000001");
    assert.equal(claims.exp - claims.iat, 7200);
  });
  test("no password or secret is inside a token", () => {
    const payload = Buffer.from(token().split(".")[1], "base64url").toString();
    assert.ok(!payload.includes(SECRET));
    assert.deepEqual(Object.keys(JSON.parse(payload)).sort(), ["exp", "iat", "role", "sub"]);
  });
  test("a changed payload is refused (an attendee cannot turn themselves into an organizer)", () => {
    const [h, , s] = token().split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "U-000001", role: "organizer", iat: 1, exp: 99999999999 })).toString("base64url");
    assert.throws(() => verifyToken(`${h}.${forged}.${s}`, SECRET, { now }), { code: "UNAUTHENTICATED" });
  });
  test("a token signed with another secret is refused", () => {
    assert.throws(() => verifyToken(token(), "another-secret-1234567", { now }), { code: "UNAUTHENTICATED" });
  });
  test("an expired token is refused, and says so", () => {
    assert.equal(verifyToken(token(), SECRET, { now: now + 7199_000 }).sub, "U-000001");
    assert.throws(() => verifyToken(token(), SECRET, { now: now + 7200_000 }), { code: "UNAUTHENTICATED", message: /expired/ });
  });
  test('the "alg: none" trick is refused', () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "U-000001", exp: 99999999999 })).toString("base64url");
    assert.throws(() => verifyToken(`${header}.${payload}.`, SECRET, { now }), { code: "UNAUTHENTICATED" });
    assert.throws(() => verifyToken(`${header}.${payload}.x`, SECRET, { now }), { code: "UNAUTHENTICATED" });
  });
  test('a token with a CORRECT signature but "alg: none" in its header is still refused', () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "U-000001", exp: 99999999999 })).toString("base64url");
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    assert.throws(() => verifyToken(`${header}.${payload}.${signature}`, SECRET, { now }), { code: "UNAUTHENTICATED" });
  });
  test("garbage never crashes: every bad token is UNAUTHENTICATED", () => {
    for (const bad of [undefined, null, 5, "", "abc", "a.b", "a.b.c.d", "...", "x".repeat(2001), "{}.{}.{}", token().slice(0, -3), token() + "x"]) {
      assert.throws(() => verifyToken(bad, SECRET, { now }), { code: "UNAUTHENTICATED" }, String(bad).slice(0, 30));
    }
  });
  test("a weak secret cannot be used to sign", () => {
    assert.throws(() => signToken({ sub: "x" }, "short"), /at least 16/);
  });
});
