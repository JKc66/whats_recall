import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb } from '../db/database.ts';
import { getClientIp } from './utils.ts';
import { log } from '../logger.ts';

const db = getDb();
const auth = new Hono();

const startTime = Date.now();
const SESSION_DURATION_HOURS = 24 * 7; // 7 days

// Login attempt tracking
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 3;
const loginAttempts = new Map<string, { count: number, firstAttempt: number }>();

const isExpired = (entry: { firstAttempt: number }, now = Date.now()) => now - entry.firstAttempt > LOGIN_WINDOW_MS;

function pruneLoginAttempts() {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (isExpired(entry, now)) loginAttempts.delete(ip);
  }
}

setInterval(pruneLoginAttempts, 60_000);

auth.get('/uptime', (c) => {
  return c.json({ uptime: Math.floor((Date.now() - startTime) / 1000) });
});

auth.post('/login', async (c) => {
  const ip = getClientIp(c);
  const entry = loginAttempts.get(ip);
  
  if (entry && !isExpired(entry) && entry.count >= MAX_LOGIN_ATTEMPTS) {
    log('AUTH', `Login rate-limited for IP ${ip}`);
    return c.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, 429);
  }

  const { password, fingerprint } = await c.req.json();
  const serverPassword = process.env.AUTH_PASSWORD;

  if (password !== serverPassword) {
    if (!entry || isExpired(entry)) {
      loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
    } else {
      entry.count++;
    }
    const currentCount = loginAttempts.get(ip)?.count || 0;
    const remaining = MAX_LOGIN_ATTEMPTS - currentCount;
    log('AUTH', `Login failed from ${ip} (${remaining} attempts remaining)`);
    return c.json({ error: `Invalid password${remaining > 0 ? ` (${remaining} attempts remaining)` : ''}` }, 401);
  }

  // Success: reset attempts
  loginAttempts.delete(ip);

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
  const token = getCookie(c, 'auth_token') || c.req.header('X-Auth-Token');
  const fingerprint = c.req.header('X-Fingerprint') || getCookie(c, 'auth_fp');

  if (!token) return c.json({ authenticated: false });

  const session = db.getSession(token) as any;
  if (!session || (session.fingerprint && session.fingerprint !== fingerprint)) {
    return c.json({ authenticated: false });
  }

  return c.json({ 
    authenticated: true,
    fingerprint: session.fingerprint 
  });
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, 'auth_token');
  if (token) db.deleteSession(token);
  deleteCookie(c, 'auth_token');
  return c.json({ success: true });
});

export default auth;
