import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_STATES,
  FINAL_STATES,
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
  isFinalState,
  isKnownState,
} from '../src/domain/bookingStateMachine.js';

// Every allowed move, spelled out. If the graph changes, this table must change.
const ALLOWED = [
  ['pending', 'paid'],
  ['pending', 'cancelled'],
  ['paid', 'checked_in'],
  ['paid', 'refunded'],
  ['paid', 'cancelled'],
];

function isAllowed(from, to) {
  return ALLOWED.some(([a, b]) => a === from && b === to);
}

test('every allowed move passes', () => {
  for (const [from, to] of ALLOWED) {
    assert.equal(canTransition(from, to), true, `expected ${from} -> ${to} to be allowed`);
    assert.equal(assertTransition(from, to), to);
  }
});

test('every other move is refused with INVALID_TRANSITION', () => {
  for (const from of BOOKING_STATES) {
    for (const to of BOOKING_STATES) {
      if (isAllowed(from, to)) continue;
      assert.equal(canTransition(from, to), false, `expected ${from} -> ${to} to be refused`);
      assert.throws(
        () => assertTransition(from, to),
        (error) => error.code === 'INVALID_TRANSITION',
        `expected ${from} -> ${to} to throw INVALID_TRANSITION`,
      );
    }
  }
});

test('final states have no way out', () => {
  for (const state of ['cancelled', 'refunded', 'checked_in']) {
    assert.equal(isFinalState(state), true);
    assert.deepEqual(ALLOWED_TRANSITIONS[state], []);
    for (const to of BOOKING_STATES) {
      assert.equal(canTransition(state, to), false, `${state} must not move to ${to}`);
    }
  }
});

test('unknown states are not known and cannot transition', () => {
  assert.equal(isKnownState('nonsense'), false);
  assert.equal(canTransition('nonsense', 'paid'), false);
  assert.throws(() => assertTransition('nonsense', 'paid'), (error) => error.code === 'INVALID_TRANSITION');
});

test('the specific example from the brief: paying a cancelled booking is refused', () => {
  assert.throws(
    () => assertTransition('cancelled', 'paid'),
    (error) => error.code === 'INVALID_TRANSITION',
  );
});

test('FINAL_STATES matches the empty rows of the graph', () => {
  for (const state of FINAL_STATES) {
    assert.deepEqual(ALLOWED_TRANSITIONS[state], []);
  }
});
