import { describe, expect, it } from 'vitest';

import {
  SESSION_DAYS,
  STATE_MINUTES,
  bake,
  cookieOf,
  homely,
  makeSession,
  makeState,
  readSession,
  readState,
} from '../worker/session.js';
import { freshId, secretOf, sign, unsign } from '../worker/sign.js';

/**
 * That being signed in to the Worker means what it says.
 *
 * The same promises as the Node server's sessions, kept by WebCrypto instead of
 * `node:crypto`, and so checked again: a port is exactly where a check quietly stops
 * being made.
 */

const SECRET = 'a secret of more than sixteen characters';
const OTHER = 'another secret, also long enough';
const NOW = Date.parse('2026-10-06T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('a signed string', () => {
  it('comes back as it went', async () => {
    const signed = await sign(SECRET, 'discord:42~123');
    expect(await unsign(SECRET, signed)).toBe('discord:42~123');
  });

  it('comes back as nothing if any of it moved', async () => {
    const signed = await sign(SECRET, 'discord:42~123');
    expect(await unsign(SECRET, signed.replace('42', '43'))).toBeNull();
    // A letter in the middle of the signature: the last one carries padding bits, and
    // changing only those can decode to the same bytes.
    const at = signed.lastIndexOf('.') + 10;
    const swapped = `${signed.slice(0, at)}${signed[at] === 'A' ? 'B' : 'A'}${signed.slice(at + 1)}`;
    expect(await unsign(SECRET, swapped)).toBeNull();
    expect(await unsign(OTHER, signed)).toBeNull();
    expect(await unsign(SECRET, 'discord:42~123')).toBeNull();
    expect(await unsign(SECRET, 'discord:42~123.not+base64url')).toBeNull();
  });
});

describe('a session', () => {
  it('says who for as long as it lasts, and not a moment longer', async () => {
    const cookie = await makeSession(SECRET, 'github:7', NOW);
    expect(await readSession(SECRET, cookie, NOW)).toBe('github:7');
    expect(await readSession(SECRET, cookie, NOW + SESSION_DAYS * DAY - 1)).toBe('github:7');
    expect(await readSession(SECRET, cookie, NOW + SESSION_DAYS * DAY)).toBeNull();
  });

  it('cannot be lengthened by whoever holds it', async () => {
    const cookie = await makeSession(SECRET, 'github:7', NOW);
    const [text, mac] = [cookie.slice(0, cookie.lastIndexOf('.')), cookie.slice(cookie.lastIndexOf('.') + 1)];
    const until = Number(text.split('~')[1]);
    const longer = `github:7~${until + 365 * DAY}.${mac}`;
    expect(await readSession(SECRET, longer, NOW)).toBeNull();
  });

  it('keeps a user id that itself holds the separator', async () => {
    const cookie = await makeSession(SECRET, 'discord:odd~name', NOW);
    expect(await readSession(SECRET, cookie, NOW)).toBe('discord:odd~name');
  });

  it('is nobody when there is no cookie at all', async () => {
    expect(await readSession(SECRET, undefined, NOW)).toBeNull();
    expect(await readSession(SECRET, '', NOW)).toBeNull();
  });
});

describe('the trip to the provider and back', () => {
  it('brings the person back where they were', async () => {
    const state = await makeState(SECRET, 'discord', '/models/WVf8za092tQ4', NOW);
    expect(await readState(SECRET, 'discord', state, NOW)).toBe('/models/WVf8za092tQ4');
  });

  it('cannot be replayed at the other provider or after it is stale', async () => {
    const state = await makeState(SECRET, 'discord', '/me', NOW);
    expect(await readState(SECRET, 'github', state, NOW)).toBeNull();
    expect(await readState(SECRET, 'discord', state, NOW + STATE_MINUTES * 60 * 1000)).toBeNull();
  });

  it('never sends anybody off the site', async () => {
    for (const away of ['//evil.example', 'https://evil.example', '/\\evil.example', 'evil.example']) {
      expect(homely(away)).toBe('/');
      const state = await makeState(SECRET, 'github', away, NOW);
      expect(await readState(SECRET, 'github', state, NOW)).toBe('/');
    }
    expect(homely('/models/abc?x=1')).toBe('/models/abc?x=1');
  });

  // The browser, not the check, has the last word on where an address goes: it drops
  // tabs and line breaks and reads a backslash as a slash before following it.
  it('never sends anybody off the site, however the address is spelt', () => {
    const spellings = [
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/\t\\evil.example',
      '/\\/evil.example',
      '\t//evil.example',
      '/%09/evil.example',
      '/%2F%2Fevil.example',
      '/models/../../evil.example',
    ];
    for (const away of spellings) {
      const kept = homely(away);
      expect(new URL(kept, 'https://site.example/api/auth/discord/callback').origin).toBe('https://site.example');
      expect(() => new Headers({ location: kept })).not.toThrow();
    }
  });

  it('keeps the place on the site the person set off from', () => {
    expect(homely('/models/WVf8za092tQ4#talk')).toBe('/models/WVf8za092tQ4#talk');
    expect(homely('/rules#4.1')).toBe('/rules#4.1');
    expect(homely('/?q=dragon&sort=new')).toBe('/?q=dragon&sort=new');
  });
});

describe('the cookie itself', () => {
  it('cannot be read by a script and is not sent from another site', () => {
    const baked = bake('session', 'x', 60, true);
    expect(baked).toContain('HttpOnly');
    expect(baked).toContain('SameSite=Lax');
    expect(baked).toContain('Secure');
    expect(baked).toContain('Path=/');
    // Left off on plain http, where a browser would drop a Secure cookie on the floor.
    expect(bake('session', 'x', 60, false)).not.toContain('Secure');
  });

  it('carries a semicolon there and back', () => {
    const baked = bake('login_state', 'a;b', 60, false);
    const value = baked.split('; ')[0]!.slice('login_state='.length);
    const request = new Request('https://site.example/', { headers: { cookie: `other=1; login_state=${value}` } });
    expect(cookieOf(request, 'login_state')).toBe('a;b');
    expect(cookieOf(request, 'missing')).toBeUndefined();
  });
});

describe('the secret', () => {
  it('is refused when missing or short, rather than made up', () => {
    expect(secretOf({})).toBeNull();
    expect(secretOf({ SESSION_SECRET: 'short' })).toBeNull();
    expect(secretOf({ SESSION_SECRET: SECRET })).toBe(SECRET);
  });
});

describe('a fresh id', () => {
  it('is twelve letters and digits, and not the last one again', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = freshId();
      expect(id).toMatch(/^[0-9A-Za-z]{12}$/);
      seen.add(id);
    }
    expect(seen.size).toBe(1000);
  });
});
