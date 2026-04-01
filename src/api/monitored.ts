import { Hono } from 'hono';
import { getDb } from '../db/database.ts';

const db = getDb();
const monitored = new Hono();

monitored.get('/', async (c) => {
  return c.json({ monitored: db.getMonitoredChats() });
});

monitored.post('/', async (c) => {
  const { chatId, name, isGroup } = await c.req.json();
  db.addMonitoredChat(chatId, name, isGroup);
  return c.json({ success: true });
});

monitored.delete('/:chatId', async (c) => {
  const chatId = c.req.param('chatId');

  // Always wipe messages and media before removing from monitored list
  await db.deleteChatsAndMessages([chatId]);
  db.removeMonitoredChat(chatId);

  return c.json({ success: true });
});

export default monitored;
