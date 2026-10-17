// Build 4: a stand-in for a real payment provider.
//
// It is async, so the services already look like they will when a real gateway
// arrives. It NEVER sees a card number: the caller passes a token, and the token
// "declined" makes it fail. Anything else (or nothing) succeeds.

export function createMockPaymentGateway() {
  let counter = 0;

  return {
    async charge({ amountCents, reference, card }) {
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        throw new Error('amountCents must be a whole number of cents');
      }

      // Pretend we talked to a provider.
      await Promise.resolve();

      const token = typeof card === 'string' ? card.trim().toLowerCase() : 'ok';
      if (token === 'declined' || token === 'decline') {
        return { ok: false, code: 'PAYMENT_DECLINED', message: 'The card was declined' };
      }

      counter += 1;
      return { ok: true, paymentId: `pay_${counter}_${reference}` };
    },
  };
}
