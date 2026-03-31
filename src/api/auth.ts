import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb } from '../db/database.ts';

const db = getDb();
const auth = new Hono();

const SESSION_DURATION_HOURS = 24 * 7; // 7 days

auth.post('/login', async (c) => {
  const { password, fingerprint } = await c.req.json();
  const serverPassword = process.env.AUTH_PASSWORD;

  if (password !== serverPassword) {
    return c.json({ error: 'Invalid password' }, 401);
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600_000).toISOString();
  
  db.createSession(token, fingerprint || '', expiresAt);
  
  setCookie(c, 'auth_token', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: SESSION_DURATION_HOURS * 3600
  });

  return c.json({ success: true, token });
});

auth.get('/verify', async (c) => {
  const token = getCookie(c, 'auth_token') || c.req.header('X-Auth-Token');
  const fingerprint = c.req.header('X-Fingerprint');

  if (!token) return c.json({ authenticated: false });

  const session = db.getSession(token);
  if (!session || (fingerprint && session.fingerprint !== fingerprint)) {
    return c.json({ authenticated: false });
  }

  return c.json({ authenticated: true });
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, 'auth_token');
  if (token) db.deleteSession(token);
  deleteCookie(c, 'auth_token');
  return c.json({ success: true });
});

export default auth;
