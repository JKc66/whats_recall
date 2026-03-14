import { writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';

const NUM_FILES = 1000;
const DATA = Buffer.from('benchmark data'.repeat(1000)); // 14KB per file

async function benchSync() {
  console.log('--- Sync Write (baseline) ---');
  const start = performance.now();
  let completed = 0;

  // To simulate concurrent requests hitting the sync block, we'll run a loop
  // and do sync writes, but we also run an interval to measure event loop lag.
  let lagSamples = [];
  let lastTick = performance.now();
  const interval = setInterval(() => {
    const now = performance.now();
    lagSamples.push(now - lastTick - 10);
    lastTick = now;
  }, 10);

  for (let i = 0; i < NUM_FILES; i++) {
    writeFileSync(`test_sync_${i}.bin`, DATA);
  }

  clearInterval(interval);
  const end = performance.now();
  const maxLag = lagSamples.length > 0 ? Math.max(...lagSamples) : 0;
  const avgLag = lagSamples.length > 0 ? lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length : 0;

  console.log(`Total time: ${(end - start).toFixed(2)}ms`);
  console.log(`Max event loop lag: ${maxLag.toFixed(2)}ms`);
  console.log(`Avg event loop lag: ${avgLag.toFixed(2)}ms`);

  // Cleanup
  for (let i = 0; i < NUM_FILES; i++) {
    import('fs').then(fs => fs.unlinkSync(`test_sync_${i}.bin`));
  }
}

async function benchBunWrite() {
  console.log('--- Bun.write (optimized) ---');
  const start = performance.now();

  let lagSamples = [];
  let lastTick = performance.now();
  const interval = setInterval(() => {
    const now = performance.now();
    lagSamples.push(now - lastTick - 10);
    lastTick = now;
  }, 10);

  const promises = [];
  for (let i = 0; i < NUM_FILES; i++) {
    promises.push(Bun.write(`test_bun_${i}.bin`, DATA));
  }
  await Promise.all(promises);

  clearInterval(interval);
  const end = performance.now();
  const maxLag = lagSamples.length > 0 ? Math.max(...lagSamples) : 0;
  const avgLag = lagSamples.length > 0 ? lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length : 0;

  console.log(`Total time: ${(end - start).toFixed(2)}ms`);
  console.log(`Max event loop lag: ${maxLag.toFixed(2)}ms`);
  console.log(`Avg event loop lag: ${avgLag.toFixed(2)}ms`);

  // Cleanup
  for (let i = 0; i < NUM_FILES; i++) {
    import('fs').then(fs => fs.unlinkSync(`test_bun_${i}.bin`));
  }
}

async function run() {
  await benchSync();
  console.log('\n');
  await benchBunWrite();
}

run();
