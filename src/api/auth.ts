import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb } from '../db/database.ts';
import { getClientIp, checkApiRateLimit, apiRateLimits, verifySession } from './utils.ts';
import { log } from '../logger.ts';

const auth = new Hono();

const startTime = Date.now();
const SESSION_DURATION_HOURS = 24 * 7; // 7 days

// Login attempt tracking
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

auth.get('/uptime', (c) => {
  return c.json({ uptime: Math.floor((Date.now() - startTime) / 1000) });
});

auth.post('/login', async (c) => {
  const db = getDb();
  const ip = getClientIp(c);
  
  if (!checkApiRateLimit(ip, 'login', MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS)) {
    log('AUTH', `Login rate-limited for IP ${ip}`);
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }

  const { password, fingerprint } = await c.req.json();
  const serverPassword = process.env.AUTH_PASSWORD;

  if (password !== serverPassword) {
    log('AUTH', `Login failed from ${ip}`);
    return c.json({ error: 'Invalid password' }, 401);
  }

  // Success: reset attempts in central rate limiter
  apiRateLimits.delete(`${ip}:login`);

  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600_000).toISOString();
  
  db.createSession(token, fingerprint || '', expiresAt);
  
  const isProduction = process.env.NODE_ENV === 'production';
  const isHttps = c.req.url.startsWith('https://') || c.req.header('x-forwarded-proto') === 'https';
  
  setCookie(c, 'auth_token', token, {
    path: '/',
    httpOnly: true,
    secure: isHttps && isProduction,
    sameSite: 'Lax',
    maxAge: SESSION_DURATION_HOURS * 3600
  });

  if (fingerprint) {
    setCookie(c, 'auth_fp', fingerprint, {
      path: '/',
      httpOnly: true,
      secure: isHttps && isProduction,
      sameSite: 'Lax',
      maxAge: SESSION_DURATION_HOURS * 3600
    });
  }

  log('AUTH', `Login success from ${ip}, fingerprint: ${fingerprint ? 'yes' : 'none'}`);
  return c.json({ success: true, token });
});

auth.get('/verify', async (c) => {
  const db = getDb();
  const token = getCookie(c, 'auth_token') || c.req.header('X-Auth-Token');
  const fingerprint = c.req.header('X-Fingerprint') || getCookie(c, 'auth_fp');

  const { authenticated, session } = verifySession(db, token, fingerprint);

  return c.json({ 
    authenticated,
    fingerprint: session?.fingerprint 
  });
});

auth.post('/logout', async (c) => {
  const db = getDb();
  const token = getCookie(c, 'auth_token') || c.req.header('X-Auth-Token');
  if (token) db.deleteSession(token);
  deleteCookie(c, 'auth_token');
  return c.json({ success: true });
});

export default auth;
