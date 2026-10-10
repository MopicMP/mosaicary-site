/**
 * What an API key is and may do, with nothing of the Workers runtime in it.
 *
 * Apart from keys.ts so that the page's own type check, which has no Cloudflare types,
 * can read these rules in its tests: keys.ts reaches the database and so needs them.
 * Why a key is narrower than a session is told there.
 */

/**
 * What a key may do, as method and path.
 *
 * Reading: the catalogue as its owner is shown it, their own list and what they gave a
 * heart to, a model with its file, picture and comments, the wall of reviews, their
 * notices, and who the key belongs to. Doing what a person does while looking: a heart
 * on a model or a comment, writing a comment, writing a review of the work or
 * rewriting one's own, taking back one's own (talk.ts refuses a key anything more),
 * and marking notices read. Putting a model up: starting one, sending its file and its
 * picture, publishing it, and changing what is said about it afterwards.
 *
 * Not here, on purpose, and each for its own reason:
 *
 * - **deleting a model, and taking one off the catalogue.** Her decision of 8 October:
 *   a key may publish and update, not undo. The key sits in storage any other plugin
 *   can read, so what it may do is what can be done again — and a deleted model cannot;
 * - **reports**, which are notices under the Digital Services Act and the easiest thing
 *   to flood from a script;
 * - **saying one is eighteen**, refused in models.ts where it is read, not here: the
 *   route itself is allowed, and only that one field in it is not;
 * - **anything belonging to whoever runs the site.**
 */
const ID = '[0-9A-Za-z]{12}';
const KEY_ROUTES: [string, RegExp][] = [
  ['GET', /^\/api\/auth\/me$/],
  ['GET', /^\/api\/(?:site|health)$/],
  ['GET', /^\/api\/models$/],
  ['GET', /^\/api\/models\/liked$/],
  ['GET', new RegExp(`^/api/models/${ID}(?:/(?:file|preview|talk))?$`)],
  ['POST', new RegExp(`^/api/models/${ID}/(?:like|talk)$`)],
  ['DELETE', new RegExp(`^/api/models/${ID}/like$`)],
  ['DELETE', new RegExp(`^/api/talk/${ID}$`)],
  ['POST', new RegExp(`^/api/talk/${ID}/like$`)],
  ['DELETE', new RegExp(`^/api/talk/${ID}/like$`)],
  // Reviews of the work, which is the one thing the plugin has its own window for:
  // reading the wall, writing one, and rewriting one's own. Her decision of 9 October.
  ['GET', /^\/api\/feedback$/],
  ['POST', /^\/api\/feedback$/],
  ['PATCH', new RegExp(`^/api/talk/${ID}$`)],
  ['GET', /^\/api\/notices$/],
  ['POST', /^\/api\/notices\/seen$/],
  // Publishing from the plugin: the same four steps the page takes, in the same order.
  ['POST', /^\/api\/models$/],
  ['PUT', new RegExp(`^/api/models/${ID}/(?:file|preview)$`)],
  ['POST', new RegExp(`^/api/models/${ID}/publish$`)],
  ['PATCH', new RegExp(`^/api/models/${ID}$`)],
];

export function keyMayUse(method: string, path: string): boolean {
  return KEY_ROUTES.some(([how, where]) => how === method && where.test(path));
}

/** The part of Cloudflare's rate limit binding used here, so this file needs none of its types. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Whose allowance a request with a key is counted against: the account's, so that ten
 * keys are not ten times the allowance; a key that does not work, by itself.
 */
export function limitKeyOf(account: string | null, key: string): string {
  return account ? `account:${account}` : `key:${key.slice(0, 64)}`;
}

/**
 * Whether this request is over its allowance.
 *
 * A limiter that fails lets the request through rather than refusing it. The limit is a
 * guard against floods and the site works without it, while a limiter that refused
 * everything on its own fault would take the plugin down with it. The failure is said
 * in the log, which is where a limiter that never counts shows up. (Seen locally: after
 * a crash of the local runtime, miniflare's limiter answered "internal error" to every
 * call while the rest of the Worker worked.)
 */
export async function overLimit(limiter: Limiter | undefined, who: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    return !(await limiter.limit({ key: who })).success;
  } catch (why) {
    console.warn('rate limiter failed, request let through:', why);
    return false;
  }
}

/**
 * The key a request carries: null when it says nothing about one, an empty string
 * when it says `Authorization` in a shape that is not a key. The difference matters:
 * either of the last two means the cookie is not looked at.
 */
export function keyOf(request: Request): string | null {
  const said = request.headers.get('authorization');
  if (said === null) return null;
  const found = /^Bearer\s+(\S+)\s*$/i.exec(said);
  return found ? found[1]! : '';
}
