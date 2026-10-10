import { beforeAll, describe, expect, it } from 'vitest';

import { pathOfSkin, skinInPath } from '../src/lib/address.js';
import { fixLang } from '../src/lib/lang.js';
import { ago, plural } from '../src/lib/when.js';
import { loadWords } from '../src/lib/words.js';

/**
 * The two parts of the skin window that are arithmetic rather than layout.
 *
 * Everything else in that window is checked by looking at it. These two are not:
 * a wrong ending on a number and a path that reads one character too many both
 * look entirely fine until the one case that shows them, and neither case is one
 * anybody would click through on purpose.
 */

describe('addresses', () => {
  it('finds the skin an address names', () => {
    expect(skinInPath('/skins/night-guest')).toBe('night-guest');
    expect(skinInPath('/skins/night-guest/')).toBe('night-guest');
  });

  it('finds nothing anywhere else', () => {
    for (const path of ['/', '/skins', '/skins/', '/collections/7', '/skins/a/b']) {
      expect(skinInPath(path)).toBeNull();
    }
  });

  /**
   * What comes out of an address goes into a request.
   *
   * "Whatever was in the bar" is the oldest way for somebody outside to choose
   * what a page asks the server for, so the id is held to the shape of an id and
   * anything else is no skin at all.
   */
  it('refuses anything that is not shaped like an id', () => {
    expect(skinInPath('/skins/../../etc/passwd')).toBeNull();
    expect(skinInPath('/skins/' + 'x'.repeat(65))).toBeNull();
    expect(skinInPath('/skins/%2e%2e')).toBeNull();
  });

  it('writes an address the same rule can read back', () => {
    expect(skinInPath(pathOfSkin('abc-123'))).toBe('abc-123');
  });
});

/**
 * Read in Russian, because that is what these answers are written in.
 *
 * The words themselves are `Intl`'s and not ours — what is being checked is the
 * arithmetic around them: where days stop being useful and months begin. Settling the
 * language is what lets the figures be read at all.
 */
describe('how long ago', () => {
  const day = 86_400_000;
  const now = Date.parse('2026-08-14T12:00:00Z');
  const back = (days: number) => new Date(now - days * day).toISOString();

  beforeAll(async () => {
    fixLang('ru');
    await loadWords('ru');
  });

  it('says the near past in words rather than in numbers', () => {
    expect(ago(back(0), now)).toBe('сегодня');
    expect(ago(back(1), now)).toBe('вчера');
  });

  // The last of these is Intl's own idea of a year ago, which is a calendar year and
  // not a count: it says «в прошлом году» where we used to say «1 год назад».
  it('moves up a unit rather than counting to four hundred', () => {
    expect(ago(back(5), now)).toBe('5 дней назад');
    expect(ago(back(60), now)).toBe('2 месяца назад');
    expect(ago(back(412), now)).toBe('в прошлом году');
  });

  /** A date in the future is a clock that disagrees, not something to work out. */
  it('does not count backwards', () => {
    expect(ago(back(-3), now)).toBe('только что');
    expect(ago('это не дата', now)).toBe('только что');
  });

  /**
   * Eleven to fourteen are the trap.
   *
   * They end in one, two, three and four and take the many-form anyway. Without
   * this the site says "21 день" correctly and "11 день" wrongly — never noticed
   * by whoever wrote it, always read by everybody else.
   */
  it('counts in Russian', () => {
    expect(plural(1, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня');
    expect(plural(7, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(11, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(12, 'день', 'дня', 'дней')).toBe('дней');
    expect(plural(21, 'день', 'дня', 'дней')).toBe('день');
    expect(plural(22, 'день', 'дня', 'дней')).toBe('дня');
  });
});
