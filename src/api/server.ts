import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { log } from '../logger.ts';
import auth from './auth.ts';
import { authMiddleware } from './middleware.ts';
import chats from './chats.ts';
import monitored from './monitored.ts';
import settings from './settings.ts';
import whatsappRouter from './whatsapp.ts';
import { join, basename } from 'path';
import { MEDIA_DIR, getDb } from '../db/database.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';
import { BroadcastEvent } from '../types.ts';
import { safePath } from './utils.ts';

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
  const wsClients = new Set<any>();

  // Logging Middleware
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    if (!c.req.path.startsWith('/ws')) {
      log('HTTP', `${c.req.method} ${c.req.path} - ${c.res.status} (${ms}ms)`);
    }
  });

  // API Routes
  const api = new Hono();
  api.use('*', authMiddleware as any);
  api.route('/auth', auth);
  api.route('/chats', chats);
  api.route('/monitored', monitored);
  api.route('/settings', settings);
  api.route('/whatsapp', whatsappRouter(client));

  api.get('/media/:filename', async (c) => {
    const filename = basename(c.req.param('filename'));
    const filepath = safePath(MEDIA_DIR, filename);
    if (!filepath) return c.json({ error: 'Invalid path' }, 400);

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

  app.route('/api', api);

  // Static files and SPA fallback
  app.use('/*', serveStatic({ root: './public' }));
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api') || c.req.path.startsWith('/ws')) return next();
    const indexFile = Bun.file(join(PUBLIC_DIR, 'index.html'));
    if (await indexFile.exists()) {
      return c.html(await indexFile.text());
    }
    return c.text('Not Found', 404);
  });

  const broadcast = (event: BroadcastEvent, data: any) => {
    const payload = JSON.stringify({ event, data });
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
      fetch: (req: Request, server: any) => {
        if (new URL(req.url).pathname === '/ws') {
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

    log('SERVER', `Running on http://localhost:${port}`);
    return { bunServer, broadcast };
  }

  return { start, broadcast };
}
