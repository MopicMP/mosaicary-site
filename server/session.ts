import { sign, unsign } from './sign.js';

/**
 * Who the person sending a request is, kept in one cookie.
 *
 * <h2>Why a cookie and not a header</h2>
 *
 * Because the mod is going to use a token in a header and the browser is going to
 * use a cookie, and those two want opposite things. A cookie is sent by the browser
 * whether or not the page remembered to — which is what makes a login survive a
 * closed tab, and which is also exactly why it needs {@code SameSite}. A header is
 * sent only when asked, which is right for a program and hopeless for a page.
 *
 * <h2>The three flags, and what each one is for</h2>
 *
 * <ul>
 *   <li>{@code HttpOnly} — script cannot read it. One cross-site script on the page
 *       stops being "somebody's session is gone" and becomes nothing at all.</li>
 *   <li>{@code Secure} — never sent unencrypted. Off when working locally, because
 *       there is no certificate on a laptop and the alternative is not being able
 *       to log in at all while developing.</li>
 *   <li>{@code SameSite=Lax} — another site cannot make your browser send it along
 *       with a request it wrote. Lax rather than Strict because the return from
 *       Discord is a navigation from another origin and Strict drops the cookie on
 *       exactly that hop, which is the one that has to work.</li>
 * </ul>
 */

export const SESSION_COOKIE = 'npc_session';
export const STATE_COOKIE = 'npc_state';

/** How long a session lasts. Long, because signing in is the friction. */
export const SESSION_DAYS = 30;

/** How long the return from Discord has to happen in. Minutes, not days. */
export const STATE_MINUTES = 10;

/**
 * The value of the session cookie: who, until when, signed.
 *
 * The expiry is inside the signature and not only on the cookie. A cookie's own
 * expiry is a note to the browser and nothing more — the browser is the thing being
 * distrusted here, and a session that is only as good as the client's word about
 * when it ran out is not a session.
 */
export function makeSession(secret: string, user: string, now = Date.now()): string {
  const until = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return sign(secret, `${user}~${until}`);
}

/** Whose session this is, or nothing if it was tampered with, malformed or old. */
export function readSession(secret: string, raw: string | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  const text = unsign(secret, raw);
  if (!text) return null;
  const split = text.lastIndexOf('~');
  if (split < 1) return null;
  const until = Number(text.slice(split + 1));
  if (!Number.isFinite(until) || until <= now) return null;
  return text.slice(0, split);
}

/**
 * Where the person was when they pressed "sign in", carried through Discord.
 *
 * Signed, and only ever a path within this site. Whatever comes back from a
 * redirect is written by whoever sent the person there — an unchecked "where to go
 * next" is how a login page becomes a way of forwarding people somewhere else with
 * the site's name in the address bar.
 */
export function makeState(secret: string, back: string, now = Date.now()): string {
  const until = now + STATE_MINUTES * 60 * 1000;
  return sign(secret, `${homely(back)}~${until}`);
}

export function readState(secret: string, raw: string | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  const text = unsign(secret, raw);
  if (!text) return null;
  const split = text.lastIndexOf('~');
  if (split < 0) return null;
  const until = Number(text.slice(split + 1));
  if (!Number.isFinite(until) || until <= now) return null;
  return homely(text.slice(0, split));
}

/**
 * A path on this site, whatever was handed in.
 *
 * Anything that is not one plain absolute path becomes the front page. `//evil.com`
 * is the case worth naming: it starts with a slash, it looks like a path, and every
 * browser reads it as another host.
 */
export function homely(where: string): string {
  if (!where.startsWith('/') || where.startsWith('//') || where.includes('\\')) return '/';
  return where;
}

export function bake(
  name: string,
  value: string,
  seconds: number,
  secure: boolean,
): string {
  const bits = [
    // Encoded going out and decoded coming back in, which is what every cookie
    // library does and what the browser expects. A path is carried in here, and a
    // path is allowed to hold a comma or a semicolon — either of which ends the
    // cookie early and leaves a value that is silently half of what was set.
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${seconds}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}
