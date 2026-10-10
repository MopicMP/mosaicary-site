import { describe, expect, it } from 'vitest';

import { readEmote } from '../shared/emote.js';
import { DISTANT, restOf, rigAt } from '../src/lib/rig.js';

/**
 * That the animation port matches the mod, rule for rule.
 *
 * Every one of these was arrived at in the mod by staring at what the pack
 * actually holds, and every one replaced something that rendered perfectly and was
 * wrong. They are written down here because a port has exactly one failure mode:
 * reproducing the first draft instead of the tenth.
 */

function emoteWith(moves: object[], over: object = {}) {
  return readEmote({
    name: { fallback: 'проба' },
    author: 'SPEmotes',
    description: { fallback: '' },
    emote: { isLoop: false, beginTick: 0, endTick: 10, stopTick: 10, degrees: false, moves, ...over },
  });
}

describe('a limb is placed, not nudged', () => {
  /**
   * The finding the whole thing turns on.
   *
   * Across the pack the right arm's x sits at exactly −5, which is where the
   * game's own arm already is. Read as an offset it lands at −10: a character
   * with its arms flung off its body, and precisely what this looked like.
   */
  it('reads an arm authored at its own rest position as not moving', () => {
    const rest = restOf('rightArm', false);
    const rig = rigAt(emoteWith([{ tick: 0, rightArm: { x: rest[0], y: rest[1], z: rest[2] } }]), 0);
    // Our coordinates put the origin at the floor rather than at the neck.
    expect(rig.parts.rightArm!.at).toEqual([rest[0], rest[1] - 24, -rest[2]]);
    expect(rig.parts.rightArm!.at).toEqual(rig.parts.rightArm!.hinge);
  });

  /** And a limb the emote says nothing about stays exactly where it hangs. */
  it('falls back to the rest position channel by channel', () => {
    const rig = rigAt(emoteWith([{ tick: 0, rightArm: { pitch: 1 } }]), 0);
    const rest = restOf('rightArm', false);
    expect(rig.parts.rightArm!.at).toEqual([rest[0], rest[1] - 24, -rest[2]]);
  });

  /**
   * A limb flung a long way is gone, not clamped to the edge of the box.
   *
   * Some emotes park a part thousands of units away; that is how the "walking
   * head" family gets rid of a body. Clamped, it sits at the edge of what is
   * allowed — a hand hanging in mid-air rather than a hand that has gone.
   */
  it('hides a limb that has been thrown away', () => {
    const rig = rigAt(emoteWith([{ tick: 0, rightArm: { z: -3200 } }]), 0);
    expect(rig.hidden).toContain('rightArm');
    expect(rig.parts.rightArm).toBeUndefined();
    // And one moved a long way but not absurdly is still drawn.
    const near = rigAt(emoteWith([{ tick: 0, rightArm: { z: DISTANT - 1 } }]), 0);
    expect(near.hidden).not.toContain('rightArm');
  });
});

describe('the torso is the exception', () => {
  /**
   * Its numbers are tiny — a sit is −0.69 — which is meaningless in pixels and
   * right in blocks, because moving a torso moves the whole character.
   */
  it('reads the torso as an offset in blocks and moves everything by it', () => {
    const rig = rigAt(emoteWith([{ tick: 0, torso: { y: -0.69 } }]), 0);
    // Sixteen pixels to a block, and the axis flips on the way out of the
    // emote's world into ours: a sit settles the body downwards.
    expect(rig.root.y).toBeCloseTo(0.69 * 16, 5);
    expect(rig.parts.rightArm).toBeUndefined();
  });

  /** Bows pitch negative, and until the sign was there a bow stood on its head. */
  it('flips pitch and yaw and leaves roll alone', () => {
    const rig = rigAt(emoteWith([{ tick: 0, torso: { pitch: 1, yaw: 0.5, roll: 0.25 } }]), 0);
    expect(rig.root.pitch).toBeCloseTo(-1, 5);
    expect(rig.root.yaw).toBeCloseTo(-0.5, 5);
    expect(rig.root.roll).toBeCloseTo(0.25, 5);
  });

  /**
   * A fold is not a lean, and adding them was a mistake worth naming.
   *
   * "Reading a book while sitting" wants a lean of 38° and a fold of 61°; added,
   * that is a hundred degrees — a character reading a book behind itself.
   */
  it('keeps the fold out of the lean', () => {
    const rig = rigAt(emoteWith([{ tick: 0, torso: { pitch: 0.66, bend: 1.06 } }]), 0);
    expect(rig.root.pitch).toBeCloseTo(-0.66, 5);
    // The fold turns in the same plane as the pitch, so it takes the same flip
    // into our depth — and the body is handed the negative of it, which lands it
    // back on the value the animator wrote.
    expect(rig.parts.torso!.bend).toBeCloseTo(1.06, 5);
  });

  /**
   * The legs go where a folded waist carries them.
   *
   * A fold swings the bottom of the body box, and that bottom is where the legs
   * hang from — but the legs are their own parts and no fold ever moved them. The
   * fighting pose bends by 0.63 radians, which carries the waist three and a half
   * pixels on a torso four pixels deep. That is the gap a character bending
   * forward used to leave its hips in.
   */
  it('carries the legs with a folded waist', () => {
    const straight = rigAt(
      emoteWith([{ tick: 0, torso: { bend: 0 }, rightLeg: { pitch: 0 } }]),
      0,
    );
    const folded = rigAt(
      emoteWith([{ tick: 0, torso: { bend: 0.63 }, rightLeg: { pitch: 0 } }]),
      0,
    );
    expect(folded.parts.rightLeg!.at[2]).not.toBeCloseTo(straight.parts.rightLeg!.at[2], 3);
    expect(folded.parts.rightLeg!.at[1]).toBeLessThan(straight.parts.rightLeg!.at[1]);
  });
});

describe('emotes that throw the body away', () => {
  /**
   * The walking heads.
   *
   * The format cannot say "do not draw this bone", so the author says it with
   * distance: the torso goes a hundred and eighty blocks down, and the bones that
   * should still be seen get an equal and opposite fling. Clamping both halves
   * keeps exactly the bones meant to leave and hides exactly the ones
   * compensating — the precise inverse of the intent, and what it looked like.
   */
  const walking = () =>
    rigAt(
      emoteWith([
        {
          tick: 0,
          torso: { y: -180, pitch: 1.57 },
          head: { z: -3200, pitch: 1.57 },
          rightLeg: { z: -3200, pitch: 1.2 },
          leftLeg: { z: -3200, pitch: 1.95 },
          rightArm: { pitch: 0.2 },
        },
      ]),
      0,
    );

  it('hides the body and keeps what was compensating for it', () => {
    const rig = walking();
    expect(rig.hidden).toContain('torso');
    expect(rig.parts.head).toBeDefined();
    expect(rig.parts.rightLeg).toBeDefined();
    // The arm was going with the body, so it goes.
    expect(rig.hidden).toContain('rightArm');
  });

  it('puts what it keeps back where it belongs rather than out at the clamp', () => {
    const rig = walking();
    const rest = restOf('rightLeg', false);
    expect(rig.parts.rightLeg!.at[0]).toBeCloseTo(rest[0], 5);
    expect(rig.parts.rightLeg!.at[2]).toBeCloseTo(0, 5);
  });

  /**
   * And the head comes down onto the hips.
   *
   * Everything put back where it rests leaves a gap exactly the height of the
   * body that is no longer there: twelve pixels of nothing between a head and a
   * pair of legs walking along underneath it.
   */
  it('drops the head onto the legs', () => {
    const rig = walking();
    const rest = restOf('head', false);
    expect(rig.parts.head!.at[1]).toBeCloseTo(rest[1] - 24 + 12, 5);
  });

  /**
   * The arithmetic checks itself.
   *
   * The legs are authored at pitches of 1.20 and 1.95 against a torso pitch of
   * 1.57. Subtract, and they swing between −0.37 and +0.38 radians — a walk cycle
   * of twenty-two degrees either side. Numbers that fall out as a walk were a walk.
   */
  it('turns a kept bone by its own angle less the torso’s', () => {
    const rig = walking();
    expect(rig.parts.rightLeg!.pitch).toBeCloseTo(0.37, 2);
    expect(rig.parts.leftLeg!.pitch).toBeCloseTo(-0.38, 2);
  });
});

describe('handing the body back', () => {
  /**
   * Emotes end wherever the animator left them, and a bow that ends bowed cannot
   * simply stop — so a gesture is faded out rather than dropped.
   */
  it('sits between rest and the emote at half strength', () => {
    const full = rigAt(emoteWith([{ tick: 0, rightArm: { x: 5 } }]), 0, false, 1);
    const half = rigAt(emoteWith([{ tick: 0, rightArm: { x: 5 } }]), 0, false, 0.5);
    const rest = restOf('rightArm', false);
    expect(full.parts.rightArm!.at[0]).toBeCloseTo(5, 5);
    expect(half.parts.rightArm!.at[0]).toBeCloseTo((rest[0] + 5) / 2, 5);
  });

  it('leaves a still figure completely alone', () => {
    const rig = rigAt(emoteWith([{ tick: 0, rightArm: { pitch: 1 } }]), 0, false, 0);
    expect(rig.root).toEqual({ pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 });
    expect(rig.parts.rightArm!.pitch).toBe(-0);
  });
});
