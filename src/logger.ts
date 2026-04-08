import { initLogger, log as elog } from 'evlog';
import { createFsDrain } from 'evlog/fs';

initLogger({
  env: { service: 'logger' },
  silent: true, // We handle console output manually for compactness
  drain: createFsDrain({
    dir: '.evlog/logs',
  }),
});

export function log(category: string, message: string, ...args: any[]) {
  const isTest = process.env.NODE_ENV === "test";
  const isVerbose = process.env.VERBOSE === "true";
  
  if (!isTest || isVerbose) {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    console.log(`[${time}] [${category}] ${message}`, ...args);
  }
  
  const logger = (elog as any)[category.toLowerCase()] || elog.info;
  logger(`[${category}] ${message}`, ...args);
}
