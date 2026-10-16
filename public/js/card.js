// Checks what the person typed into the card form BEFORE we ask the "bank".
// This is a MOCK card form: nothing is ever stored or sent anywhere.

export function digitsOnly(text) {
  return String(text ?? "").replace(/\D/g, "");
}

// example: 1111222233334444 -> "1111 2222 3333 4444"
export function groupCardNumber(text) {
  return digitsOnly(text).slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

// Luhn check: the standard "does this look like a real card number" sum.
export function passesLuhn(number) {
  const digits = digitsOnly(number);
  if (digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Returns an object of problems, e.g. { number: "...", cvc: "..." }. Empty object = all good.
export function validateCard({ number, expiry, cvc }, now = new Date()) {
  const problems = {};
  const digits = digitsOnly(number);
  if (digits.length === 0) problems.number = "Enter the card number.";
  else if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) {
    problems.number = "That card number is not valid. Check each digit.";
  }

  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(expiry ?? "").trim());
  if (!m) problems.expiry = "Enter the expiry date as MM/YY, for example 08/29.";
  else {
    const month = Number(m[1]);
    const year = 2000 + Number(m[2]);
    if (month < 1 || month > 12) problems.expiry = "The month must be between 01 and 12.";
    else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      problems.expiry = "That card has expired.";
    }
  }

  if (!/^\d{3,4}$/.test(String(cvc ?? "").trim())) problems.cvc = "Enter the 3 or 4 digit security code.";
  return problems;
}
