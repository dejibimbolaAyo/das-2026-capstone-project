// Merge sort: O(n log n) in every case, and STABLE.
// Stable means items that compare equal keep their original order. That matters
// when you sort by date and want events on the same day to stay in title order.

const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Returns a new array. The input is never modified.
export function mergeSort(items, compare = defaultCompare) {
  if (items.length <= 1) return [...items];

  const middle = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);
  return merge(left, right, compare);
}

function merge(left, right, compare) {
  const merged = [];
  let l = 0;
  let r = 0;

  while (l < left.length && r < right.length) {
    // `<= 0` (take from the LEFT on ties) is what makes the sort stable.
    if (compare(left[l], right[r]) <= 0) {
      merged.push(left[l]);
      l += 1;
    } else {
      merged.push(right[r]);
      r += 1;
    }
  }

  while (l < left.length) merged.push(left[l++]);
  while (r < right.length) merged.push(right[r++]);
  return merged;
}
