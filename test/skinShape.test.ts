import { describe, expect, it } from 'vitest';

import { armsIn, armsOfPixels } from '../shared/skinShape.js';
import { bodyOf, extent, place, FLAT } from '../src/lib/figure.js';

/**
 * Telling the two player models apart, and drawing the one that was meant.
 *
 * The failure this exists to stop is on screen and unmistakable: a three-pixel
 * skin drawn on the four-pixel model samples texture nobody filled in, so both
 * arms get a transparent stripe down the back of them. It looks like a corrupt
 * file rather than like the wrong model, which is why nobody reports it as this.
 */

/** A skin as a grid of alphas in sixty-fourths, blank unless drawn on. */
function sheet() {
  const alpha = new Uint8Array(64 * 64);
  return {
    fill(x: number, y: number, w: number, h: number, value = 255) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) alpha[j * 64 + i] = value;
      return this;
    },
    read: (x: number, y: number) => alpha[y * 64 + x] ?? 0,
  };
}

/**
 * The six faces of a box, laid out on the sheet the way the game lays them out.
 *
 * Built from the layout rather than hand-filled as a rectangle, because the point
 * of the whole exercise is *which* squares a narrow arm leaves alone — and a
 * fixture that fills a block of the right width would leave the wrong ones.
 */
function cross(
  it: ReturnType<typeof sheet>,
  u: number,
  v: number,
  w: number,
  h: number,
  d: number,
) {
  it.fill(u + d, v, w, d); // top
  it.fill(u + d + w, v, w, d); // bottom
  it.fill(u, v + d, d, h); // outer side
  it.fill(u + d, v + d, w, h); // front
  it.fill(u + d + w, v + d, d, h); // inner side
  it.fill(u + d + w + d, v + d, w, h); // back
  return it;
}

function arms(width: number) {
  const it = sheet();
  cross(it, 40, 16, width, 12, 4); // right arm
  cross(it, 32, 48, width, 12, 4); // left arm
  return it;
}

const wideArms = () => arms(4);
const slimArms = () => arms(3);

describe('which model a skin was drawn for', () => {
  it('reads four-pixel arms as the wide model', () => {
    expect(armsIn(wideArms().read, 64)).toBe('wide');
  });

  it('reads three-pixel arms as the narrow one', () => {
    expect(armsIn(slimArms().read, 64)).toBe('slim');
  });

  /**
   * One opaque pixel in the wrong place is enough to say wide.
   *
   * That direction is deliberate. Calling a wide skin narrow takes a column off
   * both its arms and is visible from across the room; calling a narrow skin wide
   * is what every viewer did before this existed.
   */
  it('needs only one pixel where the narrow layout has none', () => {
    const nearly = slimArms().fill(55, 25, 1, 1);
    expect(armsIn(nearly.read, 64)).toBe('wide');
  });

  /** The half-height layout from before 1.8 has one model and no left arm. */
  it('calls the old layout wide without looking', () => {
    expect(armsIn(slimArms().read, 32)).toBe('wide');
  });

  /**
   * A blank arm says nothing, and a guess would be worse than the default.
   *
   * An empty skin passes the "those columns are clear" test trivially. Drawn as
   * narrow it would lose a column of arms it might have had.
   */
  it('does not read an empty skin as narrow', () => {
    expect(armsIn(sheet().read, 64)).toBe('wide');
  });

  /** The same rule at HD, sampling in sixty-fourths rather than in pixels. */
  it('reads a skin drawn four times over at the same places', () => {
    const scale = 4;
    const side = 64 * scale;
    const rgba = new Uint8ClampedArray(side * side * 4);
    const paint = (x: number, y: number, w: number, h: number) => {
      for (let j = y * scale; j < (y + h) * scale; j++) {
        for (let i = x * scale; i < (x + w) * scale; i++) rgba[(j * side + i) * 4 + 3] = 255;
      }
    };
    const thin = slimArms();
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) if (thin.read(x, y)) paint(x, y, 1, 1);
    }
    expect(armsOfPixels(rgba, side, side)).toBe('slim');

    // One block where the narrow layout has nothing, and it is the wide one.
    paint(54, 20, 2, 12);
    expect(armsOfPixels(rgba, side, side)).toBe('wide');
  });
});

describe('drawing the narrow model', () => {
  it('makes the arms one pixel thinner and leaves the body alone', () => {
    const wide = bodyOf(false);
    const slim = bodyOf(true);
    const arm = (parts: ReturnType<typeof bodyOf>) => parts.find((p) => p.at[0] < -4)!;
    expect(arm(wide).size[0]).toBe(4);
    expect(arm(slim).size[0]).toBe(3);
    // Torso, head and legs are the same boxes in both.
    expect(slim[0]).toEqual(wide[0]);
    expect(slim[1]).toEqual(wide[1]);
    expect(slim[4]).toEqual(wide[4]);
  });

  /**
   * The arm hangs from the same shoulder; it is thinner on its outer edge.
   *
   * Thinned about its own middle instead, it would leave a gap between arm and
   * body on both sides — which is the other way this goes wrong and looks, once
   * again, like a broken file.
   */
  it('keeps the inner edge of the arm against the body', () => {
    for (const slim of [false, true]) {
      const arm = bodyOf(slim).find((p) => p.at[0] < -4)!;
      expect(arm.at[0] + arm.size[0] / 2).toBeCloseTo(-4, 5);
    }
  });

  /** And the whole figure is narrower by exactly the two pixels taken off. */
  it('comes out two pixels narrower across', () => {
    const wide = extent(place(bodyOf(false), FLAT, false));
    const slim = extent(place(bodyOf(true), FLAT, false));
    expect(wide.wide - slim.wide).toBeCloseTo(2, 5);
  });

  /**
   * The texture follows the box without being told.
   *
   * Every face works out where its pixels are from the size of the box it is on,
   * so a three-wide arm reads a three-wide cross by construction. This is the
   * test that says so, because the alternative — a second table of coordinates —
   * agrees with the first until somebody edits one of them.
   */
  it('reads a narrower cross for a narrower arm', () => {
    const armOnly = (slim: boolean) => bodyOf(slim).filter((p) => p.at[0] < -4);
    const wide = place(armOnly(false), FLAT, false);
    const slim = place(armOnly(true), FLAT, false);
    // The front face of the wide arm is four columns; of the narrow one, three.
    expect(Math.max(...wide.map((f) => f.patch[2]))).toBe(4);
    expect(Math.max(...slim.map((f) => f.patch[2]))).toBe(3);
    // And neither reaches past the arm's own cross on the sheet.
    for (const face of [...wide, ...slim]) {
      expect(face.patch[0]).toBeGreaterThanOrEqual(40);
      expect(face.patch[0] + face.patch[2]).toBeLessThanOrEqual(56);
    }
  });
});
