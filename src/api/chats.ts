import { Hono } from 'hono';
import { getDb } from '../db/database.ts';
import { getClientIp, checkApiRateLimit } from './utils.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';

import { type EvlogVariables } from 'evlog/hono';
import { createError } from 'evlog';

const chatsRouter = (client: WhatsAppConnection) => {
  const chats = new Hono<EvlogVariables>();

  chats.get('/', async (c) => {
    const db = getDb();
    const query = c.req.query('q');
    const chatList = db.getChats(query);
    const myId = client.myId;

    const enriched = chatList.map((chat: any) => ({
      ...chat,
      isMe: myId && (chat.chat_id === myId || (chat.chat_id.includes('@lid') && chat.chat_id.includes(myId.split('@')[0])))
    }));

    return c.json({ chats: enriched });
  });

  chats.get('/search', async (c) => {
    const db = getDb();
    const ip = getClientIp(c);
    if (!checkApiRateLimit(ip, 'search', 30, 60_000)) {
      const logger = c.get('log');
      logger.set({ error: 'rate_limited' });
      logger.warn(`Search rate-limited for ${ip}`);
      throw createError({
        message: 'Too many search requests',
        status: 429,
        why: 'Maximum search requests exceeded for this IP',
        fix: 'Please wait a minute before trying again'
      });
    }
    const query = c.req.query('q') || '';
    if (query.length < 2) return c.json({ messages: [] });
    const messages = db.searchMessages(query);
    return c.json({ messages });
  });

  chats.get('/deleted', async (c) => {
    const db = getDb();
    let limit = parseInt(c.req.query('limit') || '50', 10);
    if (Number.isNaN(limit) || limit <= 0) limit = 50;
    if (limit > 1000) limit = 1000;

    const messages = db.getDeletedMessages(limit);
    return c.json({ messages });
  });

  chats.get('/:chatId/messages', async (c) => {
    const db = getDb();
    const chatId = c.req.param('chatId') as string;

    let limit = parseInt(c.req.query('limit') || '200', 10);
    if (Number.isNaN(limit) || limit <= 0) limit = 200;
    if (limit > 1000) limit = 1000;

    let before: number | null = c.req.query('before') ? parseInt(c.req.query('before') as string, 10) : null;
    if (before !== null && (Number.isNaN(before) || before < 0)) before = null;

    return c.json({ messages: db.getMessages(chatId, limit, before) });
  });

  chats.post('/:chatId/read', async (c) => {
    const db = getDb();
    const chatId = c.req.param('chatId');
    db.markChatDeletedAsSeen(chatId);
    return c.json({ success: true });
  });

  return chats;
};

export default chatsRouter;
