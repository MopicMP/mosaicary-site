import { describe, expect, it } from 'vitest';

import { ANGLED, BODY, FLAT, OVER, POSE, extent, place, walk } from '../src/lib/figure.js';

/**
 * That a figure turned at the corner is put together the right way round.
 *
 * This is the arithmetic, not the drawing, and it is where the mistakes live —
 * because every one of them produces a picture that looks *almost* right. A face
 * drawn back to front, a limb on the wrong side, a texture patch off by the depth
 * of the box: all of them render happily and all of them are wrong in a way that
 * takes a long time to name by looking.
 */

describe('placing a figure', () => {
  it('shows only the faces that point at the viewer', () => {
    const faces = place(BODY, ANGLED, false);
    for (const face of faces) {
      const [a, b, c] = face.screen;
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      expect(cross, 'a face pointing away was kept').toBeGreaterThan(0);
    }
  });

  /**
   * Three sides of a box at a time, never more.
   *
   * The check that catches a normal computed with the wrong sign: five or six
   * faces per box means everything is being drawn, and then whichever happens to
   * be last wins rather than whichever is nearest.
   */
  it('keeps three faces of each box and no more', () => {
    const faces = place([BODY[0]!], ANGLED, false);
    expect(faces).toHaveLength(3);
  });

  it('puts the far faces first, so the near ones land on top', () => {
    const faces = place(BODY, ANGLED, false);
    const depths = faces.map((face) => face.depth);
    expect(depths).toEqual([...depths].sort((one, two) => one - two));
  });

  /** The whole figure is thirty-two units tall, head to heel, as the model is. */
  it('comes out the height of a character', () => {
    const box = extent(place(BODY, FLAT, false));
    expect(box.tall).toBeCloseTo(32, 5);
    expect(box.wide).toBeCloseTo(16, 5);
  });

  /**
   * Flat, a box shows one face; turned, it shows three.
   *
   * The obvious test — "turned is wider" — is false and worth saying why, because
   * it was written and it failed. The arms are four deep and eight apart, so
   * turning brings their depth into the width and takes more out of it than it
   * puts in: sixteen units flat, under sixteen at this angle. Width proves
   * nothing. What proves the turn is that the sides and tops came into view.
   */
  it('shows one face of a box flat and three of it turned', () => {
    expect(place([BODY[0]!], FLAT, false)).toHaveLength(1);
    expect(place([BODY[0]!], ANGLED, false)).toHaveLength(3);
  });

  /**
   * A skin from before 1.8 has no jacket, no sleeves and no trousers.
   *
   * Drawn from the full table it samples rows the picture does not have. That is
   * what made seven of fifty real skins look like broken textures, so it is worth
   * a test rather than a comment.
   */
  it('drops the outer layer a half-height skin does not have', () => {
    const modern = place(OVER, ANGLED, false);
    const old = place(OVER, ANGLED, true);
    expect(old.length).toBeLessThan(modern.length);
    // The hat is the one piece the old layout does have.
    expect(old).toHaveLength(3);
  });

  /** And it takes the mirrored limbs from where the old layout actually keeps them. */
  it('takes an old skin’s left limbs from its right ones', () => {
    const leftArm = BODY.find((part) => part.at[0] === 6)!;
    const old = place([leftArm], ANGLED, true);
    for (const face of old) {
      // 40,16 is the right arm's cross; 32,48 is the left one, which is not there.
      expect(face.patch[0]).toBeGreaterThanOrEqual(40);
      expect(face.patch[1]).toBeLessThan(48);
    }
  });

  /** Every face takes its pixels from inside a 64-wide skin. */
  it('never reaches outside the skin', () => {
    for (const old of [false, true]) {
      for (const face of place([...BODY, ...OVER], ANGLED, old)) {
        const [u, v, w, h] = face.patch;
        expect(u).toBeGreaterThanOrEqual(0);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(u + w).toBeLessThanOrEqual(64);
        expect(v + h).toBeLessThanOrEqual(old ? 32 : 64);
      }
    }
  });
});

/**
 * That a walk is a walk.
 *
 * The three ways one of these goes wrong, all of which still render happily: the
 * limbs turn about their own middles and scissor through the body, both arms
 * swing the same way, and the figure changes width every frame so a grid of them
 * shimmers.
 */
describe('walking', () => {
  it('swings the opposite arm to the opposite leg', () => {
    const step = walk(Math.PI / 2);
    expect(step.swing).toBeCloseTo(1, 5);

    const rightArm = BODY.find((part) => part.at[0] === -6)!;
    const rightLeg = BODY.find((part) => part.at[0] === -2)!;
    const leftArm = BODY.find((part) => part.at[0] === 6)!;
    // An arm and the leg under it must never go the same way at the same time.
    expect(Math.sign(rightArm.swing!)).toBe(-Math.sign(rightLeg.swing!));
    expect(Math.sign(rightArm.swing!)).toBe(-Math.sign(leftArm.swing!));
  });

  it('hangs every swinging limb from a joint rather than from its own middle', () => {
    for (const part of [...BODY, ...OVER]) {
      if (!part.swing) continue;
      expect(part.pivot, 'a limb that swings needs somewhere to swing from').toBeDefined();
      // The joint is at the top of the limb, which is where a shoulder and a hip
      // are. Turned about the middle it would scissor straight through the body.
      const top = part.at[1] - part.size[1] / 2;
      expect(part.pivot![1]).toBeLessThanOrEqual(top + 1.5);
    }
  });

  it('never leaves the body still while the arms move', () => {
    // The rise is what stops a walk looking like scissors opening and shutting.
    const flat = walk(Math.PI / 2).lift;
    const step = walk(0).lift;
    expect(step).toBeGreaterThan(flat);
  });

  /**
   * Standing still is a stopped step, not attention and not a march.
   *
   * Both ends of that are worth holding. Nought swing is a shop dummy; a swing
   * near the top of the stride is a figure caught mid-march, which as a still
   * picture reads as a fault rather than as a pose.
   */
  it('stands in a step that has been stopped', () => {
    const still = walk(POSE).swing;
    expect(still).toBeGreaterThan(0.2);
    expect(still).toBeLessThan(0.6);

    // And the legs are actually apart in it: each moves off where it stands, and
    // the two move opposite ways. That is what a viewer reads as a step.
    const feet = [-2, 2].map((side) => {
      const leg = BODY.find((part) => part.at[0] === side)!;
      const still = extent(place([leg], ANGLED, false, null));
      const stepped = extent(place([leg], ANGLED, false, POSE));
      return stepped.left - still.left;
    });
    expect(Math.abs(feet[0]!)).toBeGreaterThan(0.5);
    expect(Math.sign(feet[0]!)).toBe(-Math.sign(feet[1]!));
  });

  /** The figure has one width for the whole stride, or a grid of them shimmers. */
  it('stays inside one box for the whole stride', () => {
    const quarters = [0, 0.5, 1, 1.5].map((turn) =>
      extent(place([...BODY, ...OVER], ANGLED, false, turn * Math.PI)),
    );
    const widest = extent(
      [0, 0.5, 1, 1.5].flatMap((turn) => place([...BODY, ...OVER], ANGLED, false, turn * Math.PI)),
    );
    for (const one of quarters) {
      expect(one.left).toBeGreaterThanOrEqual(widest.left - 1e-6);
      expect(one.wide).toBeLessThanOrEqual(widest.wide + 1e-6);
    }
  });
});
