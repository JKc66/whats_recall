import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db/database.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';

import { type EvlogVariables } from 'evlog/hono';
import { createError } from 'evlog';

const monitoredRouter = (client: WhatsAppConnection) => {
  const monitored = new Hono<EvlogVariables>();

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
    throw createError({
      message: 'Invalid JSON payload',
      status: 400,
      why: 'Request body could not be parsed as JSON',
      fix: 'Ensure request body is valid JSON'
    });
    }

    const { chatId, name, isGroup } = body;

    if (typeof chatId !== 'string' || typeof name !== 'string') {
      throw createError({
        message: 'Invalid request body',
        status: 400,
        why: 'chatId and name must be strings',
        fix: 'Provide chatId and name as strings'
      });
    }

    if (chatId.length > 1024 || name.length > 1024) {
      throw createError({
        message: 'Payload too large',
        status: 400,
        why: 'chatId or name exceeds 1024 characters',
        fix: 'Use shorter IDs or names'
      });
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
