import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { getDb } from '../db/database.ts';
import { verifySession } from './utils.ts';
import { createError } from 'evlog';

export async function authMiddleware(c: Context, next: Next) {
  const db = getDb();
  const path = c.req.path;
  if (path === '/api/auth/login' || path === '/api/auth/verify') {
    return await next();
  }

  const token = getCookie(c, 'auth_token') || c.req.header('X-Auth-Token');
  const fingerprint = c.req.header('X-Fingerprint') || getCookie(c, 'auth_fp');

  const { authenticated, error } = verifySession(db, token, fingerprint);

  if (!authenticated) {
    throw createError({
      message: 'Unauthorized',
      status: 401,
      why: error || 'Valid session token or fingerprint required',
      fix: 'Please log in again'
    });
  }

  await next();
}
