function safeMergeOld(oldObj, newObj) {
  const merged = { ...oldObj };
  for (const key in newObj) {
    if (newObj[key] !== undefined && newObj[key] !== null) {
      merged[key] = newObj[key];
    }
  }
  return merged;
}

function safeMergeKeysFor(oldObj, newObj) {
  const merged = { ...oldObj };
  const keys = Object.keys(newObj);
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    const val = newObj[key];
    if (val !== undefined && val !== null) {
      merged[key] = val;
    }
  }
  return merged;
}

const ITERATIONS = 10000000;

function runBench() {
  const oldObj = { a: 1, b: 2, c: 3 };
  const newObj = { b: 4, c: null, d: undefined, e: 5, f: 6, g: 7, h: 8 };

  // Warmup
  for (let i = 0; i < 10000; i++) {
    safeMergeOld(oldObj, newObj);
    safeMergeKeysFor(oldObj, newObj);
  }

  console.log("--- bun / node environment benchmark ---");

  console.time('old (for...in)');
  for (let i = 0; i < ITERATIONS; i++) {
    safeMergeOld(oldObj, newObj);
  }
  console.timeEnd('old (for...in)');

  console.time('Object.keys + for loop');
  for (let i = 0; i < ITERATIONS; i++) {
    safeMergeKeysFor(oldObj, newObj);
  }
  console.timeEnd('Object.keys + for loop');
}

runBench();
