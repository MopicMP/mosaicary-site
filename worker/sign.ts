/**
 * Handing a piece of text to a stranger and getting it back unchanged.
 *
 * The same scheme as the Node server had — text, a dot, an HMAC-SHA256 in base64url —
 * moved onto WebCrypto, which is what a Worker has instead of `node:crypto`. The
 * reasoning has not changed: a signed string carries who it is about and when it stops
 * being true, and needs no table of sessions read on every request.
 *
 * Verification goes through `crypto.subtle.verify`, which compares in constant time.
 * A plain string comparison leaks how much of a guess was right, and a signature can
 * be built a byte at a time out of that.
 */

const keys = new Map<string, Promise<CryptoKey>>();

function keyOf(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    keys.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(text)) return null;
  try {
    const plain = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i++) bytes[i] = plain.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * SHA-256 of a string, in hex.
 *
 * What a secret handed to somebody else is kept as: a key in `api_keys`, the plugin's
 * half of a sign-in request in `link_requests`. Both are looked up by this, so neither
 * is ever stored in a form that can be used.
 */
export async function hashHex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** The text with its signature on the end. */
export async function sign(secret: string, text: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await keyOf(secret), new TextEncoder().encode(text));
  return `${text}.${toBase64Url(new Uint8Array(mac))}`;
}

/** The text back, or nothing at all if a character of it moved. */
export async function unsign(secret: string, signed: string): Promise<string | null> {
  const cut = signed.lastIndexOf('.');
  if (cut <= 0) return null;
  const text = signed.slice(0, cut);
  const mac = fromBase64Url(signed.slice(cut + 1));
  if (!mac || mac.length !== 32) return null;
  const good = await crypto.subtle.verify('HMAC', await keyOf(secret), mac, new TextEncoder().encode(text));
  return good ? text : null;
}

/** An id nobody can guess: twelve characters of base62, about seventy bits. */
export function freshId(size = 12): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const out: string[] = [];
  // Drawn with rejection rather than with a modulo, so no letter is likelier than
  // another: 256 is not a multiple of 62.
  while (out.length < size) {
    for (const byte of crypto.getRandomValues(new Uint8Array(size * 2))) {
      if (byte < 248 && out.length < size) out.push(alphabet[byte % 62]!);
    }
  }
  return out.join('');
}

/**
 * What everything here is signed with, or nothing.
 *
 * Nothing rather than a made-up fallback. A Worker that invents a secret when it
 * cannot find one is a Worker whose sessions anybody who read the source can forge,
 * and it would run for months looking healthy. Without a secret, signing in says it is
 * not set up and everything else still works.
 */
export function secretOf(env: { SESSION_SECRET?: string }): string | null {
  const given = env.SESSION_SECRET;
  return given && given.length >= 16 ? given : null;
}
