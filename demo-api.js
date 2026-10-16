// Run with:  npm run demo:api
// Starts the server inside this script, calls the API like a browser would,
// and prints each call and its answer. Nothing is saved anywhere.
import { fileURLToPath } from "node:url";
import { createServer } from "./src/server.js";

const server = createServer({ publicDir: fileURLToPath(new URL("./public", import.meta.url)) });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(label, method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  console.log(`\n${label}\n  ${method} ${url}${body ? " " + JSON.stringify(body) : ""}\n  -> ${res.status}  ${JSON.stringify(json)}`);
  return json;
}

await call("1. Create an event", "POST", "/api/events", { title: "Lagos Jazz Night", city: "Lagos", venue: "Terra Kulture", date: "2026-12-05" });
await call("2. Add a tier with 3 seats", "POST", "/api/events/EV-000001/tiers", { name: "Regular", priceCents: 500000, capacity: 3 });
await call("3. Try to book before publishing (refused)", "POST", "/api/bookings", { eventId: "EV-000001", tierId: "T1", buyerName: "Ada", quantity: 2 });
await call("4. Publish", "POST", "/api/events/EV-000001/publish");
await call("5. Search Lagos, cheapest first", "GET", "/api/events?city=Lagos&sort=price&order=asc");
await call("6. Book 2 seats", "POST", "/api/bookings", { eventId: "EV-000001", tierId: "T1", buyerName: "Ada", quantity: 2 });
await call("7. Book 2 more (only 1 left: refused)", "POST", "/api/bookings", { eventId: "EV-000001", tierId: "T1", buyerName: "Bayo", quantity: 2 });
await call("8. Pay with a declined card", "POST", "/api/bookings/BK-000001/pay", { paymentToken: "tok_declined" });
await call("9. Pay with a good card", "POST", "/api/bookings/BK-000001/pay", { paymentToken: "tok_success" });
await call("10. Book the last seat", "POST", "/api/bookings", { eventId: "EV-000001", tierId: "T1", buyerName: "Bayo", quantity: 1 });
await call("11. Cancel it (unpaid, allowed)", "POST", "/api/bookings/BK-000002/cancel");
await call("12. Cancel the paid one (needs a refund, Build 8)", "POST", "/api/bookings/BK-000001/cancel");

server.closeAllConnections();
server.close();
