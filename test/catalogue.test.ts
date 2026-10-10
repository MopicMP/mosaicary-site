import { describe, expect, it } from 'vitest';

import {
  NOBODY_KNOWN,
  NO_FILTERS,
  matches,
  narrowed,
  sift,
  tagsOf,
  toggle,
  type Filters,
  type Skin,
} from '../src/lib/catalogue.js';

/**
 * That the filter panel narrows and never quietly hides.
 *
 * A panel of a dozen controls has more combinations than anybody clicks through,
 * and the failure they produce is the one nobody reports properly: a skin that is
 * there but not shown. So the sifting is a pure function and this is where the
 * combinations are actually tried.
 */

const NOW = Date.parse('2026-08-14T12:00:00Z');

function skin(id: string, over: Partial<Skin> = {}): Skin {
  return {
    id,
    name: id,
    uploader: 'somebody',
    author: NOBODY_KNOWN,
    fingerprint: id.padEnd(32, '0'),
    url: `/skins/${id}.png`,
    width: 64,
    layout: 64,
    gender: 'neutral',
    tags: [],
    mask: null,
    hasOverlay: false,
    uploaded: '2026-08-01T12:00:00Z',
    stars: 0,
    ...over,
  };
}

const catalogue: Skin[] = [
  skin('ginger', { gender: 'girl', tags: ['рыжая', 'фэнтези'], stars: 40, mask: '8:1//' }),
  skin('knight', { gender: 'boy', tags: ['броня', 'фэнтези'], stars: 90, width: 128 }),
  skin('robot', { tags: ['техно'], stars: 10, width: 256, hasOverlay: true }),
  skin('witch', {
    gender: 'girl',
    tags: ['фэнтези', 'шляпа'],
    stars: 70,
    uploaded: '2026-08-13T12:00:00Z',
    mask: '10:2.2//',
  }),
];

function only(over: Partial<Filters>): Filters {
  return { ...NO_FILTERS, ...over };
}

describe('the catalogue filters', () => {
  it('shows everything when nothing has been touched', () => {
    expect(sift(catalogue, NO_FILTERS, NOW)).toHaveLength(catalogue.length);
    expect(narrowed(NO_FILTERS)).toBe(false);
  });

  /**
   * Where a search looks is chosen, not guessed.
   *
   * A search that quietly covers everything is the one that returns a skin whose
   * name has nothing to do with what was typed, and leaves nobody able to say why.
   */
  it('looks only where it was told to look', () => {
    const byTag = sift(catalogue, only({ search: 'фэнтези', scope: 'tag' }), NOW);
    expect(byTag).toHaveLength(3);
    expect(sift(catalogue, only({ search: 'фэнтези', scope: 'name' }), NOW)).toHaveLength(0);

    expect(sift(catalogue, only({ search: 'witch', scope: 'name' }), NOW).map((s) => s.id)).toEqual([
      'witch',
    ]);
    expect(sift(catalogue, only({ search: 'somebody', scope: 'author' }), NOW)).toHaveLength(4);
    expect(sift(catalogue, only({ search: 'somebody', scope: 'name' }), NOW)).toHaveLength(0);
  });

  /**
   * HD is a question people ask, so it is a control rather than a size in a list.
   *
   * Nobody thinks in pixel widths until they have already decided whether they
   * want a plain skin or a detailed one.
   */
  it('tells plain skins from HD ones', () => {
    expect(sift(catalogue, only({ quality: 'plain' }), NOW).map((s) => s.id).sort()).toEqual([
      'ginger',
      'witch',
    ]);
    expect(sift(catalogue, only({ quality: 'hd' }), NOW).map((s) => s.id).sort()).toEqual([
      'knight',
      'robot',
    ]);
    expect(sift(catalogue, only({ quality: 'any' }), NOW)).toHaveLength(4);
  });

  it('finds by every word, in any order, across name, author and tags', () => {
    const found = sift(catalogue, only({ search: 'фэнтези рыжая' }), NOW);
    expect(found.map((one) => one.id)).toEqual(['ginger']);
    // Order must not matter: people type what comes to mind first.
    expect(sift(catalogue, only({ search: 'рыжая фэнтези' }), NOW)).toEqual(found);
  });

  it('keeps only the chosen genders, and all of them when none is chosen', () => {
    expect(sift(catalogue, only({ genders: ['girl'] }), NOW).map((s) => s.id)).toEqual([
      'witch',
      'ginger',
    ]);
    expect(sift(catalogue, only({ genders: ['girl', 'boy'] }), NOW)).toHaveLength(3);
    expect(sift(catalogue, only({ genders: [] }), NOW)).toHaveLength(4);
  });

  /**
   * The switch that makes a tag panel worth having.
   *
   * "Any of these" is a wider net and "all of these" is a narrower one, and a
   * panel that only does the first is a panel that cannot answer a real question.
   */
  it('tells "any of these tags" from "all of these tags"', () => {
    const any = sift(catalogue, only({ tags: ['рыжая', 'броня'] }), NOW);
    expect(any.map((one) => one.id).sort()).toEqual(['ginger', 'knight']);

    const all = sift(catalogue, only({ tags: ['рыжая', 'фэнтези'], tagsAll: true }), NOW);
    expect(all.map((one) => one.id)).toEqual(['ginger']);
  });

  /**
   * Exclusion means none of these, whatever the include switch says.
   *
   * Following the OR/AND switch would make it "exclude all of these together",
   * which reads as nonsense and is never what anybody means.
   */
  it('excludes a tag regardless of the any/all switch', () => {
    for (const tagsAll of [false, true]) {
      const kept = sift(catalogue, only({ without: ['фэнтези'], tagsAll }), NOW);
      expect(kept.map((one) => one.id)).toEqual(['robot']);
    }
  });

  it('keeps only skins of the chosen native widths', () => {
    expect(sift(catalogue, only({ widths: [128, 256] }), NOW).map((s) => s.id).sort()).toEqual([
      'knight',
      'robot',
    ]);
  });

  it('can be asked for only what somebody has marked, and only what has an overlay', () => {
    expect(sift(catalogue, only({ markedOnly: true }), NOW).map((s) => s.id).sort()).toEqual([
      'ginger',
      'witch',
    ]);
    expect(sift(catalogue, only({ overlayOnly: true }), NOW).map((s) => s.id)).toEqual(['robot']);
  });

  it('counts an age limit in whole days from now', () => {
    expect(sift(catalogue, only({ within: 2 }), NOW).map((s) => s.id)).toEqual(['witch']);
    expect(sift(catalogue, only({ within: 30 }), NOW)).toHaveLength(4);
  });

  it('combines every clause rather than letting the last one win', () => {
    const kept = sift(
      catalogue,
      only({ genders: ['girl'], tags: ['фэнтези'], markedOnly: true, within: 30 }),
      NOW,
    );
    expect(kept.map((one) => one.id).sort()).toEqual(['ginger', 'witch']);
  });

  it('sorts newest, most starred, by name, and marked first', () => {
    expect(sift(catalogue, only({ sort: 'new' }), NOW)[0]?.id).toBe('witch');
    expect(sift(catalogue, only({ sort: 'popular' }), NOW)[0]?.id).toBe('knight');
    expect(sift(catalogue, only({ sort: 'name' }), NOW).map((s) => s.id)).toEqual([
      'ginger',
      'knight',
      'robot',
      'witch',
    ]);
    // Ours: a marked face is one that will actually blink, so it goes first.
    const marked = sift(catalogue, only({ sort: 'marked' }), NOW);
    expect(marked.slice(0, 2).map((one) => one.id)).toEqual(['witch', 'ginger']);
  });

  it('offers the catalogue’s own tags, commonest first', () => {
    expect(tagsOf(catalogue).slice(0, 2)).toEqual([
      { tag: 'фэнтези', count: 3 },
      { tag: 'броня', count: 1 },
    ]);
  });

  it('knows whether anything has been narrowed at all', () => {
    expect(narrowed(only({ search: '  ' }))).toBe(false);
    expect(narrowed(only({ markedOnly: true }))).toBe(true);
    expect(narrowed(only({ sort: 'popular' }))).toBe(false);
    expect(narrowed(only({ scope: 'tag' })), 'where to look is not a narrowing').toBe(false);
    expect(narrowed(only({ quality: 'hd' }))).toBe(true);
  });

  /** A chip adds, removes, and refuses to grow past what the panel can show. */
  it('toggles a chip and stops at the limit', () => {
    expect(toggle([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggle([1, 2], 2)).toEqual([1]);
    expect(toggle([1, 2], 3, 2)).toEqual([1, 2]);
    // Removing still works when the list is full, or a full panel would be stuck.
    expect(toggle([1, 2], 1, 2)).toEqual([2]);
  });

  it('never hides a skin the filters do not mention', () => {
    const plain = skin('plain');
    expect(matches(plain, NO_FILTERS, NOW)).toBe(true);
    expect(matches(plain, only({ sort: 'popular' }), NOW)).toBe(true);
  });
});
