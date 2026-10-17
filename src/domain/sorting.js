// Build 2: a merge sort we wrote ourselves.
// Stable (equal items keep their original order), O(n log n), and it never
// changes the array it is given. Do NOT call Array.prototype.sort in here.

export function mergeSort(items, compare) {
  if (!Array.isArray(items)) return [];
  if (items.length <= 1) return items.slice();

  const middle = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);
  return merge(left, right, compare);
}

function merge(left, right, compare) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    // "<=" keeps the sort stable: on a tie the left (earlier) item goes first.
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i += 1;
    } else {
      result.push(right[j]);
      j += 1;
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i += 1;
  }
  while (j < right.length) {
    result.push(right[j]);
    j += 1;
  }
  return result;
}
