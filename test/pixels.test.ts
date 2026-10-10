import { describe, expect, it } from 'vitest';

import { compare, printOf, verdictOf } from '../server/pixels.js';
import { character, draw } from './help/skins.js';

/**
 * Telling one drawing from another.
 *
 * <h2>Why this is the part that matters</h2>
 *
 * Because it is the only piece of authorship a machine can decide at all. Nothing
 * here can know who drew a picture — a PNG carries no proof, and every outside
 * anchor can be arranged by anybody willing to spend ten minutes. What can be known
 * is whether two files are the same drawing, and for pixel art that is not a matter
 * of judgement: a skin is four thousand pixels and they can simply be laid on top
 * of each other.
 *
 * So the cases below are the ways somebody republishes another person's work
 * without being caught by a checksum: save it again from another editor, change one
 * pixel, run it through a hue shift, draw it at 512 and save it down to 64. All
 * four are ordinary and all four are cheap.
 *
 * <h2>Why these live away from the routes</h2>
 *
 * They need a PNG decoder and no database; the route tests need a database and no
 * decoder. Together in one file they need both at once, and a worker holding a
 * WebAssembly Postgres alongside zlib runs out of memory outside the JavaScript
 * heap — which fails in a way that says nothing about any of this.
 */

describe('telling one drawing from another', () => {
  it('knows a skin from itself saved again', () => {
    // Different bytes, same picture: this is what any editor does on save.
    const once = printOf(draw(character));
    const twice = printOf(draw(character));
    expect(once.exact).toBe(twice.exact);
    expect(verdictOf(compare(once, twice))).toBe('same');
  });

  /** The move the whole thing exists for. */
  it('is not fooled by one pixel', () => {
    const original = printOf(draw(character));
    const meddled = printOf(
      draw((x, y) => (x === 20 && y === 20 ? [255, 255, 255, 255] : character(x, y))),
    );
    expect(meddled.exact).not.toBe(original.exact);
    expect(verdictOf(compare(original, meddled))).toBe('same');
  });

  /**
   * The same character drawn large and saved down is the same character.
   *
   * A common way the same work appears twice, and one no checksum catches: every
   * byte differs and so does the size.
   */
  it('sees an HD skin and its small copy as one drawing', () => {
    const big = printOf(draw((x, y) => character(x >> 3, y >> 3), 512));
    const small = printOf(draw(character));
    expect(verdictOf(compare(big, small))).toBe('same');
  });

  /** A hue shift changes every pixel and nothing about whose work it is. */
  it('sees through a recolour', () => {
    const original = printOf(draw(character));
    const painted = printOf(
      draw((x, y) => {
        const [r, g, b, a] = character(x, y);
        return a ? [b, r, g, a] : [0, 0, 0, 0];
      }),
    );
    const likeness = compare(original, painted);
    expect(likeness.reshaped).toBeLessThan(0.02);
    expect(verdictOf(likeness)).toBe('close');
  });

  /**
   * And it does not say everything is everything.
   *
   * A check that finds copies everywhere is worse than none: it makes publishing
   * impossible and teaches people to ignore what it says.
   */
  it('leaves two different skins alone', () => {
    const one = printOf(draw(character));
    const two = printOf(
      draw((x, y) => (x + y) % 7 < 3 ? [200, 30, 30, 255] : [20, 20, 90, 255]),
    );
    expect(verdictOf(compare(one, two))).toBe('different');
  });

  /** Transparent pixels carry no colour, whatever an editor left under them. */
  it('ignores what is under a transparent pixel', () => {
    const clean = printOf(draw((x, y) => (character(x, y)[3] ? character(x, y) : [0, 0, 0, 0])));
    const littered = printOf(
      draw((x, y) => (character(x, y)[3] ? character(x, y) : [255, 0, 255, 0])),
    );
    expect(clean.exact).toBe(littered.exact);
  });
});

