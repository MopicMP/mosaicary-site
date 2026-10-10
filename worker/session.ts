import { sign, unsign } from './sign.js';

/**
 * Who the person sending a request is, kept in one cookie.
 *
 * `HttpOnly` so a script on the page cannot read it, `Secure` whenever the site is on
 * https, and `SameSite=Lax` so another site cannot make the browser send it with a
 * request that site wrote. Lax rather than Strict because the return from Discord or
 * GitHub is a navigation from another origin, and Strict drops the cookie on exactly
 * the hop that has to work.
 */

export const SESSION_COOKIE = 'session';
export const STATE_COOKIE = 'login_state';

/** How long a session lasts. Long, because signing in is the friction. */
export const SESSION_DAYS = 30;

/** How long the return from the provider has to happen in. Minutes, not days. */
export const STATE_MINUTES = 10;

/**
 * The value of the session cookie: who, until when, signed.
 *
 * The expiry is inside the signature and not only on the cookie. A cookie's own expiry
 * is a note to the browser, and the browser is the thing being distrusted here.
 */
export function makeSession(secret: string, user: string, now = Date.now()): Promise<string> {
  const until = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return sign(secret, `${user}~${until}`);
}

export async function readSession(
  secret: string,
  raw: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!raw) return null;
  const text = await unsign(secret, raw);
  if (!text) return null;
  const split = text.lastIndexOf('~');
  if (split < 1) return null;
  const until = Number(text.slice(split + 1));
  if (!Number.isFinite(until) || until <= now) return null;
  return text.slice(0, split);
}

/**
 * Which provider the trip went to and where the person was when they set off, signed.
 *
 * The provider is inside so that a state made for Discord cannot be replayed at the
 * GitHub callback; the place is only ever a path within this site, because an
 * unchecked "where to go next" turns a login page into a way of forwarding people
 * anywhere with this site's name in the address bar.
 */
export function makeState(secret: string, provider: string, back: string, now = Date.now()): Promise<string> {
  const until = now + STATE_MINUTES * 60 * 1000;
  return sign(secret, `${provider}~${homely(back)}~${until}`);
}

export async function readState(
  secret: string,
  provider: string,
  raw: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!raw) return null;
  const text = await unsign(secret, raw);
  if (!text) return null;
  const first = text.indexOf('~');
  const last = text.lastIndexOf('~');
  if (first < 1 || last <= first) return null;
  if (text.slice(0, first) !== provider) return null;
  const until = Number(text.slice(last + 1));
  if (!Number.isFinite(until) || until <= now) return null;
  return homely(text.slice(first + 1, last));
}

/** Stands in for this site while a path is read: a name that can never be anybody's host. */
const HOME = 'https://home.invalid';

/**
 * A path on this site, whatever was handed in.
 *
 * `//evil.com` is the case worth naming: it starts with a slash, it looks like a path,
 * and every browser reads it as another host. It is not the only spelling of it.
 * A browser drops tabs and line breaks from an address before reading it, so
 * `/<tab>/evil.com` is `//evil.com` by the time it is followed, and it reads `\` as
 * `/`. Listing such spellings is a race against the address parser, so the path is
 * read by that parser instead, and kept only if it is still on this site afterwards.
 * What comes out is the parser's own spelling, which also has no line break left in
 * it to break the header it is put into.
 */
export function homely(where: string): string {
  if (!where.startsWith('/')) return '/';
  let url: URL;
  try {
    url = new URL(where, HOME);
  } catch {
    return '/';
  }
  if (url.origin !== HOME) return '/';
  return url.pathname + url.search + url.hash;
}

export function bake(name: string, value: string, seconds: number, secure: boolean): string {
  const bits = [
    // Encoded going out and decoded coming back in. A path is carried in here, and a
    // path may hold a semicolon, which would end the cookie early.
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${seconds}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

/** One cookie out of a request's header. */
export function cookieOf(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
