import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { MEDIA_DIR } from './database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

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
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const SESSION_DURATION_HOURS = 24 * 7; // 7 days

export function createServer(db, monitor) {
  const app = new Hono();
  const wsClients = new Set();
  const password = process.env.AUTH_PASSWORD || 'changeme';
  const port = parseInt(process.env.WEB_PORT || '3000', 10);

  function broadcast(event, data) {
    const payload = JSON.stringify({ event, data });
    for (const ws of wsClients) {
      try { ws.send(payload); } catch {}
    }
  }

  function generateToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function safePath(baseDir, userPath) {
    const resolved = resolve(baseDir, userPath.replace(/^\/+/, ''));
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

  // --- Auth routes ---

  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json();
    const { password: pwd, fingerprint } = body;

    if (pwd !== password) {
      return c.json({ error: 'Invalid password' }, 401);
    }

    const token = generateToken();
    const expires = new Date(Date.now() + SESSION_DURATION_HOURS * 3600000);

    db.createSession(token, fingerprint || null, expires.toISOString());

    setCookie(c, 'session', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: SESSION_DURATION_HOURS * 3600,
    });

    return c.json({ ok: true });
  });

  app.post('/api/auth/logout', (c) => {
    const token = getCookie(c, 'session');
    if (token) db.deleteSession(token);
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/auth/verify', (c) => {
    const token = getCookie(c, 'session');
    if (!token) return c.json({ authenticated: false });

    const session = db.getSession(token);
    if (!session) return c.json({ authenticated: false });

    return c.json({
      authenticated: true,
      fingerprint: session.fingerprint,
    });
  });

  // --- Auth middleware for protected API ---

  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/auth/')) return next();

    const token = getCookie(c, 'session');
    if (!token) return c.json({ error: 'Unauthorized' }, 401);

    const session = db.getSession(token);
    if (!session) {
      deleteCookie(c, 'session', { path: '/' });
      return c.json({ error: 'Session expired' }, 401);
    }

    const fingerprint = c.req.header('X-Fingerprint');
    if (session.fingerprint) {
      if (!fingerprint || fingerprint !== session.fingerprint) {
        db.deleteSession(token);
        deleteCookie(c, 'session', { path: '/' });
        return c.json({ error: 'Fingerprint mismatch' }, 401);
      }
    }

    return next();
  });

  // --- API routes ---

  app.get('/api/status', (c) => {
    const stats = db.getStats();
    return c.json({
      connected: monitor.isReady(),
      myId: monitor.getMyId(),
      ...stats,
    });
  });

  app.get('/api/chats', (c) => {
    const chats = db.getChats();
    return c.json({ chats });
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
    return serveFile(filepath) || c.json({ error: 'Not found' }, 404);
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
    return c.json({ ok: true });
  });

  app.delete('/api/monitored/:chatId', (c) => {
    const chatId = decodeURIComponent(c.req.param('chatId'));
    db.removeMonitoredChat(chatId);
    return c.json({ ok: true });
  });

  app.get('/api/whatsapp/chats', async (c) => {
    const chats = await monitor.getWhatsAppChats();
    return c.json({ chats });
  });

  // --- Static files (SPA) ---

  app.get('/*', (c) => {
    const urlPath = new URL(c.req.url).pathname;
    const stripped = urlPath.startsWith('/whats/') ? urlPath.slice(6) : urlPath;

    if (stripped !== '/' && stripped.includes('.')) {
      const filePath = safePath(PUBLIC_DIR, stripped);
      if (filePath) {
        const file = serveFile(filePath);
        if (file) return file;
      }
    }

    return serveFile(join(PUBLIC_DIR, 'index.html')) || c.text('Not found', 404);
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
            return new Response('Unauthorized', { status: 401 });
          }
          const upgraded = server.upgrade(req, { data: { token } });
          return upgraded ? undefined : new Response('Upgrade failed', { status: 400 });
        }
        return app.fetch(req);
      },
      websocket: {
        open(ws) {
          wsClients.add(ws);
        },
        close(ws) {
          wsClients.delete(ws);
        },
        message() {},
      },
    });

    console.log(`Web server running on http://localhost:${port}`);
    return server;
  }

  return { start, broadcast };
}
