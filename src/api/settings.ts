import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db/database.ts';

const settings = new Hono();

settings.get('/', async (c) => {
  const db = getDb();
  return c.json(db.getSettings());
});

settings.post('/update', bodyLimit({
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

  const { key, value } = body;

  if (typeof key !== 'string' || typeof value !== 'string') {
    return c.json({ error: 'Key and value must be strings' }, 400);
  }

  if (key.length > 1024 || value.length > 1024) {
    return c.json({ error: 'Key or value exceeds maximum length' }, 400);
  }

  db.updateSetting(key, value);
  return c.json({ success: true });
});

export default settings;
