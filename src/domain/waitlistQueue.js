import { DomainError } from "./errors.js";

export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  enqueue(value) {
    if (value === undefined) {
      throw new DomainError("VALIDATION", "Queue values cannot be undefined.");
    }

    const node = { value, next: null };
    if (this.#tail) {
      this.#tail.next = node;
    } else {
      this.#head = node;
    }
    this.#tail = node;
    this.#size += 1;
    return this.#size;
  }

  dequeue() {
    if (!this.#head) {
      return undefined;
    }

    const { value } = this.#head;
    this.#head = this.#head.next;
    this.#size -= 1;
    if (!this.#head) {
      this.#tail = null;
    }
    return value;
  }

  peek() {
    return this.#head?.value;
  }

  get size() {
    return this.#size;
  }
}
