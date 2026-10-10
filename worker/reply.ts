import type { Refused } from '../shared/modelWire.js';
import type { Env } from './env.js';

/**
 * What every route is handed, and the few ways a route answers.
 */
export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  /** Null when SESSION_SECRET is missing: nobody can sign in, everything public works. */
  secret: string | null;
  /** Whether cookies go out with `Secure`: whenever the site is on https. */
  secure: boolean;
  /** Where Cloudflare places the request, as an ISO code; null when it does not say. */
  country: string | null;
  /** Work that may finish after the answer has gone: counters, cache, clean-up. */
  later(work: Promise<unknown>): void;
  /** Filled the first time a route asks who is there, so it is asked once per request. */
  account?: Promise<import('./auth.js').Account | null>;
}

/** Readable by any page anywhere: the plugin and web Blockbench fetch from here too. */
export const OPEN = { 'access-control-allow-origin': '*' } as const;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/**
 * A refusal, in words meant for a person.
 *
 * The page puts `error` on the screen as it is, so it is written as a sentence and
 * never as a code. "500" on a page is the same as saying nothing.
 *
 * Readable from anywhere, or the sentence never arrives: the plugin asks for an open
 * model's file without its key, and a browser hides a refusal that does not say it may
 * be read, leaving "Failed to fetch" in place of the reason. Nothing here depends on
 * who is asking — credentials are never allowed with `*`, so a browser will not pair
 * this with the site's cookie, and a page elsewhere reads only what anyone reads.
 */
export function refuse(status: number, error: string, extra: Omit<Refused, 'error'> = {}): Response {
  return json({ error, ...extra }, status, { ...OPEN });
}

/** Off to another page, setting cookies on the way. */
export function goTo(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * The largest JSON body any route takes.
 *
 * The biggest thing sent as JSON is a description of two thousand characters, which
 * is at most eight kilobytes in UTF-8; this leaves room and still stops a megabyte of
 * nonsense before it is parsed.
 */
const JSON_MAX = 64 * 1024;

/** The body as JSON, or a refusal to hand straight back. */
export async function bodyOf(c: Ctx): Promise<Record<string, unknown> | Response> {
  const length = Number(c.request.headers.get('content-length') ?? '0');
  if (length > JSON_MAX) return refuse(413, 'запрос слишком большой');
  try {
    const text = await c.request.text();
    if (text.length > JSON_MAX) return refuse(413, 'запрос слишком большой');
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(400, 'запрос в неверном виде');
    return body as Record<string, unknown>;
  } catch {
    return refuse(400, 'запрос в неверном виде');
  }
}

export function now(): string {
  return new Date().toISOString();
}
