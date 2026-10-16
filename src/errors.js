// One kind of error for all "you broke a rule" problems.
// The `code` is a short label, so code can check it without reading the message.
export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
