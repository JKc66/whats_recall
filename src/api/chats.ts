import { Hono } from 'hono';
import { getDb } from '../db/database.ts';
import { getClientIp, checkApiRateLimit } from './utils.ts';
import { log } from '../logger.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';

const chatsRouter = (client: WhatsAppConnection) => {
  const chats = new Hono();

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
    // ⚡ Bolt Optimization: Enforce strict boundaries on integer parsing for query limits
    // Prevents database exhaustion and memory spikes caused by unbounded or NaN limits
    let limit = parseInt(c.req.query('limit') || '50', 10);
    if (isNaN(limit)) limit = 50;
    limit = Math.max(1, Math.min(1000, limit));
    const messages = db.getDeletedMessages(limit);
    return c.json({ messages });
  });

  chats.get('/:chatId/messages', async (c) => {
    const db = getDb();
    const chatId = c.req.param('chatId') as string;
    // ⚡ Bolt Optimization: Enforce strict boundaries on integer parsing for query limits
    // Prevents database exhaustion and memory spikes caused by unbounded or NaN limits
    let limit = parseInt(c.req.query('limit') || '200', 10);
    if (isNaN(limit)) limit = 200;
    limit = Math.max(1, Math.min(1000, limit));

    let before = c.req.query('before') ? parseInt(c.req.query('before') as string, 10) : null;
    if (before !== null && isNaN(before)) before = null;
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
