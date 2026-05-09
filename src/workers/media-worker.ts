import { createHash } from 'crypto';

// Bun worker entry point
self.onmessage = (event: MessageEvent) => {
  const { buffer, byteOffset, byteLength, id } = event.data;
  try {
    const hash = createHash('sha256').update(new Uint8Array(buffer, byteOffset, byteLength)).digest('hex');
    (self as any).postMessage({ id, hash });
  } catch (err: any) {
    (self as any).postMessage({ id, error: err.message });
  }
};
