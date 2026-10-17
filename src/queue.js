// A first-in, first-out line, built as a linked list.
// Each Node holds one value and points to the next Node.
// Add at the back (tail), remove from the front (head). Both are O(1).

class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  get size() {
    return this.#size;
  }

  isEmpty() {
    return this.#size === 0;
  }

  // Join the back of the line.
  enqueue(value) {
    const node = new Node(value);
    if (this.#tail) {
      this.#tail.next = node;
    } else {
      this.#head = node;
    }
    this.#tail = node;
    this.#size++;
  }

  // Leave from the front of the line. Returns undefined if empty.
  dequeue() {
    if (!this.#head) return undefined;
    const node = this.#head;
    this.#head = node.next;
    if (!this.#head) this.#tail = null;
    this.#size--;
    return node.value;
  }

  // Look at the front without removing it.
  peek() {
    return this.#head ? this.#head.value : undefined;
  }

  // For printing only. This walks the whole line, so it is O(n).
  toArray() {
    const out = [];
    for (let n = this.#head; n; n = n.next) out.push(n.value);
    return out;
  }
}
