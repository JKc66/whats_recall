import { resolve } from 'path';
import type { Context } from 'hono';

export type AuthSession = { fingerprint?: string };

export function safePath(baseDir: string, userPath: string): string | null {
  if (!userPath || userPath === '.' || userPath === '..') return null;
  if (userPath.includes('\0')) return null;
  
  // Block any path traversal attempts
  if (userPath.includes('..') || userPath.includes('\\')) return null;

  try {
    const decodedPath = decodeURIComponent(userPath);
    if (decodedPath.includes('\0') || decodedPath.includes('..') || decodedPath.includes('\\')) return null;
    
    const base = resolve(baseDir);
    const resolved = resolve(base, decodedPath.replace(/^\/+/, ''));

    // Ensure resolved path is strictly within base
    const baseWithSlash = base.endsWith('/') ? base : base + '/';
    if (!resolved.startsWith(baseWithSlash) && resolved !== base) return null;
    return resolved;
  } catch (_e) {
    return null;
  }
}

export function getClientIp(c: Context): string {
  let remoteAddress: string;
  try {
    const rawSocket = c.req.raw as { socket?: { remoteAddress?: string } } | undefined;
    const rawIp = (c.env as { remoteAddress?: string } | undefined)?.remoteAddress
      || rawSocket?.socket?.remoteAddress
      || '127.0.0.1';
    remoteAddress = rawIp.replace(/^::ffff:/, '');
  } catch (_e) {
    return '127.0.0.1';
  }

  if (process.env.TRUST_PROXY !== 'true') return remoteAddress;

  const trustedProxiesStr = process.env.TRUSTED_PROXIES || '';
  const trustedProxies = trustedProxiesStr.split(',').map((ip: string) => ip.trim()).filter(Boolean);

  // Secure validation: Only trust headers if the direct caller is a known proxy
  if (trustedProxies.length > 0 && !trustedProxies.includes(remoteAddress)) {
    return remoteAddress;
  }

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip: string) => ip.trim().replace(/^::ffff:/, ''));

    // Traverse from right to left, skipping trusted proxies
    for (let i = ips.length - 1; i >= 0; i--) {
      if (!trustedProxies.includes(ips[i])) {
        return ips[i];
      }
    }
    return ips[0] || remoteAddress;
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp.trim().replace(/^::ffff:/, '');

  return remoteAddress;
}

export const apiRateLimits = new Map<string, { count: number, firstAttempt: number }>();

export function checkApiRateLimit(ip: string, path: string, limit = 60, windowMs = 60_000): boolean {
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

export const pruneApiRateLimits = () => {
  const now = Date.now();
  for (const [key, entry] of apiRateLimits) {
    if (now - entry.firstAttempt > 600_000) apiRateLimits.delete(key);
  }
};

export function verifySession(
  db: { getSession: (token: string) => AuthSession | null | undefined },
  token: string | undefined,
  fingerprint: string | undefined,
): { authenticated: boolean; error?: string; session?: AuthSession } {
  if (!token) return { authenticated: false, error: 'Unauthorized' };

  const session = db.getSession(token);
  if (!session) {
    return { authenticated: false, error: 'Session expired or invalid' };
  }

  // Stricter fingerprint check: if session has a fingerprint, it MUST match
  if (session.fingerprint && fingerprint !== session.fingerprint) {
    return { authenticated: false, error: 'Fingerprint mismatch or missing' };
  }

  return { authenticated: true, session };
}
