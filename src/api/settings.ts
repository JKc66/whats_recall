import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db/database.ts';
import { type EvlogVariables } from 'evlog/hono';
import { createError } from 'evlog';
import { mutationBodyLimit, readJsonBody } from './mutation-helpers.ts';

const settings = new Hono<EvlogVariables>();

settings.get('/', async (c) => {
  const db = getDb();
  return c.json(db.getSettings());
});

settings.post('/update', bodyLimit(mutationBodyLimit), async (c) => {
  const db = getDb();

  const body = (await readJsonBody(c)) as { key?: unknown; value?: unknown };
  const { key, value } = body;

  if (typeof key !== 'string' || typeof value !== 'string') {
    throw createError({
      message: 'Invalid request body',
      status: 400,
      why: 'Key and value must be strings',
      fix: 'Provide key and value as strings',
    });
  }

  if (key.length > 1024 || value.length > 1024) {
    throw createError({
      message: 'Payload too large',
      status: 400,
      why: 'Key or value exceeds maximum length',
      fix: 'Use shorter key or value',
    });
  }

  db.updateSetting(key, value);
  return c.json({ success: true });
});

export default settings;
