import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { getDb } from '../db/database.ts';
import { getClientIp, checkApiRateLimit, apiRateLimits, verifySession } from './utils.ts';
import { log } from '../logger.ts';
import * as crypto_node from 'crypto';
import { type EvlogVariables } from 'evlog/hono';
import { createError } from 'evlog';

const auth = new Hono<EvlogVariables>();

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
    const logger = c.get('log');
    logger.set({ error: 'rate_limited' });
    logger.warn(`Login rate-limited for IP ${ip}`);
    throw createError({
      message: 'Too many login attempts',
      status: 429,
      why: 'Maximum login attempts exceeded for this IP',
      fix: 'Try again in 15 minutes'
    });
  }

  let body;
  try {
    body = await c.req.json();
  } catch (_err) {
    throw createError({
      message: 'Invalid JSON payload',
      status: 400,
      why: 'Request body could not be parsed as JSON',
      fix: 'Ensure request body is valid JSON'
    });
  }

  const { password, fingerprint } = body;
  const serverPassword = process.env.AUTH_PASSWORD || '';
  const maxPasswordLength = Math.max(1024, serverPassword.length * 2);

  if (typeof password !== 'string' || password.length > maxPasswordLength) {
    const logger = c.get('log');
    logger.set({ error: 'invalid_password_format' });
    logger.warn(`Login failed from ${ip}: invalid password format or length`);
    throw createError({
      message: 'Invalid password format',
      status: 400,
      why: 'The password provided is not a string or is too long',
      fix: 'Provide a valid string password'
    });
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
    const logger = c.get('log');
    logger.set({ error: 'wrong_password' });
    logger.warn(`Login failed from ${ip}`);
    throw createError({
      message: 'Invalid password',
      status: 401,
      why: 'The provided password does not match AUTH_PASSWORD',
      fix: 'Double check your AUTH_PASSWORD environment variable'
    });
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

  c.get('log').set({ success: true, fingerprint_provided: !!fingerprint });
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
