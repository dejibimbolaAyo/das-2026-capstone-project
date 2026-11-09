import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOKING_STATES,
  canTransition,
  assertTransition,
} from '../src/domain/bookingStateMachine.js';

import { DomainError } from '../src/domain/errors.js';

test('all five booking states are defined', () => {
  assert.deepEqual(BOOKING_STATES, [
    'pending',
    'paid',
    'cancelled',
    'refunded',
    'checked_in',
  ]);
});

test('all allowed booking transitions are accepted', () => {
  const allowedMoves = [
    ['pending', 'paid'],
    ['pending', 'cancelled'],
    ['paid', 'checked_in'],
    ['paid', 'refunded'],
    ['paid', 'cancelled'],
  ];

  for (const [from, to] of allowedMoves) {
    assert.equal(canTransition(from, to), true);
    assert.equal(assertTransition(from, to), true);
  }
});

test('all forbidden booking transitions are rejected', () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      if (!canTransition(from, to)) {
        assert.throws(
          () => assertTransition(from, to),
          (error) => {
            assert.ok(error instanceof DomainError);
            assert.equal(error.code, 'INVALID_TRANSITION');
            return true;
          }
        );
      }
    }
  }
});

test('unknown booking states are rejected', () => {
  assert.equal(canTransition('unknown', 'paid'), false);

  assert.throws(
    () => assertTransition('unknown', 'paid'),
    { code: 'INVALID_TRANSITION' }
  );
});