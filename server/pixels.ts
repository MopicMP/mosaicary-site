import { createHash } from 'node:crypto';

import { PNG } from 'pngjs';

/**
 * Whether two skins are the same drawing.
 *
 * <h2>The problem this is for</h2>
 *
 * A fingerprint over the file catches an identical copy and nothing else. Open a
 * skin in any editor and save it again and every byte moves while the picture does
 * not; change one pixel of white to a slightly darker white and the same is true.
 * Both are how somebody republishes another person's work, and both are trivial.
 *
 * Pixel art is where this is easy, and it is worth saying why: a skin is four
 * thousand pixels, not a photograph. There is no compression to see through, no
 * scaling to undo, no camera. Two skins can simply be laid on top of each other and
 * the differing pixels counted. One pixel out of four thousand is not "similar", it
 * is the same drawing with one pixel changed, and no threshold has to be argued
 * about to see that.
 *
 * <h2>Why the pixels are looked at here and not in the browser</h2>
 *
 * The browser has already decoded the picture to draw it, and doing the arithmetic
 * there would be free. It would also be worthless: a signature computed by the page
 * is a signature the page can lie about, and the whole point is to catch somebody
 * who is willing to lie. Anything that decides whether a thing may be published has
 * to be worked out where the person cannot reach it.
 *
 * <h2>About decoding what somebody sent</h2>
 *
 * The shape check in {@code png.ts} deliberately does not decode, because running
 * an inflater over hostile bytes is the part of image handling with the interesting
 * bugs in it. That still holds and the order matters: nothing reaches here until it
 * has passed that check, and the inflater underneath is Node's own zlib rather than
 * one of ours.
 */

/** Every skin is compared at this size, whatever it was drawn at. */
export const GRID = 64;

/** The coarse grid used to shortlist candidates before comparing them properly. */
export const BLOCKS = 8;

export interface Print {
  /** The 64×64 picture, four bytes to a pixel, transparent pixels zeroed. */
  pixels: Buffer;
  /** SHA-256 of exactly that — equal means the same drawing, whatever the file. */
  exact: string;
  /** Average colour of each of sixty-four blocks: a cheap way to rule most out. */
  blocks: Buffer;
  /** How many pixels are drawn on at all. */
  ink: number;
}

/**
 * A skin reduced to something comparable.
 *
 * HD skins come down to 64×64 by averaging, so the same character drawn at 512 and
 * saved down to 64 lands in the same place — which is one of the ways the same work
 * appears twice. Fully transparent pixels are flattened to zero, because a
 * transparent pixel's colour is not part of the picture and editors disagree about
 * what to leave there.
 */
export function printOf(bytes: Buffer): Print {
  const png = PNG.sync.read(bytes);
  const scale = Math.max(1, Math.round(png.width / GRID));
  const pixels = Buffer.alloc(GRID * GRID * 4);
  let ink = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      // The mean of the block this cell stands for, weighted by how solid each
      // pixel is: a half-transparent pixel should not pull the colour as hard as
      // an opaque one, and a transparent one should not pull it at all.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      let seen = 0;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = x * scale + dx;
          const py = y * scale + dy;
          if (px >= png.width || py >= png.height) continue;
          const at = (py * png.width + px) * 4;
          const alpha = png.data[at + 3]!;
          r += png.data[at]! * alpha;
          g += png.data[at + 1]! * alpha;
          b += png.data[at + 2]! * alpha;
          a += alpha;
          weight += alpha;
          seen++;
        }
      }
      const out = (y * GRID + x) * 4;
      const solid = seen ? a / seen : 0;
      if (weight > 0 && solid >= 8) {
        pixels[out] = Math.round(r / weight);
        pixels[out + 1] = Math.round(g / weight);
        pixels[out + 2] = Math.round(b / weight);
        pixels[out + 3] = Math.round(solid);
        ink++;
      }
      // Otherwise it stays four zeroes: nothing is drawn here, and what colour
      // the file happens to keep under a transparent pixel is not the picture.
    }
  }

  return {
    pixels,
    exact: createHash('sha256').update(pixels).digest('hex').slice(0, 32),
    blocks: blocksOf(pixels),
    ink,
  };
}

/** Sixty-four average colours, three bytes each: the shortlisting signature. */
function blocksOf(pixels: Buffer): Buffer {
  const step = GRID / BLOCKS;
  const out = Buffer.alloc(BLOCKS * BLOCKS * 4);
  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let on = 0;
      for (let y = by * step; y < (by + 1) * step; y++) {
        for (let x = bx * step; x < (bx + 1) * step; x++) {
          const at = (y * GRID + x) * 4;
          if (!pixels[at + 3]) continue;
          r += pixels[at]!;
          g += pixels[at + 1]!;
          b += pixels[at + 2]!;
          on++;
        }
      }
      const to = (by * BLOCKS + bx) * 4;
      out[to] = on ? Math.round(r / on) : 0;
      out[to + 1] = on ? Math.round(g / on) : 0;
      out[to + 2] = on ? Math.round(b / on) : 0;
      // How full the block is, which is what tells a bare block from a black one.
      out[to + 3] = Math.round((on * 255) / (step * step));
    }
  }
  return out;
}

export interface Likeness {
  /** Share of pixels that differ at all, 0 to 1. */
  apart: number;
  /** Share of pixels whose transparency differs — the drawing's shape. */
  reshaped: number;
  /** Whether the same shape has been filled with different colours. */
  recoloured: boolean;
}

/**
 * How far apart two prepared skins are.
 *
 * Three numbers rather than one, because "the same" and "derived from" are
 * different questions and a single score answers neither. Shape apart from colour
 * matters especially: a skin run through a hue shift has every pixel changed and
 * is plainly the same work.
 */
export function compare(one: Print, two: Print): Likeness {
  const cells = GRID * GRID;
  let differs = 0;
  let shape = 0;
  let bothOn = 0;
  let colourApart = 0;

  for (let at = 0; at < cells; at++) {
    const i = at * 4;
    const aOn = one.pixels[i + 3]! > 0;
    const bOn = two.pixels[i + 3]! > 0;
    if (aOn !== bOn) {
      shape++;
      differs++;
      continue;
    }
    if (!aOn) continue;
    bothOn++;
    const gap =
      Math.abs(one.pixels[i]! - two.pixels[i]!) +
      Math.abs(one.pixels[i + 1]! - two.pixels[i + 1]!) +
      Math.abs(one.pixels[i + 2]! - two.pixels[i + 2]!);
    // Eight per channel of slack, for the rounding two editors do differently
    // when they save the same colour. Anything a person could see is far above it.
    if (gap > 24) {
      differs++;
      colourApart += gap;
    }
  }

  const drawn = Math.max(1, Math.max(one.ink, two.ink));
  return {
    apart: differs / drawn,
    reshaped: shape / drawn,
    // The same outline, filled differently: nearly every pixel is a different
    // colour and nearly none has moved.
    recoloured: shape / drawn < 0.02 && differs / drawn > 0.5 && colourApart / Math.max(1, bothOn) > 60,
  };
}

/**
 * How close is too close.
 *
 * Two lines rather than one, and the second is not a weakness. Somewhere between
 * "one pixel was changed" and "this was drawn again from scratch" there is a
 * boundary that does not exist, and a number pretending to know where it is would
 * be wrong in both directions. So: below the first line it is decided here, between
 * the lines a person decides, and above it nobody is asked.
 */
export const SAME = 0.01;
export const CLOSE = 0.08;

export type Verdict = 'same' | 'close' | 'different';

export function verdictOf(likeness: Likeness): Verdict {
  if (likeness.recoloured) return 'close';
  if (likeness.apart <= SAME) return 'same';
  if (likeness.apart <= CLOSE) return 'close';
  return 'different';
}

/**
 * How unlike two coarse signatures are, for ruling candidates out quickly.
 *
 * Sixty-four blocks against sixty-four blocks is nothing to compute, so the whole
 * catalogue can be swept before anything larger is read. It can only ever say "not
 * worth looking at" — everything it lets through is then compared properly.
 */
export function blocksApart(one: Buffer, two: Buffer): number {
  let sum = 0;
  for (let at = 0; at < one.length; at++) sum += Math.abs(one[at]! - two[at]!);
  return sum / one.length;
}

/** Above this the two are not the same drawing and there is nothing to compare. */
export const BLOCKS_ENOUGH = 24;
