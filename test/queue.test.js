import { test } from "node:test";
import assert from "node:assert/strict";
import { Queue } from "../src/queue.js";

test("queue: first in, first out", () => {
  const q = new Queue();
  q.enqueue("A");
  q.enqueue("B");
  q.enqueue("C");
  assert.equal(q.dequeue(), "A");
  assert.equal(q.dequeue(), "B");
  assert.equal(q.dequeue(), "C");
});

test("queue: an empty queue gives undefined and stays usable", () => {
  const q = new Queue();
  assert.equal(q.dequeue(), undefined);
  assert.equal(q.size, 0);
  q.enqueue("A");
  assert.equal(q.size, 1);
  assert.equal(q.peek(), "A");
});
