import { accountOf, authRoute } from './auth.js';
import type { Env } from './env.js';
import { keyMayUse, keyOf, limitKeyOf, overLimit } from './keyRules.js';
import { keyRoute } from './keys.js';
import { linkRoute } from './link.js';
import { modelRoute } from './models.js';
import { OPEN, json, refuse, type Ctx } from './reply.js';
import { secretOf } from './sign.js';
import { siteFacts } from './site.js';
import { talkRoute } from './talk.js';
import { wallRoute } from './wall.js';

/**
 * The whole back end: one Worker answering `/api/*` on the site's own address.
 *
 * The pages themselves are static files on GitHub Pages; Cloudflare sits in front of
 * both and sends `/api/*` here. One address for both means one origin, so cookies
 * work without any cross-site arrangement. CORS is for two things only: the few reads
 * that are deliberately open to everybody, and requests carrying an API key, which
 * come from the Blockbench plugin wherever it runs (see keys.ts).
 */

const CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The two routes a program uses before it has a key at all (link.ts): the only
 * changing routes here that are not checked against the site's own Origin, because
 * what asks is not a browser. They prove themselves with a secret of their own
 * instead, and they are listed here, by name, so that nothing else can join them by
 * being written into that module.
 */
const BEFORE_A_KEY = new Set(['/api/link', '/api/link/poll']);

/**
 * Whether a request that changes something came from the site's own pages.
 *
 * The cookie is SameSite=Lax, which already keeps it off most requests another site
 * can make, and this closes the rest: every browser sends Origin with a POST, PUT,
 * PATCH or DELETE, and another site cannot choose what it says.
 */
function fromHome(request: Request, env: Env): boolean {
  const home = env.PUBLIC_ORIGIN?.replace(/\/+$/, '');
  return !!home && request.headers.get('origin') === home;
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (!path.startsWith('/api/')) return refuse(404, 'нет такого адреса');

    if (request.method === 'OPTIONS') {
      // The open reads need nothing beyond a plain GET; a request with a key asks
      // first, because of its Authorization header. Answered for any origin and
      // without allowing credentials: a request that wants to bring the cookie along
      // is refused here by the browser, which leaves the cookie to the site's pages.
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
        },
      });
    }

    const c: Ctx = {
      request,
      env,
      url,
      secret: secretOf(env),
      secure: (env.PUBLIC_ORIGIN ?? '').startsWith('https:'),
      country: typeof request.cf?.country === 'string' ? request.cf.country : null,
      later: (work) => context.waitUntil(work),
    };

    // A request with a key comes from a program, not from a page of ours, and is
    // read from wherever that program runs: every answer to it says so. Signing in by
    // code comes from a program too, before it has any key to carry.
    const keyed = keyOf(request) !== null;
    const linking = request.method === 'POST' && BEFORE_A_KEY.has(path);
    const answer = linking ? beforeAKey(c, path) : keyed ? withKey(c, path) : withCookie(c, path);
    return answer.then((response) => (keyed || linking ? readableAnywhere(response) : response));
  },
} satisfies ExportedHandler<Env>;

/**
 * A request carrying a key: only to the routes a key may use, and, when it changes
 * something, only with a key that works. The Origin check is skipped because a key is
 * not sent by a browser on its own, but an invalid key is not let past on that
 * account: it is refused before any route runs.
 */
async function withKey(c: Ctx, path: string): Promise<Response> {
  if (!keyMayUse(c.request.method, path)) return refuse(403, 'ключом это сделать нельзя, только на сайте');
  const changing = CHANGING.has(c.request.method);
  const account = await accountOf(c);
  if (changing && !account) return refuse(401, 'ключ не подошёл: его удалили или он вставлен не целиком');

  // Reading and changing are counted apart, because looking through the catalogue asks
  // far more often than anything a person does in it.
  const limiter = changing ? c.env.KEY_WRITES : c.env.KEY_READS;
  if (await overLimit(limiter, limitKeyOf(account?.id ?? null, keyOf(c.request) ?? ''))) {
    return refuse(429, 'слишком часто: подожди минуту и попробуй снова');
  }
  return routes(c, path);
}

/**
 * A program signing in by code, which has nothing to be judged by yet.
 *
 * Counted against where it comes from, since there is no account and no key to count
 * against. Starting is limited hard, because each start writes a row; asking how it
 * went is limited loosely, because the plugin does it every few seconds while a
 * person reads a page. Without the address Cloudflare adds, everybody shares one
 * allowance, which is what happens on a local stand and is right there.
 */
async function beforeAKey(c: Ctx, path: string): Promise<Response> {
  const from = c.request.headers.get('cf-connecting-ip') ?? 'unknown';
  const starting = path === '/api/link';
  const limiter = starting ? c.env.LINK_STARTS : c.env.LINK_POLLS;
  if (await overLimit(limiter, `${starting ? 'start' : 'poll'}:${from}`)) {
    return refuse(429, 'слишком часто: подожди минуту и попробуй снова');
  }
  return routes(c, path);
}

/** A request from a page, with whatever cookie it carries: changes only from the site's own pages. */
async function withCookie(c: Ctx, path: string): Promise<Response> {
  if (CHANGING.has(c.request.method) && !fromHome(c.request, c.env)) {
    return refuse(403, c.env.PUBLIC_ORIGIN ? 'запрос пришёл не с сайта' : 'на сервере не задан PUBLIC_ORIGIN');
  }
  return routes(c, path);
}

async function routes(c: Ctx, path: string): Promise<Response> {
  if (path === '/api/health') return json({ ok: true, now: new Date().toISOString() });

  // Who runs the site and how much of it there is, for the foot of every page. Cached
  // for a few minutes because it is the same answer for everybody, which is what keeps
  // the counting to one query every few minutes rather than one on every page opened.
  if (path === '/api/site' && c.request.method === 'GET') {
    return json(await siteFacts(c.env), 200, { ...OPEN, 'cache-control': 'public, max-age=300' });
  }

  try {
    // Talk before models: `/api/models/<id>/talk` would otherwise be read as an
    // action on a model, and the comments live in their own module so that the one
    // about models stays about models.
    return (
      (await authRoute(c, path)) ??
      (await keyRoute(c, path)) ??
      (await linkRoute(c, path)) ??
      (await talkRoute(c, path)) ??
      (await wallRoute(c, path)) ??
      (await modelRoute(c, path)) ??
      refuse(404, 'нет такого адреса')
    );
  } catch (why) {
    console.error(`${c.request.method} ${path}`, why);
    return refuse(500, 'что-то сломалось на сервере, попробуй ещё раз');
  }
}

/**
 * The same answer, readable by a page on any origin. Safe for a request with a key
 * because the key is what proves who is asking, and no other page can attach it;
 * credentials are never allowed, so a browser will not pair this with the cookie.
 */
function readableAnywhere(response: Response): Response {
  if (response.headers.get('access-control-allow-origin') === '*') return response;
  const copy = new Response(response.body, response);
  copy.headers.set('access-control-allow-origin', '*');
  return copy;
}
