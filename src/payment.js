import { DomainError } from "./errors.js";

// S07: a MOCK payment. No real money and no real bank. It only pretends.
//   "tok_success"  -> the payment works (this is the default)
//   "tok_declined" -> the "bank" says no
//   anything else  -> the token is not one we know
export function chargeMock(token = "tok_success") {
  if (token === "tok_success") return { ok: true };
  if (token === "tok_declined") {
    throw new DomainError("PAYMENT_DECLINED", "The payment was declined. The booking is still pending.");
  }
  throw new DomainError("VALIDATION", 'paymentToken must be "tok_success" or "tok_declined".');
}

// S09: a MOCK refund. It only pretends to send the money back, and always works.
// (A real gateway can fail or be slow. A real system would keep a "refund pending" state and retry.)
export function refundMock(amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new DomainError("VALIDATION", "A refund must be a whole number of cents, 0 or more.");
  }
  return { ok: true, refundedCents: amountCents };
}
