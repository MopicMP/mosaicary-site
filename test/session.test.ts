import { describe, expect, it } from 'vitest';

import { authorizeUrl, faceUrl, wiringOf } from '../server/discord.js';
import { homely, makeSession, makeState, readSession, readState } from '../server/session.js';
import { nonce, secretOf, sign, unsign } from '../server/sign.js';

/**
 * That being signed in means what it says.
 *
 * This is the one part of the site where a mistake is not a mistake but a way in,
 * and every one of them looks perfectly healthy from the outside: a session that
 * never expires works, a signature that is not checked works, a redirect that is
 * not confined to this site works. They all work right up until somebody notices.
 */

const SECRET = 'a-secret-long-enough-to-be-one';

describe('signing', () => {
  it('gives the text back unchanged', () => {
    expect(unsign(SECRET, sign(SECRET, 'здравствуй'))).toBe('здравствуй');
  });

  it('refuses a text that moved by one character', () => {
    const signed = sign(SECRET, 'user-7');
    const meddled = signed.replace('user-7', 'user-8');
    expect(unsign(SECRET, meddled)).toBeNull();
  });

  it('refuses a signature made with somebody else’s secret', () => {
    expect(unsign(SECRET, sign('another-secret-entirely', 'user-7'))).toBeNull();
  });

  it('refuses rubbish without throwing', () => {
    for (const junk of ['', '.', 'no-dot-at-all', 'a.b', '....']) {
      expect(unsign(SECRET, junk)).toBeNull();
    }
  });

  it('never makes the same nonce twice', () => {
    const many = new Set(Array.from({ length: 200 }, () => nonce()));
    expect(many.size).toBe(200);
  });

  /** A secret invented at boot is a secret in the source, and forgeable. */
  it('refuses to invent a secret in production', () => {
    expect(() => secretOf({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow();
    expect(() =>
      secretOf({ NODE_ENV: 'production', SESSION_SECRET: 'short' } as NodeJS.ProcessEnv),
    ).toThrow();
    expect(secretOf({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeTruthy();
  });
});

describe('sessions', () => {
  it('knows who it is about', () => {
    const cookie = makeSession(SECRET, 'abc-123');
    expect(readSession(SECRET, cookie)).toBe('abc-123');
  });

  /**
   * The expiry is inside the signature, not only on the cookie.
   *
   * A cookie's own expiry is a note to the browser, and the browser is the thing
   * being distrusted. Kept only there, a session lasts as long as the client cares
   * to say it does — which is for ever.
   */
  it('stops being true when it runs out', () => {
    const made = Date.now();
    const cookie = makeSession(SECRET, 'abc-123', made);
    expect(readSession(SECRET, cookie, made + 29 * 24 * 3600_000)).toBe('abc-123');
    expect(readSession(SECRET, cookie, made + 31 * 24 * 3600_000)).toBeNull();
  });

  it('cannot be given a later expiry by hand', () => {
    const cookie = makeSession(SECRET, 'abc-123', Date.now());
    const forged = cookie.replace(/~\d+/, `~${Date.now() + 1e12}`);
    expect(readSession(SECRET, forged)).toBeNull();
  });

  it('is nothing when there is no cookie', () => {
    expect(readSession(SECRET, undefined)).toBeNull();
  });
});

describe('coming back from Discord', () => {
  it('remembers where the person was', () => {
    expect(readState(SECRET, makeState(SECRET, '/collections/7'))).toBe('/collections/7');
  });

  it('gives up on a return trip that took too long', () => {
    const made = Date.now();
    const state = makeState(SECRET, '/', made);
    expect(readState(SECRET, state, made + 11 * 60_000)).toBeNull();
  });

  /**
   * Anywhere but here becomes here.
   *
   * `//evil.example` is the case worth naming: it starts with a slash, it reads
   * like a path, and every browser treats it as another host. An unchecked "where
   * to next" turns a login into a way of forwarding people elsewhere with this
   * site's name in the address bar.
   */
  it('never sends anybody off this site', () => {
    expect(homely('//evil.example')).toBe('/');
    expect(homely('https://evil.example')).toBe('/');
    expect(homely('\\\\evil.example')).toBe('/');
    expect(homely('/skins/7')).toBe('/skins/7');
    // And not only in the helper: through the signed round trip as well.
    expect(readState(SECRET, makeState(SECRET, 'https://evil.example'))).toBe('/');
  });
});

describe('the Discord side', () => {
  const wiring = {
    clientId: '123',
    clientSecret: 'shh',
    redirectUri: 'https://example.test/api/auth/discord/callback',
  };

  it('asks for a name and nothing else', () => {
    const url = new URL(authorizeUrl(wiring, 'state-here'));
    expect(url.origin).toBe('https://discord.com');
    expect(url.searchParams.get('scope')).toBe('identify');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('state-here');
    // The redirect has to match what is registered to the character.
    expect(url.searchParams.get('redirect_uri')).toBe(wiring.redirectUri);
  });

  it('says it is not wired up rather than half working', () => {
    expect(wiringOf({} as NodeJS.ProcessEnv)).toBeNull();
    expect(wiringOf({ DISCORD_CLIENT_ID: '1' } as NodeJS.ProcessEnv)).toBeNull();
    expect(
      wiringOf({
        DISCORD_CLIENT_ID: '1',
        DISCORD_CLIENT_SECRET: '2',
        DISCORD_REDIRECT_URI: '3',
      } as NodeJS.ProcessEnv),
    ).not.toBeNull();
  });

  it('finds a picture only when there is one', () => {
    expect(faceUrl('42', null)).toBeNull();
    expect(faceUrl('42', 'abc')).toContain('/avatars/42/abc.png');
    // Discord marks a moving picture by the name of its hash, and it is a gif.
    expect(faceUrl('42', 'a_abc')).toContain('.gif');
  });
});
