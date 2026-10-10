import { KEYS_MAX } from '../shared/keyWire.js';
import {
  CODE_ALPHABET,
  CODE_HALF,
  LINK_MINUTES,
  LINK_POLL_SECONDS,
  LINK_PREFIX,
  LINK_RANDOM,
  cleanDevice,
  looksLikeCode,
  looksLikeLinkSecret,
  type LinkAsked,
  type LinkPoll,
  type LinkStart,
  type LinkState,
} from '../shared/linkWire.js';
import { mustBe } from './auth.js';
import { keyOf } from './keyRules.js';
import { keysHeld, mintKey } from './keys.js';
import { bodyOf, json, now, refuse, type Ctx } from './reply.js';
import { freshId, hashHex } from './sign.js';

/**
 * Letting a program into an account without pasting anything: the short code.
 *
 * Five routes, and they fall into two halves that must not be confused.
 *
 * Two are used by the program and carry no cookie at all: starting a request, and
 * asking whether anybody said yes. They are the only changing routes on this site
 * that are not checked against the site's own Origin, because the thing asking is not
 * a browser; what stands in for that check is the secret in the body, which only the
 * program that started the request has. They are named one by one in index.ts so that
 * nothing else can end up on that path by accident.
 *
 * Three are used by the page, signed in and from the site's own address, exactly like
 * every other change: reading what is being asked, agreeing, refusing. A key may not
 * use them, the same way a key may not make keys — otherwise a key that leaked could
 * make itself a second one.
 *
 * Why the key is made when it is collected, and not when it is agreed to: a person
 * who agrees and then closes Blockbench must not be left with a working key in their
 * list. Until the plugin comes back, the row says only that somebody agreed.
 */

type Row = {
  code: string;
  state: LinkState;
  owner: string | null;
  device: string;
  expires: string;
};

/** A code nobody can guess, in the shape a person reads: `KXMP-7TRQ`. */
function freshCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_HALF * 2));
  // 256 is eight times 32, so a byte falls on the alphabet evenly and nothing is rejected.
  const letters = [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]!);
  return `${letters.slice(0, CODE_HALF).join('')}-${letters.slice(CODE_HALF).join('')}`;
}

function said(body: LinkPoll): Response {
  return json(body, 200, { 'cache-control': 'no-store' });
}

export async function linkRoute(c: Ctx, path: string): Promise<Response | null> {
  if (path !== '/api/link' && !path.startsWith('/api/link/')) return null;
  const method = c.request.method;
  if (path === '/api/link' && method === 'POST') return start(c);
  if (path === '/api/link/poll' && method === 'POST') return poll(c);

  const one = /^\/api\/link\/([A-Z2-9-]{9})(?:\/(allow|deny))?$/.exec(path);
  if (!one || !looksLikeCode(one[1]!)) return null;
  // The page's half. A key is refused here outright, as it is at /api/keys: being let
  // in is something a person does, and a key that could do it would renew itself.
  if (keyOf(c.request) !== null) return refuse(403, 'разрешить вход можно только на сайте');
  if (!one[2] && method === 'GET') return asked(c, one[1]!);
  if (one[2] && method === 'POST') return answer(c, one[1]!, one[2] === 'allow');
  return null;
}

/**
 * The program's side: a request, a code to show, and an address to open.
 *
 * The address is built from the site's own `PUBLIC_ORIGIN` rather than from wherever
 * the program is pointed. On the real site they are the same; while working on it they
 * are not — the plugin talks to the Worker on its own port, because Vite will not
 * answer a request carrying a key, while the page a person has to open lives on Vite.
 * Building the address here gets that right without the plugin knowing about it.
 */
async function start(c: Ctx): Promise<Response> {
  const home = c.env.PUBLIC_ORIGIN?.replace(/\/+$/, '');
  if (!home) return refuse(503, 'вход ещё не настроен: на сервере нет PUBLIC_ORIGIN');
  // Without a secret nobody can sign in on the site at all, so nobody could agree.
  if (!c.secret) return refuse(503, 'вход ещё не настроен: нет SESSION_SECRET');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const device = cleanDevice(body.device);

  // Swept here rather than on a timer, as incoming models are: a row nobody can reach
  // costs nothing until the next person comes along.
  c.later(c.env.DB.prepare('delete from link_requests where expires < ?').bind(now()).run());

  const secret = LINK_PREFIX + freshId(LINK_RANDOM);
  const made = now();
  const expires = new Date(Date.parse(made) + LINK_MINUTES * 60_000).toISOString();
  const code = await insert(c, await hashHex(secret), device, made, expires);
  if (!code) return refuse(503, 'не удалось начать вход, попробуй ещё раз');

  const out: LinkStart = { code, secret, url: `${home}/link/${code}`, interval: LINK_POLL_SECONDS, expires };
  return json(out, 201, { 'cache-control': 'no-store' });
}

/** The row, under a code no live row holds. Tries again on a clash, which is vanishingly rare. */
async function insert(
  c: Ctx,
  secret: string,
  device: string,
  made: string,
  expires: string,
): Promise<string | null> {
  for (let tries = 0; tries < 3; tries++) {
    const code = freshCode();
    try {
      await c.env.DB.prepare('insert into link_requests (code, secret, device, made, expires) values (?, ?, ?, ?, ?)')
        .bind(code, secret, device, made, expires)
        .run();
      return code;
    } catch (why) {
      console.warn('вход по коду: код не записался, пробуем другой', why);
    }
  }
  return null;
}

/**
 * Has anybody said yes.
 *
 * Found by the secret, never by the code: the code is public, and a request collected
 * by whoever saw it on a screen would be an account given away.
 */
async function poll(c: Ctx): Promise<Response> {
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const secret = typeof body.secret === 'string' ? body.secret : '';
  if (!looksLikeLinkSecret(secret)) return refuse(400, 'это не запрос на вход');

  const row = await c.env.DB.prepare(
    'select code, state, owner, device, expires from link_requests where secret = ?',
  )
    .bind(await hashHex(secret))
    .first<Row>();
  // A row that ran out and a row already swept are the same thing to the program, and
  // so is one whose key has been collected: it is handed over exactly once.
  if (!row || row.expires < now() || row.state === 'taken') return said({ state: 'expired' });
  if (row.state === 'waiting') return said({ state: 'waiting' });
  if (row.state === 'denied') return said({ state: 'denied' });
  if (!row.owner) return said({ state: 'expired' });
  return collect(c, row, row.owner);
}

/**
 * The key, made now and handed over once.
 *
 * The row is turned to `taken` first, and the key made only if that turn was this
 * request's: two asks arriving together must not make two keys. A failure after the
 * turn loses the request, and the person presses Войти again — a failure the other way
 * round would leave a key nobody asked for.
 */
async function collect(c: Ctx, row: Row, owner: string): Promise<Response> {
  if ((await keysHeld(c, owner)) >= KEYS_MAX) {
    return refuse(409, `ключей уже ${KEYS_MAX}: удали ненужный на сайте и войди снова`);
  }
  const mine = await c.env.DB.prepare("update link_requests set state = 'taken' where code = ? and state = 'allowed'")
    .bind(row.code)
    .run();
  if (!mine.meta.changes) return said({ state: 'expired' });

  const who = await c.env.DB.prepare('select handle, face from users where id = ?')
    .bind(owner)
    .first<{ handle: string; face: string | null }>();
  if (!who) return said({ state: 'expired' });
  const made = await mintKey(c, owner, row.device);
  c.later(c.env.DB.prepare('update link_requests set key_id = ? where code = ?').bind(made.id, row.code).run());
  return said({ state: 'taken', key: made.key, id: owner, handle: who.handle, face: who.face });
}

/** What the page shows: who is asking, and whether this account has room for another key. */
async function asked(c: Ctx, code: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await c.env.DB.prepare('select code, state, owner, device, made, expires from link_requests where code = ?')
    .bind(code)
    .first<Row & { made: string }>();
  if (!row || row.expires < now()) {
    return refuse(404, 'этот запрос на вход просрочен: нажми «Войти» в Blockbench ещё раз');
  }
  // One that somebody else already answered is not shown to anybody: a code is read off
  // a screen, and whoever answered it is the person who had it in front of them.
  if (row.owner && row.owner !== account.id) return refuse(404, 'этот запрос на вход уже закрыт');

  const out: LinkAsked = {
    code: row.code,
    device: row.device,
    made: row.made,
    expires: row.expires,
    state: row.state,
    keys: await keysHeld(c, account.id),
    keysMax: KEYS_MAX,
  };
  return json(out, 200, { 'cache-control': 'no-store' });
}

/** Yes or no, said once: the row moves out of `waiting` or nothing happens. */
async function answer(c: Ctx, code: string, yes: boolean): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  // Said here, where the person can act on it, rather than only at the moment the
  // plugin comes to collect, where they are looking at Blockbench and not at the list.
  if (yes && (await keysHeld(c, account.id)) >= KEYS_MAX) {
    return refuse(409, `ключей уже ${KEYS_MAX}: удали ненужный ниже и разреши снова`);
  }
  const done = await c.env.DB.prepare(
    "update link_requests set state = ?, owner = ? where code = ? and state = 'waiting' and expires > ?",
  )
    .bind(yes ? 'allowed' : 'denied', account.id, code, now())
    .run();
  if (!done.meta.changes) return refuse(404, 'этот запрос на вход уже закрыт или просрочен');
  return json({ ok: true });
}
