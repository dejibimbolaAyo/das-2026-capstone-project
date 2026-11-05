import { referenceCode } from '../domain/ids.js';

// Mock payment gateway for testing payments
export function createMockPaymentGateway() {
  return {
    async charge({ decline = false } = {}) {
      if (decline) {
        return {
          status: 'declined',
        };
      }

      return {
        status: 'succeeded',
        transactionReference: referenceCode(12),
      };
    },
  };
}