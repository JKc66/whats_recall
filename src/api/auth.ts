import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db/database.ts';
import { getClientIp, checkApiRateLimit, apiRateLimits, verifySession } from './utils.ts';
import { log } from '../logger.ts';
import * as crypto_node from 'crypto';

const auth = new Hono();

const startTime = Date.now();
const SESSION_DURATION_HOURS = 24 * 7; // 7 days

// Login attempt tracking
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

auth.get('/uptime', (c) => {
  return c.json({ uptime: Math.floor((Date.now() - startTime) / 1000) });
});

auth.post('/login', bodyLimit({
  maxSize: 8192,
  onError: (c) => c.json({ error: 'Payload too large' }, 413)
}), async (c) => {
  const db = getDb();
  const ip = getClientIp(c);
  
  if (!checkApiRateLimit(ip, 'login', MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS)) {
    log('AUTH', `Login rate-limited for IP ${ip}`);
    return c.json({ error: 'Too many login attempts. Try again later.' }, 429);
  }

  let body;
  try {
    body = await c.req.json();
  } catch (_err) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const { password, fingerprint } = body;
  const serverPassword = process.env.AUTH_PASSWORD || '';
  const maxPasswordLength = Math.max(1024, serverPassword.length * 2);

  if (typeof password !== 'string' || password.length > maxPasswordLength) {
    log('AUTH', `Login failed from ${ip}: invalid password format or length`);
    return c.json({ error: 'Invalid password format or length' }, 400);
  }

  const passwordBuffer = Buffer.from(password);
  const serverPasswordBuffer = Buffer.from(serverPassword);

  let isMatch = false;
  if (passwordBuffer.length === serverPasswordBuffer.length) {
    isMatch = crypto_node.timingSafeEqual(passwordBuffer, serverPasswordBuffer);
  } else {
    // Prevent timing attacks by always doing the comparison anyway, just against a dummy buffer
    crypto_node.timingSafeEqual(serverPasswordBuffer, serverPasswordBuffer);
  }

  if (!isMatch) {
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
