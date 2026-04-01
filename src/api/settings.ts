import { Hono } from 'hono';
import { getDb } from '../db/database.ts';

const settings = new Hono();

settings.get('/', async (c) => {
  const db = getDb();
  return c.json(db.getSettings());
});

settings.post('/update', async (c) => {
  const db = getDb();
  const { key, value } = await c.req.json();
  db.updateSetting(key, value);
  return c.json({ success: true });
});

export default settings;
