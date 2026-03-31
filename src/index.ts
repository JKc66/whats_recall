import { getDb } from './db/database.ts';
import { WhatsAppConnection } from './whatsapp/connection.ts';
import { createHonoServer } from './api/server.ts';
import { log } from './logger.ts';
import { BroadcastEvent } from './types.ts';

log('BOOT', 'Starting WhatsApp Deleted Messages Monitor (Modular TypeScript Edition)');
log('BOOT', `Node env: ${process.env.NODE_ENV || 'development'}`);

// 1. Initialize Database
const db = getDb();
log('BOOT', 'Database initialized');

// 2. Setup Client & Server with Broadcast Loop
let broadcastRef = (event: BroadcastEvent, data: any) => { };

const client = new WhatsAppConnection((event, data) => broadcastRef(event, data));
const { start } = createHonoServer(client);
const { broadcast } = start();

// Hook the broadcast function from the server back into the client
broadcastRef = broadcast;

// 3. Start WhatsApp Monitoring
client.start();

// Shutdown Handlers
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
