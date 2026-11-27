import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  states,
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
} from '../src/domain/bookingStateMachine.js';
import { DomainError } from '../src/domain/errors.js';

describe('booking state machine', () => {
  it('allows every documented state transition', () => {
    for (const [from, destinations] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of destinations) {
        assert.equal(canTransition(from, to), true);
        assert.equal(assertTransition(from, to), true);
      }
    }
  });

  it('refuses every illegal move, including moves from final states', () => {
    for (const from of states) {
      for (const to of states) {
        if (ALLOWED_TRANSITIONS[from].includes(to)) continue;
        assert.equal(canTransition(from, to), false);
        assert.throws(
          () => assertTransition(from, to),
          (error) => error instanceof DomainError
            && error.code === 'INVALID_TRANSITION',
        );
      }
    }
  });

  it('refuses transitions with unknown states', () => {
    assert.equal(canTransition('unknown', 'pending'), false);
    assert.throws(
      () => assertTransition('pending', 'unknown'),
      (error) => error.code === 'INVALID_TRANSITION',
    );
  });
});
