import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { log } from '../logger.ts';
import auth from './auth.ts';
import { authMiddleware } from './middleware.ts';
import chats from './chats.ts';
import monitored from './monitored.ts';
import settings from './settings.ts';
import whatsappRouter from './whatsapp.ts';
import { join, basename, dirname } from 'path';
import { getMediaDir, getDb } from '../db/database.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';
import { BroadcastEvent } from '../types.ts';
import { safePath, pruneApiRateLimits, verifySession } from './utils.ts';

const PUBLIC_DIR = './public';

export function createHonoServer(client: WhatsAppConnection) {
  const password = process.env.AUTH_PASSWORD;
  if (!password || password === 'changeme') {
    log('SECURITY', '=======================================================');
    log('SECURITY', '❌ FATAL: AUTH_PASSWORD is not set or is set to default');
    log('SECURITY', '   Please set a secure AUTH_PASSWORD in your .env file');
    log('SECURITY', '   The server will not start without a secure password.');
    log('SECURITY', '=======================================================');
    process.exit(1);
  }

  const app = new Hono();

  // Security headers middleware
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Content-Security-Policy', "default-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://api.qrserver.com https://pps.whatsapp.net; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' ws: wss:;");
  });

  // CORS for cross-port development (e.g. Vite on 5173, Backend on 3001)
  app.use('*', cors({
    origin: (origin) => {
      // Allow development environment origins to connect
      if (process.env.NODE_ENV === 'development') return origin || '*';
      // Disallow overly permissive CORS in production by default
      return '';
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Fingerprint', 'X-Auth-Token'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
  }));

  const wsClients = new Set<any>();

  // Logging Middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    if (!c.req.path.startsWith('/ws')) {
      const safePath = c.req.path.replace(/[\n\r]/g, '');
      log('HTTP', `${c.req.method} ${safePath} - ${c.res.status} (${ms}ms)`);
    }
  });

  // Periodic cleanup
  setInterval(() => {
    const db = getDb();
    db.cleanExpiredSessions();
    pruneApiRateLimits();
  }, 600_000).unref();

  // API Routes
  const api = new Hono();
  api.route('/auth', auth);
  api.use('*', authMiddleware as any);
  api.route('/chats', chats);
  api.route('/monitored', monitored(client));
  api.route('/settings', settings);
  api.route('/whatsapp', whatsappRouter(client));

  api.get('/media/:filename{.*}', async (c) => {
    const filename = c.req.param('filename');
    const mediaDir = getMediaDir();
    const filepath = safePath(mediaDir, filename);
    if (!filepath) {
      return c.json({ error: 'Invalid path' }, 400);
    }

    const file = Bun.file(filepath);
    if (!(await file.exists())) return c.notFound();
    return c.body(await file.arrayBuffer(), 200, {
      'Content-Type': file.type,
      'Cache-Control': 'public, max-age=86400'
    });
  });

  api.get('/status', async (c) => {
    const db = getDb();
    const stats = db.getStats();
    return c.json({
      ...stats,
      connected: client.isReady,
      authenticated: client.isAuthenticated,
      myId: client.myId,
      notifyEnabled: db.getSettings().whatsapp_notify === 'true'
    });
  });

  api.delete('/data', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (body.password !== password) {
      log('API', 'Clear data rejected: wrong password');
      return c.json({ error: 'Password required to confirm data deletion' }, 403);
    }
    const db = getDb();
    await db.clearAllData(true);
    log('API', 'All messages and chat data cleared');
    return c.json({ ok: true });
  });

  app.route('/api', api);

  // Static files middleware first
  app.use('/*', serveStatic({ root: './public' }));

  // SPA fallback - catch any remaining routes and serve index.html
  app.get('*', async (c, next) => {
    // Avoid catching API or WS routes
    const path = c.req.path;
    if (path.startsWith('/api') || path.startsWith('/ws')) return next();

    // Avoid catching assets that might be missing (to avoid recursion or MIME errors)
    if (path.includes('.') && !path.endsWith('.html')) return next();

    const publicDir = process.env.PUBLIC_DIR || './public';
    const indexFile = Bun.file(join(publicDir, 'index.html'));
    
    if (await indexFile.exists()) {
      return c.html(await indexFile.text());
    }
    return c.text('Not Found', 404);
  });

  const broadcast = (event: BroadcastEvent, data: any) => {
    const payload = JSON.stringify({ event, data });
    const count = wsClients.size;
    if (count > 0 && event !== 'status') {
      log('WS', `Broadcasting "${event}" to ${count} client(s)`);
    }
    for (const ws of wsClients) {
      try {
        (ws as any).send(payload);
      } catch { /* handled by close */ }
    }
  };

  const start = () => {
    const port = parseInt(process.env.WEB_PORT || '3000', 10);

    const bunServer = Bun.serve({
      port,
      fetch: async (req: Request, server: any) => {
        const url = new URL(req.url);
        if (url.pathname === '/ws') {
          const db = getDb();
          const cookieHeader = req.headers.get('Cookie') || '';
          const token = cookieHeader.match(/auth_token=([^;]+)/)?.[1] || req.headers.get('X-Auth-Token') || undefined;
          const fingerprint = req.headers.get('X-Fingerprint') || cookieHeader.match(/auth_fp=([^;]+)/)?.[1] || undefined;

          const { authenticated, error } = verifySession(db, token, fingerprint);
          if (!authenticated) return new Response(error, { status: 401 });

          const upgraded = server.upgrade(req);
          if (upgraded) return undefined;
        }
        return app.fetch(req);
      },
      websocket: {
        open: (ws: any) => {
          wsClients.add(ws);
          log('WS', `Client connected (total: ${wsClients.size})`);
        },
        close: (ws: any) => {
          wsClients.delete(ws);
          log('WS', `Client disconnected (total: ${wsClients.size})`);
        },
        message: () => { }
      }
    });

    // WS Ping Interval
    const WS_PING_INTERVAL = 25_000;
    setInterval(() => {
      const ping = JSON.stringify({ event: 'ping', data: Date.now() });
      for (const ws of wsClients) {
        try { (ws as any).send(ping); } catch { /* handled by close */ }
      }
    }, WS_PING_INTERVAL);

    log('SERVER', `Running on http://localhost:${port}`);
    return { bunServer, broadcast };
  }

  return { start, broadcast, app };
}
