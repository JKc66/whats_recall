import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { existsSync } from 'fs';
import { join, dirname, extname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { MEDIA_DIR } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const COOKIE_PATH = '/whats/';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.bin': 'application/octet-stream',
};

const SESSION_DURATION_HOURS = 24 * 7; // 7 days
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 3;
const MAX_TRACKED_IPS = 10000;

function log(category, message, ...args) {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  console.log(`[${ts}] [${category}] ${message}`, ...args);
}

export function getClientIp(c) {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      const firstForwarded = forwarded.split(',')[0].trim();
      if (firstForwarded) {
        return firstForwarded;
      }
    }
    const realIp = c.req.header('x-real-ip');
    if (realIp) {
      const trimmedRealIp = realIp.trim();
      if (trimmedRealIp) {
        return trimmedRealIp;
      }
    }
  }
  try {
    return c.env?.remoteAddress || c.req.raw?.socket?.remoteAddress || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

export function createServer(db, monitor) {
  const app = new Hono();
  const wsClients = new Set();

  let password = process.env.AUTH_PASSWORD;
  if (!password || password === 'changeme') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    password = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    log('SECURITY', '=======================================================');
    log('SECURITY', '⚠️  WARNING: Using default or empty AUTH_PASSWORD');
    log('SECURITY', `⚠️  A random secure password has been generated: ${password}`);
    log('SECURITY', '⚠️  Please set AUTH_PASSWORD in your .env file!');
    log('SECURITY', '=======================================================');
  }

  const port = parseInt(process.env.WEB_PORT || '3000', 10);

  const loginAttempts = new Map(); // ip -> { count, firstAttempt }
  const apiRateLimits = new Map(); // ip:path -> { count, firstAttempt }

  function pruneLoginAttempts() {
    const now = Date.now();
    for (const [ip, entry] of loginAttempts) {
      if (now - entry.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
    }
  }

  const pruneInterval = setInterval(pruneLoginAttempts, 60_000);

  function isRateLimited(ip) {
    const entry = loginAttempts.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
      return false;
    }
    return entry.count >= MAX_LOGIN_ATTEMPTS;
  }

  function recordLoginAttempt(ip) {
    if (loginAttempts.size >= MAX_TRACKED_IPS) pruneLoginAttempts();
    const entry = loginAttempts.get(ip);
    if (!entry || Date.now() - entry.firstAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
    } else {
      entry.count++;
    }
  }

  function resetLoginAttempts(ip) {
    loginAttempts.delete(ip);
  }

  function checkApiRateLimit(ip, path, limit = 60, windowMs = 60_000) {
    const key = `${ip}:${path}`;
    const entry = apiRateLimits.get(key);
    const now = Date.now();
    if (!entry || now - entry.firstAttempt > windowMs) {
      apiRateLimits.set(key, { count: 1, firstAttempt: now });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  }

  const pruneApiRateLimits = () => {
    const now = Date.now();
    for (const [key, entry] of apiRateLimits) {
      if (now - entry.firstAttempt > 600_000) apiRateLimits.delete(key);
    }
  };
  setInterval(pruneApiRateLimits, 600_000);

  function broadcast(event, data) {
    const payload = JSON.stringify({ event, data });
    const clientCount = wsClients.size;
    if (clientCount > 0) {
      log('WS', `Broadcasting "${event}" to ${clientCount} client(s)`);
    }
    for (const ws of wsClients) {
      try { ws.send(payload); } catch (err) {
        log('WS', `Failed to send to client: ${err.message}`);
      }
    }
  }

  const WS_PING_INTERVAL = 25_000;
  const pingInterval = setInterval(() => {
    const ping = JSON.stringify({ event: 'ping', data: Date.now() });
    for (const ws of wsClients) {
      try { ws.send(ping); } catch { /* client will be cleaned up on close */ }
    }
  }, WS_PING_INTERVAL);

  function generateToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function safePath(baseDir, userPath) {
    const decodedPath = decodeURIComponent(userPath);
    const base = resolve(baseDir);
    const resolved = resolve(base, decodedPath.replace(/^\/+/, ''));
    // Ensure resolved path is within base and handle directory prefix bypass
    if (!resolved.startsWith(base + (base.endsWith('/') ? '' : '/'))) return null;
    return resolved;
  }

  function serveFile(filePath) {
    if (!existsSync(filePath)) return null;
    const file = Bun.file(filePath);
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    return new Response(file, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  function isAuthenticated(c) {
    const token = getCookie(c, 'session');
    if (!token) return false;
    const session = db.getSession(token);
    return !!session;
  }

  // --- Security headers ---

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://api.qrserver.com https://pps.whatsapp.net; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:;");
  });

  // --- Request logging ---

  app.use('*', async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    await next();

    const elapsed = Date.now() - start;
    const status = c.res.status;

    if (path.startsWith('/api/')) {
      log('HTTP', `${method} ${path} → ${status} (${elapsed}ms)`);
    }
  });

  // --- Auth routes ---

  app.post('/api/auth/login', async (c) => {
    const ip = getClientIp(c);

    if (isRateLimited(ip)) {
      log('AUTH', `Login rate-limited for IP ${ip}`);
      return c.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, 429);
    }

    const body = await c.req.json();
    const { password: pwd, fingerprint } = body;

    if (pwd !== password) {
      recordLoginAttempt(ip);
      const entry = loginAttempts.get(ip);
      const remaining = MAX_LOGIN_ATTEMPTS - (entry?.count || 0);
      log('AUTH', `Login failed from ${ip} (${remaining} attempts remaining)`);
      return c.json({ error: `Invalid password${remaining > 0 ? ` (${remaining} attempts remaining)` : ''}` }, 401);
    }

    resetLoginAttempts(ip);
    const token = generateToken();
    const expires = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);

    db.createSession(token, fingerprint || null, expires.toISOString());

    setCookie(c, 'session', token, {
      path: COOKIE_PATH,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: SESSION_DURATION_HOURS * 3600,
    });

    if (fingerprint) {
      setCookie(c, 'fp', fingerprint, {
        path: COOKIE_PATH,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: SESSION_DURATION_HOURS * 3600,
      });
    }

    log('AUTH', `Login success from ${ip}, fingerprint: ${fingerprint ? 'yes' : 'none'}`);
    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, 'session');
    if (token) {
      db.deleteSession(token);
      log('AUTH', 'Session invalidated on logout');
    }
    deleteCookie(c, 'session', { path: COOKIE_PATH });
    deleteCookie(c, 'fp', { path: COOKIE_PATH });
    return c.json({ ok: true });
  });

  app.get('/api/auth/verify', (c) => {
    const token = getCookie(c, 'session');
    if (!token) {
      log('AUTH', 'Verify: no session cookie');
      return c.json({ authenticated: false });
    }

    const session = db.getSession(token);
    if (!session) {
      log('AUTH', 'Verify: session expired or invalid');
      return c.json({ authenticated: false });
    }

    log('AUTH', 'Verify: session valid');
    return c.json({
      authenticated: true,
      fingerprint: session.fingerprint,
    });
  });

  // --- Auth routes (Public) ---

  // --- Auth middleware for protected API ---

  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) return next();

    const token = getCookie(c, 'session');
    if (!token) {
      log('AUTH', `Unauthorized: no session cookie for ${c.req.path}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = db.getSession(token);
    if (!session) {
      log('AUTH', `Unauthorized: invalid/expired session for ${c.req.path}`);
      deleteCookie(c, 'session', { path: COOKIE_PATH });
      return c.json({ error: 'Session expired' }, 401);
    }

    if (session.fingerprint) {
      const isMediaRequest = c.req.path.startsWith('/api/media/');
      const fingerprint = isMediaRequest
        ? getCookie(c, 'fp')
        : c.req.header('X-Fingerprint');

      if (!fingerprint || fingerprint !== session.fingerprint) {
        log('AUTH', `Unauthorized: fingerprint mismatch for ${c.req.path} (expected: ${session.fingerprint?.slice(0, 8)}…, got: ${fingerprint?.slice(0, 8) || 'none'}…)`);
        db.deleteSession(token);
        deleteCookie(c, 'session', { path: COOKIE_PATH });
        deleteCookie(c, 'fp', { path: COOKIE_PATH });
        return c.json({ error: 'Fingerprint mismatch' }, 401);
      }
    }

    return next();
  });

  // --- Protected Settings routes ---

  const ALLOWED_SETTING_KEYS = ['whatsapp_phone', 'whatsapp_notify', 'whatsapp_pairing_method'];

  app.get('/api/settings', (c) => {
    return c.json(db.getSettings());
  });

  app.post('/api/settings/update', async (c) => {
    const body = await c.req.json();
    const { key, value } = body;
    if (!key || !ALLOWED_SETTING_KEYS.includes(key)) {
      log('API', `Unauthorized setting update attempt: ${key}`);
      return c.json({ error: 'Invalid or unauthorized setting key' }, 400);
    }

    db.updateSetting(key, String(value));
    log('API', `Setting updated: ${key} = ${value}`);
    return c.json({ ok: true });
  });

  // --- API routes ---

  app.get('/api/status', (c) => {
    const s = db.getStats();
    const status = {
      connected: monitor.isReady(),
      authenticated: monitor.isAuthenticated(),
      myId: monitor.getMyId(),
      notifyEnabled: monitor.getNotifyEnabled(),
      ...s,
    };
    return c.json(status);
  });

  app.post('/api/whatsapp/reset', async (c) => {
    await monitor.resetWhatsAppSession();
    return c.json({ ok: true });
  });

  app.get('/api/whatsapp/pairing', (c) => {
    return c.json(monitor.getPairingStatus());
  });

  app.get('/api/settings/notify', (c) => {
    return c.json({ enabled: monitor.getNotifyEnabled() });
  });

  app.post('/api/settings/notify', async (c) => {
    const { enabled } = await c.req.json();
    monitor.setNotifyEnabled(enabled);
    log('API', `Notification forwarding set to: ${!!enabled}`);
    return c.json({ ok: true, enabled: monitor.getNotifyEnabled() });
  });

  app.get('/api/chats', (c) => {
    const chats = db.getChats();
    return c.json({ chats });
  });

  app.post('/api/chats/:chatId/read', (c) => {
    const chatId = decodeURIComponent(c.req.param('chatId'));
    db.markChatDeletedAsSeen(chatId);
    return c.json({ ok: true });
  });

  app.get('/api/chats/:chatId/messages', (c) => {
    const chatId = decodeURIComponent(c.req.param('chatId'));
    const limit = parseInt(c.req.query('limit') || '200', 10);
    const before = c.req.query('before') ? parseInt(c.req.query('before'), 10) : null;
    const messages = db.getMessages(chatId, limit, before);
    return c.json({ messages, hasMore: messages.length === limit });
  });

  app.get('/api/deleted', (c) => {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const messages = db.getDeletedMessages(limit);
    return c.json({ messages });
  });

  app.get('/api/search', (c) => {
    const ip = getClientIp(c);
    if (!checkApiRateLimit(ip, 'search', 30, 60_000)) {
      log('API', `Search rate-limited for ${ip}`);
      return c.json({ error: 'Too many search requests. Please wait a minute.' }, 429);
    }
    const query = c.req.query('q') || '';
    if (query.length < 2) return c.json({ messages: [] });
    const messages = db.searchMessages(query);
    return c.json({ messages });
  });

  app.get('/api/media/:filename', (c) => {
    const filename = basename(c.req.param('filename'));
    const filepath = safePath(MEDIA_DIR, filename);
    if (!filepath) return c.json({ error: 'Invalid path' }, 400);
    if (!existsSync(filepath)) return c.json({ error: 'Not found' }, 404);

    const ext = extname(filepath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    const file = Bun.file(filepath);
    return new Response(file, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  });

  // --- Monitored chats ---

  app.get('/api/monitored', (c) => {
    const monitored = db.getMonitoredChats();
    return c.json({ monitored });
  });

  app.post('/api/monitored', async (c) => {
    const { chatId, name, isGroup } = await c.req.json();
    if (!chatId) return c.json({ error: 'chatId required' }, 400);
    db.addMonitoredChat(chatId, name || chatId, !!isGroup);
    log('API', `Added monitored chat: ${name || chatId}`);
    return c.json({ ok: true });
  });

  app.delete('/api/monitored/:chatId', (c) => {
    const chatId = decodeURIComponent(c.req.param('chatId'));
    db.removeMonitoredChat(chatId);
    log('API', `Removed monitored chat: ${chatId}`);
    return c.json({ ok: true });
  });

  app.delete('/api/data', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (body.password !== password) {
      log('API', 'Clear data rejected: wrong password');
      return c.json({ error: 'Password required to confirm data deletion' }, 403);
    }
    await db.clearAllData();
    log('API', 'All messages and chat data cleared');
    return c.json({ ok: true });
  });

  app.get('/api/whatsapp/chats', async (c) => {
    const chats = await monitor.getWhatsAppChats();
    return c.json({ chats });
  });

  // --- Static files (SPA) ---

  app.get('/*', (c) => {
    const urlPath = c.req.path;

    if (urlPath !== '/' && urlPath.includes('.')) {
      let p = urlPath;
      if (p.startsWith(COOKIE_PATH)) {
        p = p.slice(COOKIE_PATH.length - 1);
      }

      const filePath = safePath(PUBLIC_DIR, p);
      if (filePath) {
        const file = serveFile(filePath);
        if (file) return file;
      }
    }

    const indexHtml = serveFile(join(PUBLIC_DIR, 'index.html'));
    if (indexHtml) return indexHtml;

    return c.text('Not found', 404);
  });

  // --- Start server ---

  function start() {
    db.cleanExpiredSessions();

    function getSessionFromCookie(req) {
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      return match ? match[1] : null;
    }

    const server = Bun.serve({
      port,
      fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname === '/ws') {
          const token = getSessionFromCookie(req);
          if (!token || !db.getSession(token)) {
            log('WS', `WebSocket upgrade rejected: ${token ? 'invalid session' : 'no session cookie'}`);
            return new Response('Unauthorized', { status: 401 });
          }
          const upgraded = server.upgrade(req, { data: { token } });
          if (!upgraded) {
            log('WS', 'WebSocket upgrade failed');
            return new Response('Upgrade failed', { status: 400 });
          }
          return undefined;
        }
        return app.fetch(req);
      },
      websocket: {
        open(ws) {
          wsClients.add(ws);
          log('WS', `Client connected (total: ${wsClients.size})`);
        },
        close(ws) {
          wsClients.delete(ws);
          log('WS', `Client disconnected (total: ${wsClients.size})`);
        },
        message() { },
      },
    });

    log('SERVER', `Web server running on http://localhost:${port}`);
    log('SERVER', `Environment: ${process.env.NODE_ENV || 'development'}`);
    log('SERVER', `Cookie path: ${COOKIE_PATH}`);
    log('SERVER', `Public dir: ${PUBLIC_DIR}`);
    return server;
  }

  function stop() {
    clearInterval(pingInterval);
    clearInterval(pruneInterval);
  }

  return { start, broadcast, stop };
}
