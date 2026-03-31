import { resolve } from 'path';

export function safePath(baseDir: string, userPath: string): string | null {
  if (!userPath || userPath === '.' || userPath === '..') return null;
  if (userPath.includes('\0')) return null;
  try {
    const decodedPath = decodeURIComponent(userPath);
    if (decodedPath.includes('\0')) return null;
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

export function getClientIp(c: any): string {
  let remoteAddress = '127.0.0.1';
  try {
    const rawIp = c.env?.remoteAddress || c.req.raw?.socket?.remoteAddress || '127.0.0.1';
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
