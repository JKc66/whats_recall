import { initDatabase } from './database.js';
import { createMonitor } from './whatsapp.js';
import { createServer } from './server.js';

const db = initDatabase();

let broadcastFn = () => {};

const monitor = createMonitor(db, (event, data) => broadcastFn(event, data));
const { start, broadcast } = createServer(db, monitor);

broadcastFn = broadcast;

start();
monitor.start();

process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});
