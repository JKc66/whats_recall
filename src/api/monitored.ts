import { Hono } from 'hono';
import { getDb } from '../db/database.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';

const monitoredRouter = (client: WhatsAppConnection) => {
  const monitored = new Hono();

  monitored.get('/', async (c) => {
    const db = getDb();
    return c.json({ monitored: db.getMonitoredChats() });
  });

  monitored.post('/', async (c) => {
    const db = getDb();
    const { chatId, name, isGroup } = await c.req.json();
    
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
