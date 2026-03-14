import { writeFileSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';

const NUM_FILES = 1000;
const DATA = Buffer.from('benchmark data'.repeat(1000)); // ~14KB per file

// Helper to wait a bit so setInterval ticks can be recorded
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function measureLag(action, duration = 10) {
  let lagSamples = [];
  let lastTick = performance.now();

  const interval = setInterval(() => {
    const now = performance.now();
    lagSamples.push(now - lastTick - duration);
    lastTick = now;
  }, duration);

  const start = performance.now();
  await action();
  const end = performance.now();

  // Wait one tick to let any pending interval callbacks fire if the event loop was blocked
  await sleep(duration + 5);
  clearInterval(interval);

  const maxLag = lagSamples.length > 0 ? Math.max(...lagSamples) : 0;
  const avgLag = lagSamples.length > 0 ? lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length : 0;

  return { time: end - start, maxLag, avgLag };
}

function cleanup(prefix) {
  for (let i = 0; i < NUM_FILES; i++) {
    try {
      unlinkSync(`${prefix}_${i}.bin`);
    } catch (err) {
      // ignore
    }
  }
}

async function benchSync() {
  console.log('--- Sync Write (blocking) ---');
  const result = await measureLag(async () => {
    for (let i = 0; i < NUM_FILES; i++) {
      writeFileSync(`test_sync_${i}.bin`, DATA);
    }
  });

  console.log(`Total time: ${result.time.toFixed(2)}ms`);
  console.log(`Max event loop lag: ${result.maxLag.toFixed(2)}ms`);
  console.log(`Avg event loop lag: ${result.avgLag.toFixed(2)}ms`);
  cleanup('test_sync');
}

async function benchPromises() {
  console.log('--- fs/promises Write (baseline) ---');
  const result = await measureLag(async () => {
    const promises = [];
    for (let i = 0; i < NUM_FILES; i++) {
      promises.push(writeFile(`test_promise_${i}.bin`, DATA));
    }
    await Promise.all(promises);
  });

  console.log(`Total time: ${result.time.toFixed(2)}ms`);
  console.log(`Max event loop lag: ${result.maxLag.toFixed(2)}ms`);
  console.log(`Avg event loop lag: ${result.avgLag.toFixed(2)}ms`);
  cleanup('test_promise');
}

async function benchBunWrite() {
  console.log('--- Bun.write (optimized) ---');
  const result = await measureLag(async () => {
    const promises = [];
    for (let i = 0; i < NUM_FILES; i++) {
      promises.push(Bun.write(`test_bun_${i}.bin`, DATA));
    }
    await Promise.all(promises);
  });

  console.log(`Total time: ${result.time.toFixed(2)}ms`);
  console.log(`Max event loop lag: ${result.maxLag.toFixed(2)}ms`);
  console.log(`Avg event loop lag: ${result.avgLag.toFixed(2)}ms`);
  cleanup('test_bun');
}

async function run() {
  await benchSync();
  console.log('\n');
  await benchPromises();
  console.log('\n');
  await benchBunWrite();
}

run();
