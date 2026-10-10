import { describe, expect, it } from 'vitest';

import { readEmote, sample, tickAt, plain } from '../shared/emote.js';
import { BODY, FLAT, boneOf, extent, place } from '../src/lib/figure.js';
import { restOf, type Drawn, type Rig } from '../src/lib/rig.js';

/**
 * Reading an EmoteCraft animation, and putting it on a figure.
 *
 * The format is a flat list of moves where the same tick appears many times over,
 * one entry per limb. Everything here is about turning that inside out correctly,
 * and every way of getting it wrong produces an animation that plays — badly, in a
 * way nobody can point at.
 */

/** An animation as the files have it: a list of moves, each carrying some bones. */
function file(moves: object[], over: object = {}) {
  return {
    name: { fallback: '§aПоклон §7(Танец)', translate: 'x' },
    author: 'SPEmotes',
    description: { fallback: 'Здравствуйте' },
    emote: {
      isLoop: false,
      beginTick: 0,
      endTick: 20,
      stopTick: 24,
      returnTick: 2,
      degrees: false,
      moves,
      ...over,
    },
  };
}

describe('reading an animation', () => {
  it('turns a flat list of moves into a track per limb per channel', () => {
    const emote = readEmote(
      file([
        { tick: 0, easing: 'LINEAR', head: { pitch: 0 } },
        { tick: 0, easing: 'LINEAR', torso: { pitch: 0 } },
        { tick: 10, easing: 'LINEAR', head: { pitch: 1 } },
        { tick: 10, easing: 'LINEAR', torso: { pitch: 0.5 } },
      ]),
    );
    expect(Object.keys(emote.tracks).sort()).toEqual(['head', 'torso']);
    expect(emote.tracks.head!.pitch!.ticks).toEqual([0, 10]);
    expect(emote.tracks.torso!.pitch!.values).toEqual([0, 0.5]);
    // A limb nobody animated is absent rather than present and empty.
    expect(emote.tracks.rightArm).toBeUndefined();
  });

  it('keeps the name a person wrote, without the colour codes', () => {
    expect(readEmote(file([])).name).toBe('Поклон (Танец)');
    expect(plain('§8(1 §4Вариант§4)')).toBe('(1 Вариант)');
  });

  /** Nothing in the pack is in degrees, but a file that says so means it. */
  it('reads degrees as degrees', () => {
    const straight = readEmote(file([{ tick: 0, head: { pitch: 180 } }]));
    const turned = readEmote(file([{ tick: 0, head: { pitch: 180 } }], { degrees: true }));
    expect(straight.tracks.head!.pitch!.values[0]).toBe(180);
    expect(turned.tracks.head!.pitch!.values[0]).toBeCloseTo(Math.PI, 5);
    // An offset is a distance either way and is not an angle to convert.
    const shifted = readEmote(file([{ tick: 0, head: { y: 3 } }], { degrees: true }));
    expect(shifted.tracks.head!.y!.values[0]).toBe(3);
  });

  it('puts keyframes in order however the file had them', () => {
    const emote = readEmote(
      file([
        { tick: 10, head: { pitch: 1 } },
        { tick: 0, head: { pitch: 0 } },
        { tick: 5, head: { pitch: 3 } },
      ]),
    );
    expect(emote.tracks.head!.pitch!.ticks).toEqual([0, 5, 10]);
    expect(emote.tracks.head!.pitch!.values).toEqual([0, 3, 1]);
  });
});

describe('sampling', () => {
  const track = { ticks: [0, 10], values: [0, 10], easings: ['LINEAR' as const, 'LINEAR' as const] };

  it('interpolates between keyframes', () => {
    expect(sample(track, 0)).toBe(0);
    expect(sample(track, 5)).toBe(5);
    expect(sample(track, 10)).toBe(10);
  });

  /**
   * Outside its own range a track holds, and does not fall to nothing.
   *
   * A limb that snaps to its rest pose for the first frame and the last is the
   * commonest way one of these looks broken — and it looks like a bad animation
   * rather than like a bug in the reader.
   */
  it('holds its ends rather than falling to zero', () => {
    expect(sample(track, -5)).toBe(0);
    expect(sample(track, 99)).toBe(10);
  });

  /**
   * The easing belongs to the keyframe being left, not the one being arrived at.
   *
   * Which is the whole meaning of CONSTANT: it holds its own value until the next
   * keyframe replaces it. Attached the other way round it would step backwards
   * from the following frame, which is a different animation.
   */
  it('holds a constant keyframe until the next one', () => {
    const held = {
      ticks: [0, 10],
      values: [3, 7],
      easings: ['CONSTANT' as const, 'LINEAR' as const],
    };
    expect(sample(held, 1)).toBe(3);
    expect(sample(held, 9)).toBe(3);
    expect(sample(held, 10)).toBe(7);
  });

  it('eases where it is asked to', () => {
    const eased = {
      ticks: [0, 10],
      values: [0, 10],
      easings: ['EASEINOUTQUAD' as const, 'LINEAR' as const],
    };
    // Symmetric about the middle, and slower than a straight line at the start.
    expect(sample(eased, 5)).toBeCloseTo(5, 5);
    expect(sample(eased, 2)).toBeLessThan(2);
    expect(sample(eased, 8)).toBeGreaterThan(8);
  });
});

describe('where in an animation a moment falls', () => {
  const looping = readEmote(
    file([{ tick: 0, head: { pitch: 0 } }], { isLoop: true, beginTick: 4, endTick: 24 }),
  );

  /**
   * A loop repeats its body, not its run-in.
   *
   * Looping over the whole thing instead is what makes a dance start over from
   * standing every few seconds — the wind-up gets replayed on every cycle.
   */
  it('loops between begin and end, leaving the run-in alone', () => {
    expect(tickAt(looping, 0)).toBe(0);
    expect(tickAt(looping, 4 / 20)).toBe(4);
    expect(tickAt(looping, 24 / 20)).toBe(4);
    expect(tickAt(looping, 25 / 20)).toBe(5);
  });

  /**
   * The pack writes `"isLoop": "true"` — a string — in some of its files.
   *
   * Read as a boolean and nothing else, every looping animation in seven hundred
   * stops after one pass. It does not look like a bug: a dance that plays once and
   * freezes is exactly what a dance that was never meant to loop looks like, and
   * it was found only by counting how many of them loop and getting nought.
   */
  it('believes a loop however the file spells it', () => {
    for (const said of [true, 'true', 1, '1']) {
      expect(readEmote(file([], { isLoop: said })).loop).toBe(true);
    }
    for (const said of [false, 'false', 0, undefined, null]) {
      expect(readEmote(file([], { isLoop: said })).loop).toBe(false);
    }
  });

  it('stops at the end when it does not loop', () => {
    const once = readEmote(file([{ tick: 0, head: { pitch: 0 } }]));
    expect(tickAt(once, 100)).toBe(once.stopTick);
  });
});

describe('putting a pose on the figure', () => {
  it('knows which model part each animated bone is', () => {
    const named = BODY.map((part) => boneOf(part));
    expect(named).toEqual(['head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']);
  });

  /**
   * A limb turns at its joint, and at the game's joint rather than ours.
   *
   * Turned about its own middle instead, an arm passes through the chest — the
   * same mistake as the walk, and the same test catches it: at a right angle the
   * arm should end up four tall, centred on the shoulder it hangs from.
   */
  it('turns an arm about the shoulder the game hangs it from', () => {
    const arm = BODY.find((part) => part.at[0] < -4)!;
    const shoulder = restOf('rightArm', false)[1] - 24;
    const still = extent(place([arm], FLAT, false));
    const raised = extent(place([arm], FLAT, false, null, 1, rig({ rightArm: { pitch: Math.PI / 2 } })));

    expect(still.tall).toBeCloseTo(12, 5);
    expect(raised.tall).toBeCloseTo(4, 5);
    expect(raised.top + raised.tall / 2).toBeCloseTo(shoulder, 5);
  });

  it('leaves parts the animation says nothing about exactly where they were', () => {
    const plainPlace = place(BODY, FLAT, false);
    const posed = place(BODY, FLAT, false, null, 1, rig({ head: { yaw: 1 } }));
    const legs = (faces: typeof plainPlace) => faces.filter((face) => face.patch[1] >= 16);
    expect(legs(posed).map((f) => f.screen)).toEqual(legs(plainPlace).map((f) => f.screen));
  });

  /**
   * A limb's position is where it ends up, not how far it travelled.
   *
   * The finding the whole port turns on. Read as an offset, an arm authored at
   * x = −5 lands at −10 — which is a character with its arms flung off its body,
   * and exactly what this looked like before the mod's version was read.
   */
  it('puts a limb where the emote says, not that far from where it was', () => {
    const arm = BODY.find((part) => part.at[0] < -4)!;
    const rest = restOf('rightArm', false);
    const put = extent(place([arm], FLAT, false, null, 1, rig({ rightArm: {} }, [-5, 2, 0])));
    const still = extent(place([arm], FLAT, false));
    // Authored at exactly where it already hangs, so nothing moves at all.
    expect(put.left).toBeCloseTo(still.left, 5);
    expect(rest[0]).toBe(-5);
  });

  /** And a bone the emote throws away is not drawn at the edge of the frame. */
  it('drops a limb the emote has thrown away instead of dragging it back', () => {
    const arm = BODY.find((part) => part.at[0] < -4)!;
    const thrown: Rig = { parts: {}, root: still(), hidden: ['rightArm'] };
    expect(place([arm], FLAT, false, null, 1, thrown)).toEqual([]);
  });
});

function still(): Rig['root'] {
  return { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 };
}

/** A rig by hand, for the cases that are about the drawing rather than the reading. */
function rig(
  moves: Partial<Record<Drawn, { pitch?: number; yaw?: number; roll?: number }>>,
  at?: [number, number, number],
): Rig {
  const parts: Rig['parts'] = {};
  for (const [bone, turn] of Object.entries(moves)) {
    const rest = restOf(bone as Drawn, false);
    const hinge: [number, number, number] = [rest[0], rest[1] - 24, -rest[2]];
    const put = at ?? rest;
    parts[bone as Drawn] = {
      at: [put[0], put[1] - 24, -put[2]],
      hinge,
      pitch: turn.pitch ?? 0,
      yaw: turn.yaw ?? 0,
      roll: turn.roll ?? 0,
      bend: 0,
    };
  }
  return { parts, root: still(), hidden: [] };
}
