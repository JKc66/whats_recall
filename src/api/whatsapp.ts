import { Hono } from 'hono';
import { WhatsAppConnection } from '../whatsapp/connection.ts';

const whatsapp = new Hono();

export default function (client: WhatsAppConnection) {
  whatsapp.get('/pairing', async (c) => {
    return c.json(client.getPairingData());
  });

  whatsapp.post('/reset', async (c) => {
    await client.reset();
    return c.json({ success: true });
  });

  whatsapp.get('/chats', async (c) => {
    const chats = await client.getWhatsAppChats();
    return c.json({ chats });
  });

  return whatsapp;
}
