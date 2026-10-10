import { describe, expect, it } from 'vitest';

import {
  CODE_ALPHABET,
  CODE_HALF,
  DEVICE_MAX,
  LINK_MINUTES,
  LINK_POLL_SECONDS,
  LINK_PREFIX,
  LINK_RANDOM,
  cleanDevice,
  looksLikeCode,
  looksLikeLinkSecret,
} from '../shared/linkWire.js';
import { freshId } from '../worker/sign.js';

/**
 * That signing in by a short code tells the two strings apart, and that the name a
 * program gives itself cannot lie on the page that asks whether to allow it.
 *
 * The routes themselves — a request started, a code agreed to on the site, a key
 * handed over once and never twice, a code alone collecting nothing — are asked of a
 * running Worker by test/live/signin.mjs, since all of that is rows and sessions.
 */

const aSecret = () => LINK_PREFIX + freshId(LINK_RANDOM);

describe('the shape of a code', () => {
  it('is four and four from an alphabet without lookalikes', () => {
    expect(looksLikeCode('KXMP-7TRQ')).toBe(true);
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_HALF * 2).toBe(8);
  });

  it('holds neither half of the pairs that are read for each other', () => {
    for (const confusable of ['O', '0', 'I', '1']) expect(CODE_ALPHABET).not.toContain(confusable);
    // Thirty-two is what makes a byte of randomness fall on the alphabet evenly, so
    // the pairs that are told apart by their shape, S and 5 among them, are kept.
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
  });

  it('is not anything else, so nothing else is looked up', () => {
    expect(looksLikeCode('KXMP7TRQ')).toBe(false);
    expect(looksLikeCode('kxmp-7trq')).toBe(false);
    expect(looksLikeCode('KXM-7TRQ')).toBe(false);
    expect(looksLikeCode('KXMP-7TRQ ')).toBe(false);
    expect(looksLikeCode('O0I1-5555')).toBe(false);
    expect(looksLikeCode('')).toBe(false);
  });
});

describe('the shape of a secret', () => {
  it('is its own prefix and forty letters and digits, so it is told from a key at a glance', () => {
    const secret = aSecret();
    expect(looksLikeLinkSecret(secret)).toBe(true);
    expect(secret.startsWith(LINK_PREFIX)).toBe(true);
    expect(looksLikeLinkSecret(`mos_${secret.slice(LINK_PREFIX.length)}`)).toBe(false);
  });

  it('is not a code, and a code is not a secret: one is public and the other is the account', () => {
    expect(looksLikeLinkSecret('KXMP-7TRQ')).toBe(false);
    expect(looksLikeCode(aSecret())).toBe(false);
  });

  it('is not anything else, so nothing else reaches the database', () => {
    const secret = aSecret();
    expect(looksLikeLinkSecret(secret.slice(0, -1))).toBe(false);
    expect(looksLikeLinkSecret(`${secret}x`)).toBe(false);
    expect(looksLikeLinkSecret(`${secret.slice(0, -1)}-`)).toBe(false);
    expect(looksLikeLinkSecret('')).toBe(false);
  });
});

describe('how long a request lives', () => {
  it('waits long enough to read a page, and asks often enough not to be a wait', () => {
    expect(LINK_MINUTES).toBeGreaterThanOrEqual(5);
    expect(LINK_MINUTES).toBeLessThanOrEqual(15);
    expect(LINK_POLL_SECONDS).toBeGreaterThanOrEqual(2);
    // Two hundred asks over the ten minutes, against an allowance of sixty a minute.
    expect((LINK_MINUTES * 60) / LINK_POLL_SECONDS).toBeLessThan(60 * LINK_MINUTES);
  });
});

describe('the name a device gives itself', () => {
  it('is kept as it is when there is nothing wrong with it', () => {
    expect(cleanDevice('Blockbench 5.2 · Windows')).toBe('Blockbench 5.2 · Windows');
  });

  it('is given a name when it says nothing, rather than the request being lost', () => {
    expect(cleanDevice('')).toBe('Blockbench');
    expect(cleanDevice('   ')).toBe('Blockbench');
    expect(cleanDevice(undefined)).toBe('Blockbench');
    expect(cleanDevice(null)).toBe('Blockbench');
    expect(cleanDevice(42)).toBe('Blockbench');
    expect(cleanDevice({ device: 'x' })).toBe('Blockbench');
  });

  it('stays one line, so it cannot draw more than its own', () => {
    expect(cleanDevice('Blockbench\nweb')).toBe('Blockbench web');
    expect(cleanDevice('Blockbench\r\n\tweb')).toBe('Blockbench web');
    expect(cleanDevice('a\u0000b')).toBe('a b');
    expect(cleanDevice('a\u007fb')).toBe('a b');
  });

  it('is cut to the length of a key name', () => {
    expect(cleanDevice('x'.repeat(200))).toHaveLength(DEVICE_MAX);
  });

  it('loses what turns text around, so the page cannot be made to ask about something else', () => {
    // A right-to-left override with a reversed tail reads as "Blockbench nothing" and
    // is in fact a program calling itself something else entirely.
    const override = String.fromCharCode(0x202e);
    expect(cleanDevice(`Blockbench${override}gnihton`)).toBe('Blockbenchgnihton');
    expect(cleanDevice(`${override}Blockbench`)).toBe('Blockbench');
    for (const code of [0x200b, 0x200e, 0x202a, 0x2066, 0x2069, 0xfeff]) {
      expect(cleanDevice(`Block${String.fromCharCode(code)}bench`)).toBe('Blockbench');
    }
  });

  it('drops them rather than spacing them out, so nothing is left to hide a word behind', () => {
    expect(cleanDevice(`a${String.fromCharCode(0x200b)}b`)).toBe('ab');
    expect(cleanDevice(`a ${String.fromCharCode(0x200b)} b`)).toBe('a b');
  });
});
