import { initLogger, log as elog } from 'evlog';
import { createFsDrain } from 'evlog/fs';

initLogger({
  env: { service: 'whatsapp-logger-backend' },
  pretty: true,
  silent: process.env.NODE_ENV === "test" && process.env.VERBOSE !== "true",
  drain: createFsDrain({
    dir: '.evlog/logs',
  }),
});

export function log(category: string, message: string, ...args: any[]) {
  if (process.env.NODE_ENV === "test" && process.env.VERBOSE === "true") {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    console.log(`[${time}] [${category}] ${message}`, ...args);
  }
  
  const logger = (elog as any)[category.toLowerCase()] || elog.info;
  logger(`[${category}] ${message}`, ...args);
}
