import { Hono } from 'hono';
import { getDb } from '../db/database.ts';
import { getClientIp, checkApiRateLimit } from './utils.ts';
import { log } from '../logger.ts';

const chats = new Hono();

chats.get('/', async (c) => {
  const db = getDb();
  const query = c.req.query('q');
  return c.json({ chats: db.getChats(query) });
});

chats.get('/search', async (c) => {
  const db = getDb();
  const ip = getClientIp(c);
  if (!checkApiRateLimit(ip, 'search', 30, 60_000)) {
    log('API', `Search rate-limited for ${ip}`);
    return c.json({ error: 'Too many search requests. Please wait a minute.' }, 429);
  }
  const query = c.req.query('q') || '';
  if (query.length < 2) return c.json({ messages: [] });
  const messages = db.searchMessages(query);
  return c.json({ messages });
});

chats.get('/deleted', async (c) => {
  const db = getDb();
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const messages = db.getDeletedMessages(limit);
  return c.json({ messages });
});

chats.get('/:chatId/messages', async (c) => {
  const db = getDb();
  const chatId = c.req.param('chatId') as string;
  const limit = parseInt(c.req.query('limit') || '200', 10);
  const before = c.req.query('before') ? parseInt(c.req.query('before') as string, 10) : null;
  return c.json({ messages: db.getMessages(chatId, limit, before) });
});

chats.post('/:chatId/read', async (c) => {
  const db = getDb();
  const chatId = c.req.param('chatId');
  db.markChatDeletedAsSeen(chatId);
  return c.json({ success: true });
});

export default chats;
