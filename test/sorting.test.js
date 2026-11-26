import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSort } from '../src/domain/sorting.js';

describe('mergeSort', () => {
  it('sorts numbers ascending by default', () => {
    assert.deepEqual(mergeSort([5, 2, 9, 1, 5, 6]), [1, 2, 5, 5, 6, 9]);
  });

  it('handles empty and single-item arrays', () => {
    assert.deepEqual(mergeSort([]), []);
    assert.deepEqual(mergeSort([42]), [42]);
  });

  it('does not change the original array', () => {
    const original = [3, 1, 2];
    mergeSort(original);
    assert.deepEqual(original, [3, 1, 2]);
  });

  it('is stable: equal keys keep their original order', () => {
    const people = [
      { name: 'a', age: 30 },
      { name: 'b', age: 25 },
      { name: 'c', age: 30 },
      { name: 'd', age: 25 },
    ];
    const sorted = mergeSort(people, (x, y) => x.age - y.age);
    assert.deepEqual(
      sorted.map((p) => p.name),
      ['b', 'd', 'a', 'c'],
    );
  });

  it('gives the same result as the built-in sort on random data', () => {
    const data = Array.from({ length: 500 }, () => Math.floor(Math.random() * 100));
    const expected = [...data].sort((a, b) => a - b);
    assert.deepEqual(mergeSort(data, (a, b) => a - b), expected);
  });
});
