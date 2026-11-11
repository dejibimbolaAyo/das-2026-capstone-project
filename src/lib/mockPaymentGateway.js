// A pretend payment provider. No real money moves.
//
// It never sees a card number. In a real shop the browser sends the card to the
// provider and gets back a token; we only ever pass that token along.
// For the mock, the token decides the outcome:
//   'tok_success'  -> the charge succeeds
//   'tok_declined' -> the charge is declined
// Any other token is treated as declined as well.
//
// charge() is idempotent: a second successful call with the same key returns the
// first charge instead of charging again. A declined attempt is not remembered,
// so the attendee can try again with another card.

import { newId } from '../domain/ids.js';

export const SUCCESS_TOKEN = 'tok_success';
export const DECLINED_TOKEN = 'tok_declined';

export function createMockPaymentGateway({ delayMs = 0 } = {}) {
  const chargesByKey = new Map();
  let chargeCount = 0;

  return {
    async charge({ amountCents, paymentToken, idempotencyKey }) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));

      const previous = chargesByKey.get(idempotencyKey);
      if (previous) return previous;

      if (paymentToken !== SUCCESS_TOKEN) {
        return { status: 'declined', reason: 'Card declined' };
      }

      chargeCount += 1;
      const result = { status: 'succeeded', chargeId: `ch_${newId()}`, amountCents };
      chargesByKey.set(idempotencyKey, result);
      return result;
    },

    // For tests: how many times money was actually taken.
    get chargeCount() {
      return chargeCount;
    },
  };
}
