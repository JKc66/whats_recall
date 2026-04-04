import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db/database.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';

const monitoredRouter = (client: WhatsAppConnection) => {
  const monitored = new Hono();

  monitored.get('/', async (c) => {
    const db = getDb();
    return c.json({ monitored: db.getMonitoredChats() });
  });

  monitored.post('/', bodyLimit({
    maxSize: 8192,
    onError: (c) => c.json({ error: 'Payload too large' }, 413)
  }), async (c) => {
    const db = getDb();

    let body;
    try {
      body = await c.req.json();
    } catch (_err) {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const { chatId, name, isGroup } = body;

    if (typeof chatId !== 'string' || typeof name !== 'string') {
      return c.json({ error: 'chatId and name must be strings' }, 400);
    }

    if (chatId.length > 1024 || name.length > 1024) {
      return c.json({ error: 'chatId or name exceeds maximum length' }, 400);
    }
    
    // Ensure the chat row exists in the metadata table so DPs can be persisted
    db.upsertChat(chatId, name, isGroup);
    db.addMonitoredChat(chatId, name, isGroup);
    
    return c.json({ success: true });
  });

  monitored.delete('/:chatId', async (c) => {
    const chatId = c.req.param('chatId');

    // Use the robust connection-level deletion that handles both PN and LID variants
    await client.deleteChatFully(chatId);

    return c.json({ success: true });
  });

  return monitored;
};

export default monitoredRouter;
