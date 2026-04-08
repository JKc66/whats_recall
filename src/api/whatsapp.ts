import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { WhatsAppConnection } from '../whatsapp/connection.ts';
import { type EvlogVariables } from 'evlog/hono';
import { mutationBodyLimit, readJsonBodyAllowEmpty } from './mutation-helpers.ts';

export default function (client: WhatsAppConnection) {
  const whatsapp = new Hono<EvlogVariables>();
  whatsapp.get('/pairing', async (c) => {
    return c.json(client.getPairingData());
  });

  whatsapp.post('/reset', bodyLimit(mutationBodyLimit), async (c) => {
    const body = await readJsonBodyAllowEmpty(c);
    const requestPairing = typeof body.requestPairing === 'boolean' ? body.requestPairing : true;
    await client.reset(requestPairing);
    return c.json({ success: true });
  });

  whatsapp.get('/chats', async (c) => {
    const refresh = c.req.query('refresh') === 'true';
    const chats = await client.getWhatsAppChats(refresh);
    return c.json({ chats });
  });

  return whatsapp;
}
