import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { log } from '../logger.ts';
import auth from './auth.ts';
import { authMiddleware } from './middleware.ts';
import chats from './chats.ts';
import monitored from './monitored.ts';
import settings from './settings.ts';
import whatsappRouter from './whatsapp.ts';
import { join } from 'path';
import { getMediaDir, getDb } from '../db/database.ts';
import { WhatsAppConnection } from '../whatsapp/connection.ts';
import { BroadcastEvent } from '../types.ts';
import { safePath, pruneApiRateLimits, verifySession, getClientIp } from './utils.ts';
import { mutationBodyLimit, readJsonBody } from './mutation-helpers.ts';
import { evlog, type EvlogVariables } from 'evlog/hono';
import { createError, parseError } from 'evlog';
import * as crypto_node from 'crypto';


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

  const app = new Hono<EvlogVariables>();

  // Global logging and wide events
  app.use('*', evlog({
    exclude: ['/ws', '/api/status', '/api/chats']
  }));

  // Context enrichment for logs
  app.use('*', async (c, next) => {
    const logger = c.get('log');
    if (logger) {
      logger.set({
        client: {
          ip: getClientIp(c),
          fingerprint: c.req.header('X-Fingerprint') || undefined,
        },
      });
    }
    await next();
  });

  // Security headers middleware
  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://api.qrserver.com', 'https://pps.whatsapp.net'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://static.cloudflareinsights.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    }
  }));

  // CORS for cross-port development (e.g. Vite on 5173, Backend on 3001)
  app.use('*', cors({
    origin: (origin) => process.env.NODE_ENV === 'development' ? origin || '*' : '',
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Fingerprint', 'X-Auth-Token'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
  }));

  const wsClients = new Set<any>();


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
  api.route('/chats', chats(client));
  api.route('/monitored', monitored(client));
  api.route('/settings', settings);
  api.route('/whatsapp', whatsappRouter(client));

  api.get('/media/:filename{.*}', async (c) => {
    const filename = c.req.param('filename');
    const mediaDir = getMediaDir();
    const filepath = safePath(mediaDir, filename);
    if (!filepath) {
      throw createError({
        message: 'Invalid path',
        status: 400,
        why: 'The requested media path is malformed or attempts traversal',
        fix: 'Check the filename parameter'
      });
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

  api.delete('/data', bodyLimit(mutationBodyLimit), async (c) => {
    const body = (await readJsonBody(c)) as { password?: unknown };

    if (body.password === undefined) {
       // if it's undefined, it's considered empty
       body.password = '';
    }

    if (typeof body.password !== 'string') {
      throw createError({
        message: 'Invalid password format',
        status: 400,
        why: 'The password provided is not a string',
        fix: 'Provide a valid string password'
      });
    }

    const serverPassword = password || '';
    const maxPasswordLength = Math.max(1024, serverPassword.length * 2);

    if (body.password.length > maxPasswordLength) {
      throw createError({
        message: 'Invalid password format',
        status: 400,
        why: 'The password provided is too long',
        fix: 'Provide a valid string password'
      });
    }

    const passwordBuffer = Buffer.from(body.password);
    const serverPasswordBuffer = Buffer.from(serverPassword);

    let isMatch = false;
    if (passwordBuffer.length === serverPasswordBuffer.length) {
      isMatch = crypto_node.timingSafeEqual(passwordBuffer, serverPasswordBuffer);
    } else {
      crypto_node.timingSafeEqual(serverPasswordBuffer, serverPasswordBuffer);
    }

    if (!isMatch) {
      log('API', 'Clear data rejected: wrong password');
      throw createError({
        message: 'Password required',
        status: 403,
        why: 'Wrong password provided for data wipe',
        fix: 'Provide the correct AUTH_PASSWORD'
      });
    }
    const db = getDb();
    await db.clearAllData(true);
    log('API', 'All messages and chat data cleared');
    return c.json({ ok: true });
  });

  app.route('/api', api);

  // Global Error Handler
  app.onError((error, c) => {
    const logger = c.get('log');
    if (logger) {
      logger.error(error);
    } else {
      log('SERVER', `Unhandled error: ${error.message}`);
    }

    const parsed = parseError(error);

    return c.json(
      {
        error: parsed.message, // Backward compatibility
        message: parsed.message,
        why: parsed.why,
        fix: parsed.fix,
        link: parsed.link,
      },
      (parsed.status as any) || 500,
    );
  });

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

          const upgraded = server.upgrade(req, {
            data: { token, fingerprint }
          });
          if (upgraded) return undefined;
        }
        return app.fetch(req);
      },
      websocket: {
        open: (ws: any) => {
          wsClients.add(ws);
        },
        close: (ws: any) => {
          wsClients.delete(ws);
        },
        message: () => { }
      }
    });

    // WS Ping Interval
    const WS_PING_INTERVAL = 25_000;
    setInterval(() => {
      const ping = JSON.stringify({ event: 'ping', data: Date.now() });
      const db = getDb();
      for (const ws of wsClients) {
        try {
          const token = ws.data?.token;
          const fingerprint = ws.data?.fingerprint;
          const { authenticated } = verifySession(db, token, fingerprint);
          if (!authenticated) {
            ws.close();
            continue;
          }
          (ws as any).send(ping);
        } catch { /* handled by close */ }
      }
    }, WS_PING_INTERVAL);

    log('SERVER', `Running on http://localhost:${port}`);
    return { bunServer, broadcast };
  }

  return { start, broadcast, app };
}
