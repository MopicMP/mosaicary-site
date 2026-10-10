/**
 * API keys, as both ends see them.
 *
 * A key stands in for being signed in, for programs that cannot carry the site's
 * cookie: the Blockbench plugin first, scripts later. It is narrower than a session
 * on purpose. What it may do is listed in the Worker (`keyMayUse`), and what is not
 * listed is refused, so a new route is closed to keys until somebody decides it
 * should be open.
 */

/** Every key starts with this, so one pasted in the wrong place is recognisable. */
export const KEY_PREFIX = 'mos_';

/** Random characters after the prefix: base62, about 238 bits. */
export const KEY_RANDOM = 40;

/** How many keys one account may hold at once. */
export const KEYS_MAX = 10;

export const KEY_NAME_MAX = 40;

/** One key in its owner's list. Never the key itself: that is shown once and not kept. */
export interface ApiKey {
  id: string;
  name: string;
  /** The key's last four characters. */
  hint: string;
  created: string;
  /** To the hour; null for a key never used. */
  used: string | null;
}

/** The answer to making a key: the key itself, this one time. */
export interface MadeKey extends ApiKey {
  key: string;
}

/** Whether a string has the shape of a key at all, before anything is looked up. */
export function looksLikeKey(text: string): boolean {
  return text.length === KEY_PREFIX.length + KEY_RANDOM && text.startsWith(KEY_PREFIX) && /^[0-9A-Za-z]+$/.test(text.slice(KEY_PREFIX.length));
}
