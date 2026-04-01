const COLORS: Record<string, string> = {
  HTTP: '\x1b[36m', // Cyan
  WA: '\x1b[32m',   // Green
  BOOT: '\x1b[35m', // Magenta
  AUTH: '\x1b[33m', // Yellow
  WS: '\x1b[34m',   // Blue
  SERVER: '\x1b[35m', // Magenta
  DB: '\x1b[31m',   // Red
  API: '\x1b[36m', // Cyan
  CONN: '\x1b[32m', // Green
  PROCESSOR: '\x1b[34m', // Blue
  SYNC: '\x1b[33m', // Yellow
  RESET: '\x1b[0m'
};

export function log(category: string, message: string, ...args: any[]) {
  if (process.env.NODE_ENV === "test" && process.env.VERBOSE !== "true") return;
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const color = COLORS[category] || '\x1b[37m'; // Default white
  console.log(`\x1b[90m[${ts}]\x1b[0m ${color}[${category}]\x1b[0m ${message}`, ...args);
}
