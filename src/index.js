import { initDatabase } from './database.js';
import { createMonitor } from './whatsapp.js';
import { createServer } from './server.js';

function log(category, message) {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  console.log(`[${ts}] [${category}] ${message}`);
}

log('BOOT', 'Starting WhatsApp Deleted Messages Monitor');
log('BOOT', `Node env: ${process.env.NODE_ENV || 'development'}`);
log('BOOT', `Port: ${process.env.WEB_PORT || '3000'}`);

const db = initDatabase();
log('BOOT', 'Database initialized');

let broadcastFn = () => { };

const monitor = createMonitor(db, (event, data) => broadcastFn(event, data));
const { start, broadcast } = createServer(db, monitor);

broadcastFn = broadcast;

start();
monitor.start();

process.on('SIGINT', () => {
  log('BOOT', 'Shutting down (SIGINT)...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('BOOT', 'Shutting down (SIGTERM)...');
  db.close();
  process.exit(0);
});
