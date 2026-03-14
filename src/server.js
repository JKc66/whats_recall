import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { readFileSync, existsSync } from 'fs';
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

function log(category, message, ...args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [${category}] ${message}`, ...args);
}

export function createServer(db, monitor) {
  const app = new Hono();
  const wsClients = new Set();
  const password = process.env.AUTH_PASSWORD || 'changeme';
  const port = parseInt(process.env.WEB_PORT || '3000', 10);

  function getClientIp(c) {
    const cloudflareIp = c.req.header('cf-connecting-ip');
    if (cloudflareIp) return cloudflareIp.trim();
    const realIp = c.req.header('x-real-ip');
    if (realIp) return realIp.trim();
    if (process.env.TRUST_X_FORWARDED_FOR === 'true') {
      const forwarded = c.req.header('x-forwarded-for');
      if (forwarded) return forwarded.split(',')[0].trim();
    }
    try { return c.env?.remoteAddress || c.req.raw?.socket?.remoteAddress || '127.0.0.1'; } catch { return '127.0.0.1'; }
  }

  function pruneLoginAttempts() {
    db.pruneLoginAttempts(LOGIN_WINDOW_MS);
  }

  const pruneInterval = setInterval(pruneLoginAttempts, 60_000);

  function isRateLimited(ip) {
    return db.isLoginRateLimited(ip, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
  }

  function recordLoginAttempt(ip) {
    db.recordFailedLoginAttempt(ip, LOGIN_WINDOW_MS);
  }

  function resetLoginAttempts(ip) {
    db.resetLoginAttempts(ip);
  }

  async function parseJsonBody(c) {
    try {
      return await c.req.json();
    } catch {
      return null;
    }
  }

  function parseCookies(cookieHeader) {
    const out = {};
    if (!cookieHeader) return out;
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (!rawKey || rest.length === 0) continue;
      out[rawKey] = decodeURIComponent(rest.join('='));
    }
    return out;
  }

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
    const resolved = resolve(baseDir, decodedPath.replace(/^\/+/, ''));
    if (!resolved.startsWith(resolve(baseDir))) return null;
    return resolved;
  }

  function serveFile(filePath) {
    if (!existsSync(filePath)) return null;
    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    return new Response(content, { headers: { 'Content-Type': mime } });
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
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; form-action 'self'"
    );
    const forwardedProto = c.req.header('x-forwarded-proto');
    const isHttps = forwardedProto === 'https' || new URL(c.req.url).protocol === 'https:';
    if (isHttps) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
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

    const body = await parseJsonBody(c);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const pwd = typeof body.password === 'string' ? body.password : '';
    const fingerprint = typeof body.fingerprint === 'string' ? body.fingerprint : null;

    if (pwd !== password) {
      recordLoginAttempt(ip);
      log('AUTH', `Login failed from ${ip}`);
      return c.json({ error: 'Invalid password' }, 401);
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

  app.get('/api/settings/notify', (c) => {
    return c.json({ enabled: monitor.getNotifyEnabled() });
  });

  app.post('/api/settings/notify', async (c) => {
    const body = await parseJsonBody(c);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const enabled = !!body.enabled;
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
    let mime = MIME_TYPES[ext] || 'application/octet-stream';

    const content = readFileSync(filepath);
    return new Response(content, {
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
    const body = await parseJsonBody(c);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const chatId = typeof body.chatId === 'string' ? body.chatId : '';
    const name = typeof body.name === 'string' ? body.name : chatId;
    const isGroup = !!body.isGroup;
    if (!chatId) return c.json({ error: 'chatId required' }, 400);
    db.addMonitoredChat(chatId, name || chatId, isGroup);
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
      const filePath = safePath(PUBLIC_DIR, urlPath);
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

    const server = Bun.serve({
      port,
      fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname === '/ws') {
          const cookies = parseCookies(req.headers.get('cookie') || '');
          const token = cookies.session || null;
          if (!token) {
            log('WS', `WebSocket upgrade rejected: ${token ? 'invalid session' : 'no session cookie'}`);
            return new Response('Unauthorized', { status: 401 });
          }

          const session = db.getSession(token);
          if (!session) {
            log('WS', 'WebSocket upgrade rejected: invalid session');
            return new Response('Unauthorized', { status: 401 });
          }
          if (session.fingerprint) {
            const fp = cookies.fp || null;
            if (!fp || fp !== session.fingerprint) {
              log('WS', 'WebSocket upgrade rejected: fingerprint mismatch');
              db.deleteSession(token);
              return new Response('Unauthorized', { status: 401 });
            }
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
        message() {},
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
