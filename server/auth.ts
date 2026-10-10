import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from './db.js';
import { authorizeUrl, faceUrl, whoCame, wiringOf, type Wiring } from './discord.js';
import { secretOf } from './sign.js';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  STATE_COOKIE,
  STATE_MINUTES,
  bake,
  makeSession,
  makeState,
  readSession,
  readState,
} from './session.js';

/**
 * Four routes: go, come back, who am I, and leave.
 *
 * <h2>The one that is easy to get wrong</h2>
 *
 * The return trip. Whatever arrives at the callback was written by whoever sent the
 * browser there, and that is not necessarily this site — a stranger can hand
 * somebody a link to our own callback carrying *their* code, and if it is accepted
 * the victim ends up quietly signed into the attacker's account, uploading their
 * work into it. That is what `state` is for, and why it is checked here rather than
 * merely sent.
 *
 * It is checked twice over: the value has to match the cookie set when the trip
 * started, which a stranger cannot write, and it has to carry our own signature,
 * which a stranger cannot forge. Either alone would very nearly do. Both together
 * cost one comparison.
 */

export interface Account {
  id: string;
  handle: string;
  avatar: string | null;
  /** Kept alongside because the picture's address is built out of it. */
  discord_id: string;
  created?: Date | string;
}

export function whoIs(request: FastifyRequest): string | null {
  const secret = secretOf();
  return readSession(secret, request.cookies[SESSION_COOKIE]);
}

/** The account behind a request, or nothing. Everything private goes through this. */
export async function accountOf(db: Db, request: FastifyRequest): Promise<Account | null> {
  const id = whoIs(request);
  if (!id) return null;
  const rows = await db.query<Account>(
    'select id, handle, avatar, discord_id, created from users where id = $1',
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Refuses a request that has nobody behind it.
 *
 * Answers rather than throws, and the caller stops when it gets something back.
 * A guard that has to be remembered to be honoured is a guard that will be
 * forgotten on exactly one route.
 */
export async function mustBe(
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Account | null> {
  const account = await accountOf(db, request);
  if (!account) {
    await reply.code(401).send({ error: 'нужно войти' });
    return null;
  }
  return account;
}

export function authRoutes(
  app: FastifyInstance,
  db: Db,
  secure: boolean,
  /**
   * How to reach Discord.
   *
   * Only ever passed in by the tests, and the reason it exists is worth stating:
   * the return trip is the one piece of this that has to be right, and the only
   * way to exercise it is to stand in for the far side. A check that cannot be run
   * without a real account and a real browser is a check nobody runs.
   */
  fetching: typeof fetch = fetch,
): void {
  const secret = secretOf();

  /**
   * Off to Discord.
   *
   * If nothing is configured this says so plainly instead of redirecting into a
   * broken page. The site has to be workable before the application exists, and a
   * button that leads to Discord's own error screen tells nobody what is wrong.
   */
  app.get('/api/auth/discord', async (request, reply) => {
    const wiring = wiringOf();
    if (!wiring) {
      return reply
        .code(503)
        .send({ error: 'вход через Discord ещё не настроен: нет DISCORD_CLIENT_ID' });
    }
    const back = (request.query as { back?: string }).back ?? '/';
    const state = makeState(secret, back);
    return reply
      .header('set-cookie', bake(STATE_COOKIE, state, STATE_MINUTES * 60, secure))
      .redirect(authorizeUrl(wiring, state), 302);
  });

  /**
   * Back from Discord.
   *
   * Ends in a redirect to a page rather than in JSON, because a person is looking
   * at this in a browser. Anything that went wrong is said in the address so the
   * page can put it in words — the alternative is a blank front page and no way to
   * tell "you pressed cancel" from "the secret is wrong".
   */
  app.get('/api/auth/discord/callback', async (request, reply) => {
    const wiring = wiringOf();
    if (!wiring) return reply.code(503).send({ error: 'вход через Discord ещё не настроен' });

    const query = request.query as { code?: string; state?: string; error?: string };
    const forget = bake(STATE_COOKIE, '', 0, secure);

    // Said in the address in plain ASCII, so that what a person sees in the bar is
    // readable rather than forty per-cent signs. The page turns it into Russian.
    if (query.error) {
      return reply.header('set-cookie', forget).redirect('/?login=cancelled', 302);
    }

    const held = request.cookies[STATE_COOKIE];
    const back = readState(secret, query.state);
    // Both halves: ours by signature, and the same one this browser started with.
    if (!query.code || !back || !held || held !== query.state) {
      request.log.warn('вход: state не сошёлся, запрос отброшен');
      return reply.header('set-cookie', forget).redirect('/?login=forged', 302);
    }

    let person;
    try {
      person = await whoCame(wiring, query.code, fetching);
    } catch (why) {
      request.log.error({ why }, 'вход: обмен с discord не удался');
      return reply.header('set-cookie', forget).redirect('/?login=failed', 302);
    }

    const id = await settle(db, person.id, person.handle, person.avatar);
    return reply
      .header('set-cookie', forget)
      .header('set-cookie', bake(SESSION_COOKIE, makeSession(secret, id), SESSION_DAYS * 24 * 60 * 60, secure))
      .redirect(back, 302);
  });

  /** Who the browser is, if anybody. The page asks this once when it loads. */
  app.get('/api/auth/me', async (request, reply) => {
    const account = await accountOf(db, request);
    if (!account) return reply.send({ signedIn: false });
    return reply.send({
      signedIn: true,
      id: account.id,
      handle: account.handle,
      face: faceUrl(account.discord_id, account.avatar),
      since: account.created ? new Date(account.created).toISOString() : undefined,
      // So the page can stop offering a button that cannot work.
      discordReady: wiringOf() !== null,
    });
  });

  /**
   * Leaving.
   *
   * A POST rather than a GET: something that changes what you are cannot be done by
   * putting an address in an image tag on another site.
   */
  app.post('/api/auth/leave', async (_request, reply) =>
    reply.header('set-cookie', bake(SESSION_COOKIE, '', 0, secure)).send({ signedIn: false }),
  );
}

/**
 * The person, made if they are new and brought up to date if they are not.
 *
 * Keyed by the Discord id and never by the name — names on Discord change, and a
 * table keyed by one loses track of whose skins are whose the first time somebody
 * renames themselves. The name is stored anyway because it is what gets shown.
 */
export async function settle(
  db: Db,
  discordId: string,
  handle: string,
  avatar: string | null,
): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `insert into users (id, discord_id, handle, avatar)
     values ($1, $2, $3, $4)
     on conflict (discord_id)
       do update set handle = excluded.handle, avatar = excluded.avatar, seen = now()
     returning id`,
    [randomUUID(), discordId, handle, avatar],
  );
  return rows[0]!.id;
}

export type { Wiring };
