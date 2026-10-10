import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FaceMask, KINDS, LAYERS, type Kind, type Layer } from '../shared/faceMask.js';

/**
 * That this side of the mask format agrees with the written contract.
 *
 * The mod has the other implementation, in Java, and the two never run in the same
 * process. Two encoders of one format do not diverge loudly — nothing throws, and
 * one day a face marked here simply appears in game a pixel out. So both sides are
 * held to the same file of reference strings and neither is allowed its own idea
 * of what a string means.
 *
 * See docs/face-mask-format.md.
 */

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../test/Eyes/mask-fixtures.json', import.meta.url)), 'utf8'),
) as Fixtures;

interface Marked {
  name?: string;
  why?: string;
  size: number;
  encoded: string;
  marks: Record<string, [number, number][]>;
}

interface Fixtures {
  cases: Marked[];
  unreadable: { encoded: string; why: string }[];
  old_form: Marked[];
  overrun: Marked;
}

/** Every cell a mask marks, as "KIND/LAYER x,y", sorted so two can be compared. */
function spelled(mask: FaceMask): string[] {
  const out: string[] = [];
  for (const kind of KINDS) {
    for (const layer of LAYERS) {
      for (let y = 0; y < mask.size; y++) {
        for (let x = 0; x < mask.size; x++) {
          if (mask.is(kind, layer, x, y)) out.push(`${kind}/${layer} ${x},${y}`);
        }
      }
    }
  }
  return out.sort();
}

function built(one: Marked): FaceMask {
  const mask = new FaceMask(one.size);
  for (const [key, cells] of Object.entries(one.marks)) {
    const [kind, layer] = key.split('/') as [Kind, Layer];
    for (const [x, y] of cells) mask.set(kind, layer, x, y, true);
  }
  return mask;
}

describe('the face mask format', () => {
  it('reads every reference string as the contract says', () => {
    for (const one of fixtures.cases) {
      expect(spelled(FaceMask.decode(one.encoded)), one.name).toEqual(spelled(built(one)));
    }
  });

  it('writes the reference strings character for character', () => {
    for (const one of fixtures.cases) {
      expect(built(one).encode(), one.name).toBe(one.encoded);
    }
  });

  it('treats an unreadable string as an unmarked face rather than throwing', () => {
    for (const one of fixtures.unreadable) {
      expect(FaceMask.decode(one.encoded).isNone, one.why).toBe(true);
    }
    expect(FaceMask.decode(null).isNone).toBe(true);
    expect(FaceMask.decode('').isNone).toBe(true);
  });

  it('still reads a mask written before lashes and layers existed', () => {
    for (const one of fixtures.old_form) {
      expect(spelled(FaceMask.decode(one.encoded)), one.why).toEqual(spelled(built(one)));
    }
  });

  it('cuts a run off at the edge of the face instead of overflowing', () => {
    const one = fixtures.overrun;
    const read = FaceMask.decode(one.encoded);
    expect(read.isNone).toBe(false);
    expect(spelled(read), one.why).toEqual(spelled(built(one)));
  });

  it('survives a round trip at every size a skin can be', () => {
    for (let size = 8; size <= 256; size *= 2) {
      const mask = new FaceMask(size);
      mask.set('EYE', 'FACE', 0, 0, true);
      mask.set('LASH', 'OVER', size - 1, size - 1, true);
      for (let x = size / 8; x < size / 3; x++) mask.set('WHITE', 'FACE', x, size / 4, true);

      const back = FaceMask.decode(mask.encode());
      expect(back.size, `size ${size}`).toBe(size);
      expect(spelled(back), `size ${size}`).toEqual(spelled(mask));
    }
  });

  it('folds a fine mask into the eighths the mod still speaks', () => {
    const mask = new FaceMask(32);
    // One cell, in the block that is face column 2, row 3 — on the outer layer,
    // which the coarse map has no room for and must fold in rather than drop.
    mask.set('EYE', 'OVER', 9, 13, true);
    mask.set('LASH', 'FACE', 0, 0, true);

    const coarse = mask.reduce();
    expect(coarse.eyes).toBe(1n << BigInt(3 * 8 + 2));
    expect(coarse.brows, 'a lash has nowhere else to go').toBe(1n);
    expect(coarse.whites).toBe(0n);
  });
});
