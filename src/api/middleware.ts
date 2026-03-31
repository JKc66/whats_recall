import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { getDb } from '../db/database.ts';

export async function authMiddleware(c: Context, next: Next) {
  const db = getDb();
  const path = c.req.path;
  if (path.includes('/api/auth/login') || path.includes('/api/auth/verify')) {
    return await next();
  }

  const token = getCookie(c, 'auth_token') || c.req.header('X-Auth-Token');
  const fingerprint = c.req.header('X-Fingerprint');

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = db.getSession(token);
  if (!session || (fingerprint && (session as any).fingerprint && fingerprint !== (session as any).fingerprint)) {
    return c.json({ error: 'Session expired or invalid' }, 401);
  }

  await next();
}
