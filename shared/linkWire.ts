/**
 * Signing a program into an account with a short code, as both ends see it.
 *
 * The plugin cannot be sent back from the browser the way a page can: Blockbench has
 * no address of its own to return to, and in web Blockbench there is nothing to
 * return to at all. So the browser and the plugin never talk to each other. The
 * plugin asks the site for a request, opens a page for it, and keeps asking the site
 * whether anybody said yes.
 *
 * Two strings come out of one request, and the difference between them is the whole
 * of the safety here:
 *
 * - the **code** is public. It is shown in the plugin, it stands in the address of the
 *   page, and so it ends up in the browser's history and in anybody's screenshot;
 * - the **secret** is known only to the plugin that started the request, and it is
 *   what the key is handed to. Only a hash of it is kept, as with keys.
 *
 * Were the code alone enough to collect the key, anybody who saw it over a shoulder
 * would get the account. This is RFC 8628 with nothing added.
 */

/**
 * What a code is made of.
 *
 * Without O, 0, I and 1, the four that are read for each other at any size. Thirty-two
 * characters, so that a byte of randomness falls on one of them evenly and nothing has
 * to be drawn again — which is also why S and 5 both stay: dropping either leaves
 * thirty-one, and a code is read off one screen and compared by eye with the other,
 * usually never typed at all, since the plugin opens the page itself.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Four and four, with a dash between: `KXMP-7TRQ`. Forty bits. */
export const CODE_HALF = 4;

/** Every secret starts with this, so one pasted into the key field is recognisable. */
export const LINK_PREFIX = 'lnk_';

/** Random characters after the prefix: base62, about 238 bits, as for a key. */
export const LINK_RANDOM = 40;

/** How long a request waits for somebody to say yes. */
export const LINK_MINUTES = 10;

/** How often the plugin may ask, in seconds. The server says this, and the plugin obeys it. */
export const LINK_POLL_SECONDS = 3;

/** How a device may name itself. It becomes the key's name, so it is the same length. */
export const DEVICE_MAX = 40;

/**
 * Where a request stands.
 *
 * `taken` means the key has been handed over, and a request only ever reaches it
 * once: the plugin that collected the key has it, and asking again says `expired`.
 */
export type LinkState = 'waiting' | 'allowed' | 'denied' | 'taken';

/** The answer to starting a request: what to show, what to open, what to ask with. */
export interface LinkStart {
  code: string;
  /** Kept by the plugin and never shown. */
  secret: string;
  /** The page to open, built from the site's own address rather than from the plugin's. */
  url: string;
  /** Seconds between asks. */
  interval: number;
  expires: string;
}

/** What the page shows about a request before anybody agrees to it. */
export interface LinkAsked {
  code: string;
  /** What called itself that, cleaned: `Blockbench 5.2 · Windows`. */
  device: string;
  made: string;
  expires: string;
  state: LinkState;
  /** How many keys this account holds already, and how many it may: a full list is why a link fails. */
  keys: number;
  keysMax: number;
}

/** The answer to asking whether anybody said yes. */
export type LinkPoll =
  | { state: 'waiting' | 'denied' | 'expired' }
  | {
      state: 'taken';
      /** The key itself, this one time. */
      key: string;
      /** Who it belongs to, so the plugin can show a name without a second request. */
      id: string;
      handle: string;
      face: string | null;
    };

/** Whether a string has the shape of a code, before anything is looked up. */
export function looksLikeCode(text: string): boolean {
  const half = `[${CODE_ALPHABET}]{${CODE_HALF}}`;
  return new RegExp(`^${half}-${half}$`).test(text);
}

/** Whether a string has the shape of a secret. */
export function looksLikeLinkSecret(text: string): boolean {
  return (
    text.length === LINK_PREFIX.length + LINK_RANDOM &&
    text.startsWith(LINK_PREFIX) &&
    /^[0-9A-Za-z]+$/.test(text.slice(LINK_PREFIX.length))
  );
}

/**
 * Characters that are not there, and characters that turn text around.
 *
 * Zero width spaces and joiners, the direction marks, embeddings and overrides, the
 * isolates and their pop, and the byte order mark. Built from their numbers rather
 * than written out: a file holding the real characters would itself read wrongly in
 * an editor, which is the very trick being closed here.
 */
const UNSEEN_CODES = [
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
  0xfeff,
];
const UNSEEN = new RegExp(`[${UNSEEN_CODES.map((code) => String.fromCharCode(code)).join('')}]+`, 'g');

/**
 * The name a device gave itself, fit to be a key's name.
 *
 * Whatever arrives here is written by a program and shown to a person in two places —
 * the page that asks whether to allow it, and the list of keys afterwards. So it is
 * cut to length and stripped of the characters that would let it draw more than its
 * own line. An empty one is given a name rather than refused: the request is worth
 * more than its label.
 *
 * Cleaned harder than a model's name, and for a reason the other fields do not have:
 * this one line is the whole of what a person judges before letting a program into
 * their account. A name carrying a right-to-left override draws what follows it
 * backwards, so one can be built that reads on the page as something it is not. Those
 * characters are dropped rather than turned into spaces — a device that sent them sent
 * them for that.
 */
export function cleanDevice(said: unknown): string {
  const text = typeof said === 'string' ? said : '';
  const plain = text
    .replace(UNSEEN, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, DEVICE_MAX) || 'Blockbench';
}
