import { Hono } from 'hono';
import { WhatsAppConnection } from '../whatsapp/connection.ts';
import { type EvlogVariables } from 'evlog/hono';

export default function (client: WhatsAppConnection) {
  const whatsapp = new Hono<EvlogVariables>();
  whatsapp.get('/pairing', async (c) => {
    return c.json(client.getPairingData());
  });

  whatsapp.post('/reset', async (c) => {
    await client.reset();
    return c.json({ success: true });
  });

  whatsapp.get('/chats', async (c) => {
    const refresh = c.req.query('refresh') === 'true';
    const chats = await client.getWhatsAppChats(refresh);
    return c.json({ chats });
  });

  return whatsapp;
}
