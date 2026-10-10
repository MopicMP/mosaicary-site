import { isAdultView, viewFor, type AdultView } from '../shared/adult.js';
import { closedHere } from './adult.js';
import type { Env } from './env.js';
import { keyOf } from './keyRules.js';
import { ownerOfKey } from './keys.js';
import { PROVIDERS, authorizeUrl, isProvider, whoCame, wiringOf, type Person, type Provider } from './oauth.js';
import { bodyOf, goTo, json, now, refuse, type Ctx } from './reply.js';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  STATE_COOKIE,
  STATE_MINUTES,
  bake,
  cookieOf,
  makeSession,
  makeState,
  readSession,
  readState,
} from './session.js';
import { freshId } from './sign.js';

/**
 * Five routes: go, come back, who am I, leave, and how to be shown models for adults.
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
 *
 * <h2>Two providers, one person</h2>
 *
 * Signing in with the second provider while already signed in with the first ties
 * the two together. Signing in with an account that already belongs to somebody else
 * is refused rather than merged: merging two people's models because one of them
 * was signed in on the other's machine is not something to do silently.
 */

export interface Account {
  id: string;
  handle: string;
  face: string | null;
  via: Provider;
  created: string;
  barredUntil: string | null;
  identities: { provider: Provider; subject: string }[];
  admin: boolean;
  /** When they said they are eighteen or older, or null. */
  adultOk: string | null;
  /** How they asked to be shown models for adults; counts only with `adultOk`. */
  adultView: AdultView;
  /** Whether this request came with an API key rather than the cookie: a key is allowed less. */
  byKey: boolean;
}

const NAMES: Record<Provider, string> = { discord: 'Discord', github: 'GitHub' };

/** Whoever runs the site, by the providers' own ids: `discord:123,github:456`. */
export function isAdmin(env: Env, identities: { provider: string; subject: string }[]): boolean {
  const listed = (env.ADMINS ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);
  return identities.some((one) => listed.includes(`${one.provider}:${one.subject}`));
}

/** The account behind a request, or nothing. Everything private goes through this. */
export function accountOf(c: Ctx): Promise<Account | null> {
  c.account ??= findAccount(c);
  return c.account;
}

async function findAccount(c: Ctx): Promise<Account | null> {
  // A request that says Authorization is judged by its key alone, and a key that does
  // not work means nobody, never "then the cookie": see keys.ts.
  const key = keyOf(c.request);
  if (key !== null) {
    const owner = await ownerOfKey(c, key);
    return owner ? accountById(c, owner, false) : null;
  }
  if (!c.secret) return null;
  const id = await readSession(c.secret, cookieOf(c.request, SESSION_COOKIE));
  if (!id) return null;
  return accountById(c, id, true);
}

/** The account with this id. `mayRun` is false for a key, which never acts for whoever runs the site. */
async function accountById(c: Ctx, id: string, mayRun: boolean): Promise<Account | null> {
  const [users, identities] = await c.env.DB.batch([
    c.env.DB.prepare(
      'select id, handle, face, via, created, barred_until, adult_ok, adult_view from users where id = ?',
    ).bind(id),
    c.env.DB.prepare('select provider, subject from identities where user_id = ?').bind(id),
  ]);
  const user = users?.results[0] as
    | {
        id: string;
        handle: string;
        face: string | null;
        via: Provider;
        created: string;
        barred_until: string | null;
        adult_ok: string | null;
        adult_view: string;
      }
    | undefined;
  if (!user) return null;
  const held = (identities?.results ?? []) as { provider: Provider; subject: string }[];
  return {
    id: user.id,
    handle: user.handle,
    face: user.face,
    via: user.via,
    created: user.created,
    barredUntil: user.barred_until,
    identities: held,
    admin: mayRun && isAdmin(c.env, held),
    adultOk: user.adult_ok,
    adultView: isAdultView(user.adult_view) ? user.adult_view : 'hide',
    byKey: !mayRun,
  };
}

/**
 * The account behind a request, or the refusal to send back.
 *
 * Answers rather than throws, and the caller stops when it gets a Response. A guard
 * that has to be remembered to be honoured is a guard that will be forgotten on
 * exactly one route.
 */
export async function mustBe(c: Ctx): Promise<Account | Response> {
  const account = await accountOf(c);
  return account ?? refuse(401, 'нужно войти');
}

/** The routes under `/api/auth`, or null when the path is not one of them. */
export async function authRoute(c: Ctx, path: string): Promise<Response | null> {
  const method = c.request.method;
  if (path === '/api/auth/me' && method === 'GET') return me(c);
  if (path === '/api/auth/adult' && method === 'POST') return chooseAdult(c);
  if (path === '/api/auth/leave' && method === 'POST') {
    return new Response(JSON.stringify({ signedIn: false }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': bake(SESSION_COOKIE, '', 0, c.secure),
      },
    });
  }
  const trip = /^\/api\/auth\/([a-z]+)(\/callback)?$/.exec(path);
  if (!trip || method !== 'GET' || !isProvider(trip[1]!)) return null;
  return trip[2] ? arrive(c, trip[1] as Provider) : depart(c, trip[1] as Provider);
}

/**
 * Off to the provider.
 *
 * If nothing is configured this says so plainly instead of redirecting into a broken
 * page. The site has to be workable before the applications exist, and a button that
 * leads to the provider's own error screen tells nobody what is wrong.
 */
async function depart(c: Ctx, provider: Provider): Promise<Response> {
  if (!c.secret) return refuse(503, 'вход ещё не настроен: нет SESSION_SECRET');
  const wiring = wiringOf(c.env, provider);
  if (!wiring) return refuse(503, `вход через ${NAMES[provider]} ещё не настроен`);
  const state = await makeState(c.secret, provider, c.url.searchParams.get('back') ?? '/');
  return goTo(authorizeUrl(provider, wiring, state), [bake(STATE_COOKIE, state, STATE_MINUTES * 60, c.secure)]);
}

/**
 * Back from the provider.
 *
 * Ends in a redirect to a page rather than in JSON, because a person is looking at
 * this in a browser. Anything that went wrong is said in the address so the page can
 * put it in words — the alternative is a blank front page and no way to tell "you
 * pressed cancel" from "the secret is wrong".
 */
async function arrive(c: Ctx, provider: Provider): Promise<Response> {
  const forget = bake(STATE_COOKIE, '', 0, c.secure);
  const wiring = wiringOf(c.env, provider);
  if (!c.secret || !wiring) return goTo('/?login=failed', [forget]);

  // Said in the address in plain ASCII, so that what a person sees in the bar is
  // readable rather than forty per-cent signs. The page turns it into Russian.
  if (c.url.searchParams.get('error')) return goTo('/?login=cancelled', [forget]);

  const code = c.url.searchParams.get('code');
  const state = c.url.searchParams.get('state');
  const held = cookieOf(c.request, STATE_COOKIE);
  const back = await readState(c.secret, provider, state ?? undefined);
  // Both halves: ours by signature, and the same one this browser started with.
  if (!code || !state || !back || held !== state) {
    console.warn(`вход через ${provider}: state не сошёлся, запрос отброшен`);
    return goTo('/?login=forged', [forget]);
  }

  let person: Person;
  try {
    person = await whoCame(provider, wiring, code);
  } catch (why) {
    console.error(`вход через ${provider}: обмен не удался`, why);
    return goTo(withLogin(back, 'failed'), [forget]);
  }

  const current = await accountOf(c);
  let id: string | 'taken';
  try {
    id = await settle(c.env.DB, provider, person, current?.id ?? null);
  } catch (why) {
    console.error(`вход через ${provider}: запись не удалась`, why);
    return goTo(withLogin(back, 'failed'), [forget]);
  }
  if (id === 'taken') return goTo(withLogin(back, 'taken'), [forget]);

  const session = bake(SESSION_COOKIE, await makeSession(c.secret, id), SESSION_DAYS * 24 * 60 * 60, c.secure);
  return goTo(back, [forget, session]);
}

function withLogin(back: string, said: string): string {
  return `${back}${back.includes('?') ? '&' : '?'}login=${said}`;
}

/**
 * Who the browser is, if anybody, and which ways in work at all.
 *
 * `ready` is sent to everybody, signed in or not, so the page can stop offering a
 * button that cannot work.
 */
async function me(c: Ctx): Promise<Response> {
  const ready = Object.fromEntries(
    PROVIDERS.map((provider) => [provider, !!c.secret && wiringOf(c.env, provider) !== null]),
  );
  const account = await accountOf(c);
  const closed = closedHere(c);
  if (!account) {
    return json({ signedIn: false, ready, adult: { view: 'hide', confirmed: false, closed } }, 200, {
      'cache-control': 'no-store',
    });
  }
  return json(
    {
      signedIn: true,
      id: account.id,
      handle: account.handle,
      face: account.face,
      since: account.created,
      admin: account.admin,
      providers: account.identities.map((one) => one.provider),
      barredUntil: account.barredUntil && account.barredUntil > new Date().toISOString() ? account.barredUntil : null,
      adult: {
        view: viewFor(account, closed),
        chosen: account.adultView,
        confirmed: !!account.adultOk,
        closed,
      },
      ready,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}

/**
 * How this person wants models for adults shown, and, the first time, that they are
 * eighteen.
 *
 * Hiding them is always allowed. Seeing them in any way needs the person to say they
 * are eighteen, once, and is refused outright where the site closes them; the page
 * there does not even offer it.
 */
async function chooseAdult(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  if (!isAdultView(body.view)) return refuse(400, 'выбери, как показывать модели 18+');
  if (body.view !== 'hide') {
    if (closedHere(c)) return refuse(403, 'в твоей стране модели 18+ на сайте закрыты');
    if (!account.adultOk && body.over18 !== true) return refuse(400, 'сначала подтверди, что тебе есть 18');
  }
  // Hiding them again takes back the saying of one's age, rather than only changing
  // what is drawn. Article 7(3) of Regulation (EU) 2016/679 asks for withdrawing a
  // consent to be as easy as giving it, and this is where it was given; keeping the
  // record of it afterwards would be keeping something we no longer have a use for.
  await c.env.DB.prepare(
    `update users
        set adult_view = ?,
            adult_ok = case when ? = 'hide' then null else coalesce(adult_ok, ?) end
      where id = ?`,
  )
    .bind(body.view, body.view, now(), account.id)
    .run();
  return json({ ok: true });
}

/**
 * The person behind an outside account: found, tied to the one signed in, or made.
 *
 * The name and picture shown are those of the provider the account was made
 * through. Signing in through the second one keeps its own name in `identities` and
 * leaves the shown one alone, so a person who is "Mira" on Discord does not become
 * "mira-dev" the first time they use GitHub.
 */
export async function settle(
  db: D1Database,
  provider: Provider,
  person: Person,
  current: string | null,
): Promise<string | 'taken'> {
  const now = new Date().toISOString();
  const found = await db
    .prepare('select user_id from identities where provider = ? and subject = ?')
    .bind(provider, person.subject)
    .first<{ user_id: string }>();

  if (found) {
    if (current && current !== found.user_id) return 'taken';
    await db.batch([
      db
        .prepare('update identities set handle = ?, face = ? where provider = ? and subject = ?')
        .bind(person.handle, person.face, provider, person.subject),
      db
        .prepare(
          `update users
              set seen = ?,
                  handle = case when via = ? then ? else handle end,
                  face = case when via = ? then ? else face end
            where id = ?`,
        )
        .bind(now, provider, person.handle, provider, person.face, found.user_id),
    ]);
    return found.user_id;
  }

  if (current) {
    await db.batch([
      db
        .prepare('insert into identities (provider, subject, user_id, handle, face) values (?, ?, ?, ?, ?)')
        .bind(provider, person.subject, current, person.handle, person.face),
      db.prepare('update users set seen = ? where id = ?').bind(now, current),
    ]);
    return current;
  }

  const id = freshId();
  await db.batch([
    db
      .prepare('insert into users (id, handle, face, via, created, seen) values (?, ?, ?, ?, ?, ?)')
      .bind(id, person.handle, person.face, provider, now, now),
    db
      .prepare('insert into identities (provider, subject, user_id, handle, face) values (?, ?, ?, ?, ?)')
      .bind(provider, person.subject, id, person.handle, person.face),
  ]);
  return id;
}
