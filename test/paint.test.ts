import { describe, expect, it } from 'vitest';

import { SEAM, spread } from '../src/lib/paint.js';

/**
 * That a seam is covered whatever size the piece is.
 *
 * The bug this exists for: the overlap was a fraction of the quad — six
 * thousandths — which is a hairline on a whole face and nothing at all on a
 * sixteenth of one. When a folded limb began arriving as sixteen bands, every band
 * got a sixteenth of the cover it needed and the figure came out ruled with dozens
 * of thin dark lines, one at every seam of every band of every folded part.
 *
 * A seam is a property of the screen and not of the shape, so what covers it is
 * the same distance either way. That is the whole of what these check.
 */

const pad = SEAM;

describe('covering a seam', () => {
  it('grows a quad by the same distance whatever its size', () => {
    const big = spread([0, 0], [64, 0], [0, 64], pad);
    const small = spread([0, 0], [64, 0], [0, 1], pad);
    // The top edge of each has moved up by exactly the same amount.
    expect(big[0][1]).toBeCloseTo(-pad, 9);
    expect(small[0][1]).toBeCloseTo(-pad, 9);
    // And out along its length by the same amount too.
    expect(big[0][0]).toBeCloseTo(-pad, 9);
    expect(small[0][0]).toBeCloseTo(-pad, 9);
  });

  /**
   * Two bands that shared an edge now overlap by a whole pad, from both sides.
   *
   * Which is what closes the line: each covers the other's soft edge, and because
   * they carry the same skin across that boundary the overlap cannot be seen.
   */
  it('makes neighbouring bands overlap rather than abut', () => {
    const upper = spread([0, 0], [10, 0], [0, 5], pad);
    const lower = spread([0, 5], [10, 5], [0, 10], pad);
    const upperBottom = upper[2][1];
    const lowerTop = lower[0][1];
    expect(upperBottom).toBeGreaterThan(lowerTop);
    expect(upperBottom - lowerTop).toBeCloseTo(2 * pad, 9);
  });

  /** Grown along its own edges, so a turned quad grows the way it is turned. */
  it('grows along the quad’s own directions and not along the screen', () => {
    const turned = spread([0, 0], [0, 10], [-10, 0], pad);
    // Its "across" runs down the screen, so that is the direction it grew in.
    expect(turned[0][1]).toBeCloseTo(-pad, 9);
    expect(turned[0][0]).toBeCloseTo(pad, 9);
  });

  /**
   * A crease is not grown past.
   *
   * Wherever a surface carries on, the neighbour has the same skin at that point
   * and the same brightness, so the overlap is invisible and covers the soft edge
   * between them. At a fold neither holds: the halves meet at an angle, the skin
   * arrives from two directions, and one of them has been turned and is a
   * different brightness. Growing across it paints half a pixel of one half over
   * the other, which is a line down every elbow and knee.
   */
  it('does not grow past an end that is a crease', () => {
    const held = spread([0, 0], [10, 0], [0, 5], pad, { up: true, down: false });
    // The far end sits exactly where it was, and the near one still grew.
    expect(held[2][1]).toBeCloseTo(5, 9);
    expect(held[0][1]).toBeCloseTo(-pad, 9);

    const bothHeld = spread([0, 0], [10, 0], [0, 5], pad, { up: false, down: false });
    expect(bothHeld[0][1]).toBeCloseTo(0, 9);
    expect(bothHeld[2][1]).toBeCloseTo(5, 9);
    // And across its width it still grows, because that edge is not the crease.
    expect(bothHeld[0][0]).toBeCloseTo(-pad, 9);
  });

  /** A quad with no width has no edge to grow along, and no seam either. */
  it('leaves a degenerate quad alone rather than dividing by nothing', () => {
    const flat = spread([5, 5], [5, 5], [5, 5], pad);
    for (const corner of flat) {
      expect(Number.isFinite(corner[0])).toBe(true);
      expect(Number.isFinite(corner[1])).toBe(true);
    }
  });
});
