import { Hono } from 'hono';
import { getDb } from '../db/database.ts';

const db = getDb();
const settings = new Hono();

settings.get('/', async (c) => {
  return c.json(db.getSettings());
});

settings.post('/update', async (c) => {
  const { key, value } = await c.req.json();
  db.updateSetting(key, value);
  return c.json({ success: true });
});

export default settings;
