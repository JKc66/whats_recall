import { Hono } from 'hono';
import { getDb } from '../db/database.ts';

const db = getDb();
const chats = new Hono();

chats.get('/', async (c) => {
  return c.json({ chats: db.getChats() });
});

chats.get('/:chatId/messages', async (c) => {
  const chatId = c.req.param('chatId') as string;
  const limit = parseInt(c.req.query('limit') || '200', 10);
  const before = c.req.query('before') ? parseInt(c.req.query('before') as string, 10) : null;
  return c.json({ messages: db.getMessages(chatId, limit, before) });
});

chats.post('/:chatId/read', async (c) => {
  const chatId = c.req.param('chatId');
  db.markChatDeletedAsSeen(chatId);
  return c.json({ success: true });
});

export default chats;
