import { KEYS_MAX, KEY_NAME_MAX, KEY_PREFIX, KEY_RANDOM, looksLikeKey, type ApiKey, type MadeKey } from '../shared/keyWire.js';
import { mustBe } from './auth.js';
import { keyOf } from './keyRules.js';
import { bodyOf, json, now, refuse, type Ctx } from './reply.js';
import { freshId, hashHex } from './sign.js';

/**
 * API keys: being someone without the site's cookie.
 *
 * <h2>Why a key is not a session</h2>
 *
 * The cookie only ever travels from this site's own pages, which is what lets a
 * request that changes something be trusted once its Origin is checked. A key travels
 * from wherever it was pasted — a Blockbench plugin keeps it in local storage that any
 * other plugin can read. So a key is narrower than a session, in three ways:
 *
 * - it opens only the routes listed in `keyMayUse` (keyRules.ts), and a route nobody has listed is
 *   closed to it, so a new route does not become reachable by accident;
 * - it never acts for whoever runs the site, even when its owner does;
 * - it cannot make or remove keys. That is done on the site, signed in.
 *
 * <h2>Why a request carrying a key never falls back to the cookie</h2>
 *
 * If a key that does not work meant "then try the cookie", any page could send a
 * nonsense key along with somebody's cookie and get past the Origin check, which is
 * skipped for keys. A request that says `Authorization` is judged by that alone.
 */

/** The hour a moment falls in, which is as precisely as a key's last use is kept. */
function hourOf(iso: string): string {
  return `${iso.slice(0, 13)}:00:00.000Z`;
}

/** Whose key this is, or null. Notes the hour it was used, at most once an hour. */
export async function ownerOfKey(c: Ctx, key: string): Promise<string | null> {
  if (!looksLikeKey(key)) return null;
  const row = await c.env.DB.prepare('select id, owner, used from api_keys where hash = ?')
    .bind(await hashHex(key))
    .first<{ id: string; owner: string; used: string | null }>();
  if (!row) return null;
  const hour = hourOf(now());
  if (row.used !== hour) {
    c.later(c.env.DB.prepare('update api_keys set used = ? where id = ?').bind(hour, row.id).run());
  }
  return row.owner;
}

/** The routes under `/api/keys`, or null. Only from the site's own pages, signed in. */
export async function keyRoute(c: Ctx, path: string): Promise<Response | null> {
  if (path !== '/api/keys' && !path.startsWith('/api/keys/')) return null;
  if (keyOf(c.request) !== null) return refuse(403, 'ключами управляют только на сайте, после входа');
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const method = c.request.method;

  if (path === '/api/keys') {
    if (method === 'GET') return list(c, account.id);
    if (method === 'POST') return make(c, account.id);
    return null;
  }
  const one = /^\/api\/keys\/([0-9A-Za-z]{12})$/.exec(path);
  if (one && method === 'DELETE') return drop(c, account.id, one[1]!);
  return null;
}

async function list(c: Ctx, owner: string): Promise<Response> {
  const { results } = await c.env.DB.prepare(
    'select id, name, hint, created, used from api_keys where owner = ? order by created desc',
  )
    .bind(owner)
    .all<ApiKey>();
  return json(results, 200, { 'cache-control': 'no-store' });
}

/** How many keys this account holds. Its own function because two routes ask it. */
export async function keysHeld(c: Ctx, owner: string): Promise<number> {
  const held = await c.env.DB.prepare('select count(*) as n from api_keys where owner = ?')
    .bind(owner)
    .first<{ n: number }>();
  return held?.n ?? 0;
}

/**
 * A key for this account, written down and handed back whole.
 *
 * Shared with signing in by code (link.ts), which makes the key at the moment the
 * plugin collects it rather than when the person agreed: a request nobody came back
 * for must leave no working key behind.
 */
export async function mintKey(c: Ctx, owner: string, name: string): Promise<MadeKey> {
  const key = KEY_PREFIX + freshId(KEY_RANDOM);
  const made: MadeKey = { id: freshId(), name, hint: key.slice(-4), created: now(), used: null, key };
  await c.env.DB.prepare('insert into api_keys (id, owner, name, hash, hint, created) values (?, ?, ?, ?, ?, ?)')
    .bind(made.id, owner, made.name, await hashHex(key), made.hint, made.created)
    .run();
  return made;
}

async function make(c: Ctx, owner: string): Promise<Response> {
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) return refuse(400, 'назови ключ, чтобы потом отличить его от других');
  if (name.length > KEY_NAME_MAX) return refuse(400, `имя ключа длиннее ${KEY_NAME_MAX} знаков`);
  if (/[\u0000-\u001f\u007f]/.test(name)) return refuse(400, 'в имени ключа есть служебные знаки');

  if ((await keysHeld(c, owner)) >= KEYS_MAX) return refuse(409, `ключей уже ${KEYS_MAX}, удали ненужный`);

  return json(await mintKey(c, owner, name), 201, { 'cache-control': 'no-store' });
}

async function drop(c: Ctx, owner: string, id: string): Promise<Response> {
  const done = await c.env.DB.prepare('delete from api_keys where id = ? and owner = ?').bind(id, owner).run();
  if (!done.meta.changes) return refuse(404, 'такого ключа нет');
  return json({ ok: true });
}
