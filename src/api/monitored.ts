import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { mutationBodyLimit, readJsonBody } from './mutation-helpers.ts';
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

  monitored.post('/', bodyLimit(mutationBodyLimit), async (c) => {
    const db = getDb();

    const body = (await readJsonBody(c)) as { chatId?: unknown; name?: unknown; isGroup?: unknown };
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

  monitored.delete('/:chatId', bodyLimit(mutationBodyLimit), async (c) => {
    // Consume body to trigger bodyLimit validation
    try {
      await c.req.text();
    } catch (e: any) {
      if (e.status === 413) throw e;
    }
    const chatId = c.req.param('chatId');

    // Use the robust connection-level deletion that handles both PN and LID variants
    await client.deleteChatFully(chatId);

    return c.json({ success: true });
  });

  return monitored;
};

export default monitoredRouter;
