import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Handing a piece of text to a stranger and getting it back unchanged.
 *
 * <h2>Why sign anything rather than keep a table of sessions</h2>
 *
 * Because a session table has to be read on every single request, cleaned up on a
 * schedule, and is one more thing between the site and being able to answer. A
 * signed string carries who it is about and when it stops being true, and needs no
 * database at all.
 *
 * What that costs is that a session cannot be cancelled one at a time — it stops
 * when it expires, or when the secret changes and everybody's stops. For a site
 * where a session grants nothing but the right to manage your own skins, that is
 * the right trade. The moment something here can spend money or speak to other
 * people, it is the wrong one, and this comment is where to start.
 *
 * <h2>Why not a JWT</h2>
 *
 * A JWT is this, plus a header that says which algorithm to trust — read from the
 * token, which is to say from the attacker. Every few years somebody's library
 * accepts `alg: none` and every session everywhere is forgeable. There is one
 * algorithm here and it is not written down anywhere the outside can reach.
 */

/** How long a signature is once encoded, so it can be cut off without a separator. */
const MARK = 43; // SHA-256, base64url, unpadded

function stamp(secret: string, text: string): string {
  return createHmac('sha256', secret).update(text).digest('base64url');
}

/** The text with its signature on the end. */
export function sign(secret: string, text: string): string {
  return `${text}.${stamp(secret, text)}`;
}

/**
 * The text back, or nothing at all if a character of it moved.
 *
 * Compared in constant time. The timing of a string comparison leaks how much of a
 * guess was right, and a signature can be built a byte at a time out of that — it
 * is slow and it is entirely practical.
 */
export function unsign(secret: string, signed: string): string | null {
  const cut = signed.length - MARK - 1;
  if (cut <= 0 || signed[cut] !== '.') return null;
  const text = signed.slice(0, cut);
  const given = Buffer.from(signed.slice(cut + 1));
  const ours = Buffer.from(stamp(secret, text));
  if (given.length !== ours.length) return null;
  return timingSafeEqual(given, ours) ? text : null;
}

/** A value nobody can guess, for one-off nonces. */
export function nonce(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * What everything here is signed with.
 *
 * Missing in production is a refusal to start, not a warning. A back end that
 * invents a secret when it cannot find one is a back end whose sessions are
 * forgeable by anyone who reads the source, and it will run for months looking
 * perfectly healthy.
 *
 * Locally it falls back to a fixed string so that the site can be worked on before
 * anything has been configured — fixed rather than random so that a restart does
 * not sign you out mid-task.
 */
export function secretOf(env: NodeJS.ProcessEnv = process.env): string {
  const given = env.SESSION_SECRET;
  if (given && given.length >= 16) return given;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET не задан или короче 16 символов — в бою это отказ запускаться, ' +
        'иначе сессии подделает любой, кто читал исходники',
    );
  }
  return 'development-secret-not-for-anything-real';
}
