import type { Context } from 'hono';
import { createError } from 'evlog';

/** Shared Hono body-limit options for mutation routes (POST/DELETE with JSON). */
export const mutationBodyLimit = {
  maxSize: 8192,
  onError: (c: Context) => c.json({ error: 'Payload too large' }, 413),
};

export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw createError({
      message: 'Invalid JSON payload',
      status: 400,
      why: 'The request body could not be parsed as JSON',
      fix: 'Ensure the Content-Type header is set to application/json',
    });
  }
}

/** Like readJsonBody but treats an empty body as `{}` (for POSTs that may omit a body). */
export async function readJsonBodyAllowEmpty(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw createError({
        message: 'Invalid JSON payload',
        status: 400,
        why: 'Expected a JSON object',
        fix: 'Send a JSON object body',
      });
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw createError({
        message: 'Invalid JSON payload',
        status: 400,
        why: 'The request body could not be parsed as JSON',
        fix: 'Ensure the Content-Type header is set to application/json',
      });
    }
    throw e;
  }
}
