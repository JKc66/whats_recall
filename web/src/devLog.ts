/** Browser-only diagnostics; suppressed outside Vite dev. */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}
