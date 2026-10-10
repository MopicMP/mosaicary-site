import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authRoutes } from '../server/auth.js';
import { migrate, open, type Db } from '../server/db.js';
import { SESSION_COOKIE, STATE_COOKIE } from '../server/session.js';

/**
 * The whole way in and out, with Discord played by a stand-in.
 *
 * <h2>Why this is worth the setup</h2>
 *
 * Because the way in is the one part of a site where being wrong is not a bug but a
 * door, and every one of the ways to be wrong here still lets you sign in perfectly
 * — which is to say, testing it by hand proves nothing at all. The case that
 * matters is the one nobody would ever perform by hand: somebody is handed a link
 * to our own callback carrying somebody else's code, and if it is taken they end up
 * quietly signed into a stranger's account and uploading their work into it.
 *
 * Standing in for Discord is what makes any of that runnable. The alternative is a
 * check that needs a real account, a real browser and a real secret, which is a
 * check that gets run once.
 */

let app: FastifyInstance;
let db: Db;

/** Discord, in so far as this needs one: a token, then a person. */
const pretendDiscord: typeof fetch = async (where) => {
  const url = String(where);
  if (url.endsWith('/oauth2/token')) {
    return new Response(JSON.stringify({ access_token: 'token-for-tests' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.endsWith('/users/@me')) {
    return new Response(
      JSON.stringify({ id: 'discord-9', username: 'mopic', global_name: 'Мопик', avatar: 'aaa' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }
  return new Response('нет такого', { status: 404 });
};

beforeAll(async () => {
  process.env.DISCORD_CLIENT_ID = 'test-client';
  process.env.DISCORD_CLIENT_SECRET = 'test-secret';
  process.env.DISCORD_REDIRECT_URI = 'https://example.test/api/auth/discord/callback';

  db = await open(undefined, 'memory://');
  await migrate(db);
  app = Fastify();
  await app.register(fastifyCookie);
  authRoutes(app, db, false, pretendDiscord);
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

/** The cookie a reply asked to be set, by name. */
function cookieOf(reply: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = reply.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  for (const one of all) {
    if (one.startsWith(`${name}=`)) {
      // Decoded, because that is what a browser hands back and what the cookie
      // plugin gives the routes. Comparing the encoded form to anything else is
      // comparing two different strings that mean the same thing.
      return decodeURIComponent(one.slice(name.length + 1, one.indexOf(';')));
    }
  }
  return null;
}

describe('the way in', () => {
  it('sends people to Discord and remembers that it did', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/auth/discord?back=/skins/7' });
    expect(reply.statusCode).toBe(302);
    const where = new URL(reply.headers.location as string);
    expect(where.origin).toBe('https://discord.com');

    // The state in the address and the state in the cookie are the same value.
    // That is the whole trick: a stranger can write the first and not the second.
    const held = cookieOf(reply, STATE_COOKIE);
    expect(held).toBeTruthy();
    expect(where.searchParams.get('state')).toBe(held);
  });

  it('lets somebody in and knows them afterwards', async () => {
    const off = await app.inject({ method: 'GET', url: '/api/auth/discord?back=/skins/7' });
    const state = cookieOf(off, STATE_COOKIE)!;

    const back = await app.inject({
      method: 'GET',
      url: `/api/auth/discord/callback?code=fine&state=${encodeURIComponent(state)}`,
      cookies: { [STATE_COOKIE]: state },
    });
    expect(back.statusCode).toBe(302);
    // Put back where they were, not on the front page.
    expect(back.headers.location).toBe('/skins/7');

    const session = cookieOf(back, SESSION_COOKIE);
    expect(session).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE]: session! },
    });
    expect(me.json()).toMatchObject({ signedIn: true, handle: 'Мопик' });
    expect(me.json().face).toContain('/avatars/discord-9/aaa');
  });

  /**
   * The attack this is all for.
   *
   * A stranger starts a login of their own, gets a code, and hands somebody a link
   * to our callback carrying it. Without the cookie check the victim's browser is
   * signed into the stranger's account — and everything looks fine, because it is
   * a working login. It just belongs to somebody else.
   */
  it('refuses a return that this browser did not start', async () => {
    const strangers = await app.inject({ method: 'GET', url: '/api/auth/discord' });
    const state = cookieOf(strangers, STATE_COOKIE)!;

    // The victim's browser has no state cookie of its own.
    const reply = await app.inject({
      method: 'GET',
      url: `/api/auth/discord/callback?code=fine&state=${encodeURIComponent(state)}`,
    });
    expect(reply.headers.location).toBe('/?login=forged');
    expect(cookieOf(reply, SESSION_COOKIE)).toBeNull();
  });

  it('refuses a state that we never signed', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/auth/discord/callback?code=fine&state=made-up',
      cookies: { [STATE_COOKIE]: 'made-up' },
    });
    expect(reply.headers.location).toBe('/?login=forged');
    expect(cookieOf(reply, SESSION_COOKIE)).toBeNull();
  });

  it('says so plainly when somebody pressed cancel', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/auth/discord/callback?error=access_denied',
    });
    expect(reply.headers.location).toBe('/?login=cancelled');
  });

  it('is nobody again after leaving', async () => {
    const reply = await app.inject({ method: 'POST', url: '/api/auth/leave' });
    expect(reply.json()).toEqual({ signedIn: false });
    // Not merely forgotten by the page: the cookie is emptied and expired.
    const raw = String(reply.headers['set-cookie']);
    expect(raw).toContain(`${SESSION_COOKIE}=;`);
    expect(raw).toContain('Max-Age=0');
  });

  /**
   * A place somebody was, with a comma in it, still comes back whole.
   *
   * A cookie value ends at the first semicolon and several parsers split on
   * commas as well. Written raw, a path holding either is silently cut in half —
   * and the failure is not an error but a login that lands on the front page for
   * some people and not others.
   */
  it('carries a path with punctuation in it through the trip', async () => {
    const back = '/skins/a,b;c';
    const off = await app.inject({
      method: 'GET',
      url: `/api/auth/discord?back=${encodeURIComponent(back)}`,
    });
    const state = cookieOf(off, STATE_COOKIE)!;
    const home = await app.inject({
      method: 'GET',
      url: `/api/auth/discord/callback?code=fine&state=${encodeURIComponent(state)}`,
      cookies: { [STATE_COOKIE]: state },
    });
    expect(home.headers.location).toBe(back);
  });

  it('does not take a made-up session', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE]: 'somebody~99999999999999.pretend-signature' },
    });
    expect(me.json()).toEqual({ signedIn: false });
  });
});
