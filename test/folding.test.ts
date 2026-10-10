import { describe, expect, it } from 'vitest';

import { BODY, FLAT, extent, place } from '../src/lib/figure.js';
import { BANDS, MOST, allowed, angleAt, carry, fold, reachOf, swings } from '../src/lib/folding.js';
import { restOf, type Rig } from '../src/lib/rig.js';

/**
 * That a folded limb tiles: no surface twice anywhere, and none outside itself.
 *
 * These are the mod's own properties, ported one for one from `FoldingTest`,
 * because they are the specification and not a description. Nine attempts at the
 * hatching round a bent elbow were made from screenshots and eight were wrong: the
 * hatching was z-fighting — two surfaces of the same limb in the same place — so
 * what has to be shown is not that the fold looks right but that it is a
 * **bijection**: every scrap of skin lands somewhere, once.
 *
 * The fold turns y against z and never touches x, so a limb's whole behaviour is
 * an outline in a plane.
 */

/** An arm: twelve pixels long, four thick. Pixels here, blocks in the mod. */
const TOP = -2;
const BOTTOM = 10;
const ARM = 2;
const MIDDLE = (TOP + BOTTOM) / 2;

/** A sleeve is the same box inflated by a quarter of a pixel, all round. */
const SLEEVE = 2.25;

/** Which side of the joint's plane a point falls, and how far. */
function across(point: [number, number], bend: number): number {
  const tilt = bend / 2;
  return (point[0] - MIDDLE) * Math.cos(tilt) + point[1] * Math.sin(tilt);
}

function everyBend(step = 0.02): number[] {
  const out: number[] = [];
  for (let bend = -MOST; bend <= MOST; bend += step) out.push(bend);
  return out;
}

describe('a folded limb tiles', () => {
  /**
   * The two halves never reach across the joint.
   *
   * Both leans tilt their own end face by half the fold, so both end faces are the
   * bisector, and swinging the hand half by the whole fold lands its face on the
   * shoulder's. Everything one half keeps is then on one side of that plane and
   * everything the other keeps on the other — nothing for a depth buffer to be
   * undecided about, no hatching.
   */
  it('never lets either half reach across the joint', () => {
    for (const bend of everyBend()) {
      for (let i = 0; i <= 60; i++) {
        const y = TOP + ((BOTTOM - TOP) * i) / 60;
        for (let j = 0; j <= 20; j++) {
          const z = -SLEEVE + (2 * SLEEVE * j) / 20;
          const side = across(fold(y, z, TOP, BOTTOM, bend, ARM), bend);
          if (swings(y, TOP, BOTTOM)) expect(side).toBeGreaterThan(-1e-4);
          else expect(side).toBeLessThan(1e-4);
        }
      }
    }
  });

  /**
   * And there is no gap where they meet.
   *
   * Tiling alone is easy and useless — shrinking both halves to nothing manages
   * it. Where one half ends and the other begins has to be the same point of the
   * world, at every depth through the limb.
   */
  it('closes the joint at every depth', () => {
    for (const bend of everyBend()) {
      for (const z of [-SLEEVE, -ARM, 0, ARM, SLEEVE]) {
        const ends = fold(MIDDLE, z, TOP, BOTTOM, bend, ARM);
        const starts = fold(MIDDLE + 1e-9, z, TOP, BOTTOM, bend, ARM);
        expect(Math.hypot(ends[0] - starts[0], ends[1] - starts[1])).toBeLessThan(1e-4);
      }
    }
  });

  /**
   * No scrap of skin is ever drawn in two places.
   *
   * The guard the cutting version needed and did not have: cutting made each piece
   * reach past the middle for the surface the outside of a bend needs, so a band
   * of skin came out twice — which is what "the texture stands outside the model"
   * was. A lean cannot: along the limb the fold is strictly increasing at every
   * depth, so two heights never arrive at the same place.
   */
  it('never doubles back on itself', () => {
    for (const bend of everyBend(0.05)) {
      for (const z of [-SLEEVE, -ARM, 0, ARM, SLEEVE]) {
        let last = fold(TOP, z, TOP, BOTTOM, bend, ARM);
        for (let i = 1; i <= 200; i++) {
          const y = TOP + ((BOTTOM - TOP) * i) / 200;
          const now = fold(y, z, TOP, BOTTOM, bend, ARM);
          // Measured in the frame the step lands in: there is a crease at the
          // joint, and judging a step across it in the frame it left would call
          // every fold sharper than a right angle a reversal.
          const along = angleAt(y, TOP, BOTTOM, bend);
          const step = (now[0] - last[0]) * Math.cos(along) + (now[1] - last[1]) * Math.sin(along);
          expect(step).toBeGreaterThan(-1e-5);
          last = now;
        }
      }
    }
  });

  /**
   * Neither end of the limb is moved by the lean.
   *
   * A lean is nought at its own far end, so a shoulder stays on its shoulder
   * whatever the elbow does, and the hand is moved only by the swing — never
   * stretched, never slid along the arm. This is what keeps a limb the length the
   * animation aimed it.
   */
  it('leaves both ends where they were hung', () => {
    for (const bend of everyBend()) {
      for (const z of [-ARM, 0, ARM]) {
        const shoulder = fold(TOP, z, TOP, BOTTOM, bend, ARM);
        expect(shoulder[0]).toBeCloseTo(TOP, 5);
        expect(shoulder[1]).toBeCloseTo(z, 5);

        // The hand may be swung, but it is still exactly as far from the joint as
        // it started, and exactly as thick.
        const hand = fold(BOTTOM, z, TOP, BOTTOM, bend, ARM);
        const axis = fold(BOTTOM, 0, TOP, BOTTOM, bend, ARM);
        expect(Math.hypot(hand[0] - axis[0], hand[1] - axis[1])).toBeCloseTo(Math.abs(z), 4);
        expect(Math.hypot(axis[0] - MIDDLE, axis[1])).toBeCloseTo(BOTTOM - MIDDLE, 4);
      }
    }
  });

  /** A limb nobody bent comes through untouched, to the last decimal. */
  it('changes nothing at all at nought', () => {
    for (let i = 0; i <= 20; i++) {
      const y = TOP + ((BOTTOM - TOP) * i) / 20;
      for (const z of [-ARM, 0, ARM]) {
        expect(fold(y, z, TOP, BOTTOM, 0, ARM)).toEqual([y, z]);
      }
    }
  });

  /**
   * Away from the joint a limb is left exactly as it was drawn.
   *
   * The measurement this version exists for. bendy-lib ramps the lean over a whole
   * half, so every point is dragged a little — and because the lean is
   * proportional to depth, a limb's side gets one edge dragged forwards and the
   * other back: a sleeve's horizontal stripe came out diagonal and the pattern
   * smeared along the arm. The mitre only needs the lean full **at the joint**.
   */
  it('leaves everything outside the joint exactly as it was', () => {
    for (const bend of everyBend(0.05)) {
      const reach = reachOf(TOP, BOTTOM, bend, ARM);
      for (let i = 0; i <= 100; i++) {
        const y = TOP + ((BOTTOM - TOP) * i) / 100;
        if (Math.abs(y - MIDDLE) <= reach) continue;
        for (const z of [-SLEEVE, -ARM, 0, ARM, SLEEVE]) {
          const got = fold(y, z, TOP, BOTTOM, bend, ARM);
          const want = swings(y, TOP, BOTTOM) ? carry(y, z, MIDDLE, bend) : [y, z];
          expect(got[0]).toBeCloseTo(want[0], 6);
          expect(got[1]).toBeCloseTo(want[1], 6);
        }
      }
    }
  });

  /**
   * And at the joint itself the lean is bendy-lib's, to the last decimal.
   *
   * Holding the drag back changes **where** the lean is spent, not how much of it
   * there is. At the joint it has to be the full `tan(bend/2)·depth` the reference
   * computes, or the halves stop meeting and the construction comes apart.
   */
  it('leans by bendy-lib’s own amount at the joint', () => {
    for (const bend of everyBend(0.01)) {
      for (const z of [-SLEEVE, -ARM, ARM, SLEEVE]) {
        const theirs = Math.tan(bend / 2) * z;
        const ours = fold(MIDDLE, z, TOP, BOTTOM, bend, ARM);
        expect(MIDDLE - ours[0]).toBeCloseTo(theirs, 4);
      }
    }
  });

  /** A tangent runs away, so what is drawn is bounded whatever is asked for. */
  it('holds the sharpest fold it will draw', () => {
    expect(allowed(9)).toBe(MOST);
    expect(allowed(-9)).toBe(-MOST);
    expect(allowed(1)).toBe(1);
  });
});

describe('drawing a folded limb', () => {
  const arm = BODY.find((part) => part.at[0] < -4)!;
  const sleeve = { ...arm, size: [4.7, 12.7, 4.7] as [number, number, number], swell: 0.35 };

  function rig(bend: number): Rig {
    const rest = restOf('rightArm', false);
    const hinge: [number, number, number] = [rest[0], rest[1] - 24, -rest[2]];
    return {
      parts: { rightArm: { at: hinge, hinge, pitch: 0, yaw: 0, roll: 0, bend } },
      root: { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 },
      hidden: [],
    };
  }

  it('cuts a folded face into bands and leaves a straight one whole', () => {
    const straight = place([arm], FLAT, false, null, 1, rig(0));
    const bent = place([arm], FLAT, false, null, 1, rig(1));
    expect(bent.length).toBeGreaterThan(straight.length);
    expect(BANDS % 2).toBe(0);
  });

  /**
   * A sleeve folds along the limb's curve, never along its own.
   *
   * Given its own numbers a layer creases in a slightly different place from the
   * arm underneath, the arm shows through along that line, and what you see is a
   * hatched stripe across the middle of a sleeve — nowhere near the body, which is
   * what makes it look like limbs colliding.
   *
   * Shown by where the crease actually falls: the joint of the sleeve has to be at
   * the joint of the arm, not half a pixel below it.
   */
  it('folds a sleeve along the arm’s curve and not its own', () => {
    const armFaces = place([arm], FLAT, false, null, 1, rig(1.2));
    const sleeveFaces = place([sleeve], FLAT, false, null, 1, rig(1.2));

    const lowest = (faces: typeof armFaces) =>
      Math.max(...faces.flatMap((face) => face.screen.map(([, y]) => y)));
    // The sleeve is a quarter-pixel copy of the arm, so once both are folded the
    // same way their far ends stay that quarter-pixel apart. Measured from its own
    // taller box, the sleeve's joint sits lower and the two come apart.
    expect(lowest(sleeveFaces) - lowest(armFaces)).toBeLessThan(1);
  });

  it('shortens the limb it bends and keeps the shoulder still', () => {
    const straight = extent(place([arm], FLAT, false, null, 1, rig(0)));
    const bent = extent(place([arm], FLAT, false, null, 1, rig(1.5)));
    expect(bent.tall).toBeLessThan(straight.tall);
    expect(bent.top).toBeCloseTo(straight.top, 5);
  });

  /** Every band draws its own slice of the skin rather than the whole of it. */
  it('gives every band its own slice of the skin', () => {
    const bent = place([arm], FLAT, false, null, 1, rig(1));
    const byColumn = new Map<number, number[]>();
    for (const face of bent) {
      if (face.patch[3] >= 4) continue;
      const column = byColumn.get(face.patch[0]) ?? [];
      column.push(face.patch[3]);
      byColumn.set(face.patch[0], column);
    }
    expect(byColumn.size).toBeGreaterThan(0);
    for (const heights of byColumn.values()) {
      expect(new Set(heights).size).toBe(1);
      expect(heights.reduce((sum, one) => sum + one, 0)).toBeCloseTo(12, 5);
    }
  });

  /**
   * The half past the joint is lit for where it ended up.
   *
   * A lean slides a surface along itself and does not turn it, so the shoulder
   * half keeps its brightness exactly; the hand half has been turned by the whole
   * fold and is lit accordingly. Without it a folded forearm is lit as though it
   * still pointed the way it was hung, and the crook of an elbow reads flat.
   */
  /**
   * The two bands that meet at the joint do not bleed into each other.
   *
   * Everywhere else a band is drawn half a pixel past itself, and the neighbour
   * has the same skin and the same brightness there so the overlap cannot be
   * seen. At the fold the halves meet at an angle and one of them has been
   * turned, so bleeding paints half a pixel of one over the other — a line drawn
   * along every elbow and knee, which is exactly what it looked like.
   */
  it('lets only the nearer half cover the crease', () => {
    const bent = place([arm], FLAT, false, null, 1, rig(1.2));
    const held = bent.filter((face) => face.ends && (!face.ends.up || !face.ends.down));
    expect(held.length).toBeGreaterThan(0);

    // One band of each pair is held back, and it is the one behind: the half in
    // front is drawn last, so its overhang lands on top and is its own skin at
    // its own brightness. The half behind, given the same licence, would paint
    // half a pixel of itself over the one in front.
    for (const back of held) {
      const front = bent.find(
        (face) =>
          face !== back &&
          face.patch[0] === back.patch[0] &&
          Math.abs(face.patch[1] - back.patch[1]) - back.patch[3] < 1e-6 &&
          face.ends?.up &&
          face.ends?.down,
      );
      expect(front).toBeDefined();
      expect(front!.depth).toBeGreaterThanOrEqual(back.depth);
    }

    // And a limb that is not folding has no crease to hold anywhere.
    const straight = place([arm], FLAT, false, null, 1, rig(0));
    expect(straight.every((face) => (face.ends?.up ?? true) && (face.ends?.down ?? true))).toBe(
      true,
    );
  });

  /**
   * And nothing is ever lit brighter than the light there is.
   *
   * The blend was by the absolute values of the normal's components, which sum
   * to as much as 1.73 for a surface turned halfway between two directions. Above
   * one means "do not darken this at all", so the swung half of every folded limb
   * came out at full brightness against a shoulder at 0.88 — a hard bright step
   * exactly along the joint, which is the line that was there.
   */
  it('never lights a turned surface past full', () => {
    for (const bend of [0.3, 0.8, 1.2, 1.8, 2.2]) {
      for (const face of place([arm], FLAT, false, null, 1, rig(bend))) {
        expect(face.shade).toBeGreaterThan(0);
        expect(face.shade).toBeLessThanOrEqual(1);
      }
    }
  });

  it('lights the swung half for where it ended up', () => {
    // One face, cut into bands: the ones above the joint keep the brightness they
    // were drawn with, the ones below have been turned by the whole fold.
    const bandsOf = (faces: ReturnType<typeof place>) => {
      const column = new Map<number, Set<number>>();
      for (const face of faces) {
        if (face.patch[3] >= 4) continue;
        const shades = column.get(face.patch[0]) ?? new Set<number>();
        shades.add(Math.round(face.shade * 1000));
        column.set(face.patch[0], shades);
      }
      return column;
    };

    for (const shades of bandsOf(place([arm], FLAT, false, null, 1, rig(1.2))).values()) {
      expect(shades.size).toBe(2);
    }
    // And a limb that is not folding keeps one flat brightness per face.
    for (const shades of bandsOf(place([arm], FLAT, false, null, 1, rig(0))).values()) {
      expect(shades.size).toBe(1);
    }
  });
});
