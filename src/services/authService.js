import { randomBytes } from "node:crypto";
import { DomainError } from "../errors.js";
import { checkSignup, normaliseEmail, hashPassword, verifyPassword, MAX_PASSWORD_LENGTH } from "../auth.js";
import { signToken, verifyToken } from "../tokens.js";

// SERVICES layer: sign up, log in, and find out who a request is from.
export function createAuthService(store, { secret = randomBytes(32).toString("hex"), now = Date.now, hashCost } = {}) {
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
  const tokenFor = (u) => signToken({ sub: u.id, role: u.role }, secret, { now: now() });

  // A real-looking hash to compare against when the email does not exist,
  // so "no such email" takes as long as "wrong password" (no timing clue).
  let dummyHash;
  const getDummyHash = async () => (dummyHash ??= await hashPassword(randomBytes(8).toString("hex"), hashCost));

  const WRONG = "Wrong email or password.";

  return {
    async signup(input) {
      const clean = checkSignup(input);
      if (store.users.findByEmail(clean.email)) {
        throw new DomainError("EMAIL_TAKEN", "That email already has an account. Log in instead.");
      }
      const passwordHash = await hashPassword(clean.password, hashCost);
      const user = store.users.create({ name: clean.name, email: clean.email, passwordHash, role: clean.role });
      return { user: publicUser(user), token: tokenFor(user) };
    },

    async login(input) {
      const email = normaliseEmail(input?.email);
      const password = input?.password;
      if (email === "" || typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
        throw new DomainError("VALIDATION", "Enter your email and password.");
      }
      const user = store.users.findByEmail(email);
      const ok = await verifyPassword(password, user ? user.passwordHash : await getDummyHash());
      // The SAME message for "no such email" and "wrong password", so nobody can use login to find out who has an account.
      if (!user || !ok) throw new DomainError("UNAUTHENTICATED", WRONG);
      return { user: publicUser(user), token: tokenFor(user) };
    },

    // Reads the "Authorization: Bearer <token>" header.
    //   no header       -> null (a visitor who is not logged in)
    //   a bad token     -> throws UNAUTHENTICATED
    //   a good token    -> the user, read fresh from the database (so a deleted account stops working at once)
    authenticate(headerValue) {
      if (headerValue === undefined || headerValue === "") return null;
      const m = /^Bearer (\S+)$/.exec(headerValue);
      if (!m) throw new DomainError("UNAUTHENTICATED", "Send your login as: Authorization: Bearer <token>.");
      const claims = verifyToken(m[1], secret, { now: now() });
      const user = store.users.findById(claims.sub);
      if (!user) throw new DomainError("UNAUTHENTICATED", "Your login is not valid. Please log in again.");
      return publicUser(user);
    },

    publicUser,
  };
}
