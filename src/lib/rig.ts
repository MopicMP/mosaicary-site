import { poseOf, type Bone, type Emote, type Pose } from '../../shared/emote.js';

/**
 * An emote turned into what to do with each box, following the mod exactly.
 *
 * <h2>Why this is a port and not a fresh attempt</h2>
 *
 * Because the mod's version is not a first draft. Every rule below was arrived at
 * by staring at what the pack actually contains, and each one replaced something
 * that rendered perfectly and was wrong. Writing it again from the format's
 * documentation would reproduce the first draft, not the tenth — which is what the
 * first attempt here did, and why the figures came out flailing.
 *
 * The findings, in the order they matter:
 *
 * <h2>1. A limb's x, y and z are where it ends up, not how far it moved</h2>
 *
 * This is the one that ruins everything if it is wrong. Across the pack the right
 * arm's x sits at exactly −5 and the left at +5, the legs at ∓1.9 and their y at
 * 12 — which is, to the decimal, where the game's own parts already are. An
 * animator writes down where a limb ends up. Added to the rest pose instead, every
 * one of them doubles: arms at ∓10, legs sunk to 24 — a character with its limbs
 * flung off its body, which is exactly what this looked like.
 *
 * <h2>2. The torso is the exception, and has to be</h2>
 *
 * Its numbers are tiny — a sit is −0.69, a crouch −0.13 — meaningless in pixels
 * and right in blocks, because moving a torso means moving the whole character
 * through the world. So it alone is an offset, times sixteen, and it moves
 * everything rather than one box.
 *
 * <h2>3. The torso turns about the waist, not about the neck</h2>
 *
 * A model part turns about its own origin and the body's origin is at the neck.
 * The pack settles it: "Лежать" pitches by exactly 90° and drops ten pixels.
 * Turned about the neck it lies in the air a quarter of a block up and those ten
 * pixels do not save it; turned about the waist it comes to rest on the ground,
 * which is what lying down is.
 *
 * <h2>4. Some emotes throw the body away to hide it</h2>
 *
 * The format cannot say "do not draw this bone", so authors say it with distance:
 * the torso goes a hundred and eighty blocks down, and the bones that should still
 * be seen get an equal and opposite fling that brings them back. Clamping both
 * halves of that cancellation keeps exactly the bones meant to leave and hides
 * exactly the ones compensating — the precise inverse of the intent.
 *
 * <h2>5. And the axes are flipped</h2>
 *
 * The game draws an entity model under a half turn about Z, so what the emote
 * calls x and y are the negatives of ours, and pitch and yaw with them. Roll and z
 * are untouched. Found twice over before it was understood as one thing: sitting
 * emotes settle their torso negative, and bows pitch negative — and until the sign
 * was there, a hundred-degree bow was a character standing on its head.
 */

/** The bones this draws. Held items are read and not drawn; there is no item. */
export const DRAWN = ['head', 'torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'] as const;
export type Drawn = (typeof DRAWN)[number];

/**
 * Where the game hangs each part, in the game's own model coordinates.
 *
 * This is the rest pose an emote's absolute positions are written against, so it
 * has to be the game's numbers and not ours. y counts downwards from the neck.
 */
export function restOf(bone: Drawn, slim: boolean): [number, number, number] {
  switch (bone) {
    case 'head':
    case 'torso':
      return [0, 0, 0];
    case 'rightArm':
      return [-5, slim ? 2.5 : 2, 0];
    case 'leftArm':
      return [5, slim ? 2.5 : 2, 0];
    case 'rightLeg':
      return [-1.9, 12, 0];
    case 'leftLeg':
      return [1.9, 12, 0];
  }
}

/** How far below the model's origin the body folds and turns. */
export const WAIST = 12;

/** Beyond this a limb is not being moved, it is being thrown away. */
export const DISTANT = 48;

/** And these are the furthest anything is actually placed. */
const LIMB_LIMIT = 64;
const TORSO_LIMIT = 3;

/** A torso offset is written in blocks and everything else in pixels. */
const TORSO_SCALE = 16;

export interface PartMove {
  /** Where this part's own hinge goes, in our coordinates. Absolute. */
  at: [number, number, number];
  /** And where that hinge rests, which is what the box is turned about. */
  hinge: [number, number, number];
  pitch: number;
  yaw: number;
  roll: number;
  /** How much the box folds at its middle, in radians. Approximated when drawn. */
  bend: number;
}

export interface Rig {
  parts: Partial<Record<Drawn, PartMove>>;
  /** The whole figure, about the waist. */
  root: { pitch: number; yaw: number; roll: number; x: number; y: number; z: number };
  /** Bones the emote is throwing away rather than moving. */
  hidden: Drawn[];
}

const STILL: Rig['root'] = { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 };

/**
 * The whole rig at a moment.
 *
 * @param strength nought to one — where between resting and the emote to sit.
 *                 Below one every part is part of the way, which is what lets a
 *                 gesture hand the body back instead of dropping it: emotes end
 *                 wherever the animator left them, and a bow that ends bowed
 *                 cannot simply stop.
 */
export function rigAt(emote: Emote, tick: number, slim = false, strength = 1): Rig {
  const s = Math.min(1, Math.max(0, strength));
  const poses = new Map<Drawn, Pose>();
  for (const bone of DRAWN) {
    const pose = poseOf(emote, bone as Bone, tick);
    if (pose) poses.set(bone, pose);
  }

  const torso = poses.get('torso');
  if (torso && thrownAway(torso)) return bodyPutAway(poses, slim, s);

  const rig: Rig = { parts: {}, root: { ...STILL }, hidden: [] };

  if (torso) {
    // Pitch and yaw are negated on the way out of the emote's world into ours;
    // roll is not. The bend is deliberately not part of this: a bend curves the
    // body at the waist while this swings the whole character, and adding them
    // gave "reading a book while sitting" a hundred degrees of lean — a person
    // reading a book behind themselves.
    rig.root.pitch = -(torso.pitch ?? 0) * s;
    rig.root.yaw = -(torso.yaw ?? 0) * s;
    rig.root.roll = (torso.roll ?? 0) * s;
    rig.root.x = -clamp(torso.x ?? 0, TORSO_LIMIT) * TORSO_SCALE * s;
    rig.root.y = -clamp(torso.y ?? 0, TORSO_LIMIT) * TORSO_SCALE * s;
    rig.root.z = clamp(torso.z ?? 0, TORSO_LIMIT) * TORSO_SCALE * s;
    rig.parts.torso = {
      at: ours([0, 0, 0]),
      hinge: ours([0, 0, 0]),
      pitch: 0,
      yaw: 0,
      roll: 0,
      // The mod hands the body `-bend`; into our depth that is `+bend`.
      bend: (torso.bend ?? 0) * s,
    };
  }

  for (const bone of DRAWN) {
    if (bone === 'torso') continue;
    const pose = poses.get(bone);
    if (!pose) continue;
    const rest = restOf(bone, slim);

    // Judged on where the emote wants the limb rather than on where a blend has
    // it this frame: a part flung off the model is gone for the whole gesture,
    // and judging the blend would bring it back partway through the ending.
    const wanted: [number, number, number] = [
      pose.x ?? rest[0],
      pose.y ?? rest[1],
      pose.z ?? rest[2],
    ];
    if (wanted.some((value, at) => Math.abs(value - rest[at]!) > DISTANT)) {
      rig.hidden.push(bone);
      continue;
    }

    rig.parts[bone] = {
      at: ours([
        clamp(mix(rest[0], wanted[0], s), LIMB_LIMIT),
        clamp(mix(rest[1], wanted[1], s), LIMB_LIMIT),
        clamp(mix(rest[2], wanted[2], s), LIMB_LIMIT),
      ]),
      hinge: ours(rest),
      pitch: -(pose.pitch ?? 0) * s,
      yaw: -(pose.yaw ?? 0) * s,
      roll: (pose.roll ?? 0) * s,
      // A fold turns y against z, which is the plane a pitch turns in — so it
      // takes the same sign flip on the way into our depth, and for the same
      // reason. Left as authored, every elbow and knee in the pack folds
      // backwards: a smooth joint, the right amount, the wrong way round.
      bend: -(pose.bend ?? 0) * s,
    };
  }

  followTheWaist(rig, torso, s);
  return rig;
}

/**
 * Moves the legs to wherever a folded torso has carried the waist.
 *
 * A torso bend folds the body box at its middle: everything below the joint
 * swings, and the bottom of that box is where the legs hang from — but the legs
 * are their own parts and no fold ever moved them. So a character bending forward
 * left its hips behind, and it is not subtle: the fighting pose bends by 0.63
 * radians, which swings the waist three and a half pixels back on a torso four
 * pixels deep.
 *
 * Added to where the tracks put the legs rather than replacing it: the emote has
 * its own opinion about the legs and this is only the correction for a fold it did
 * not know would be drawn.
 */
function followTheWaist(rig: Rig, torso: Pose | undefined, s: number): void {
  const fold = -(torso?.bend ?? 0) * s;
  if (!fold) return;
  const arm = WAIST / 2;
  const dy = arm * (Math.cos(fold) - 1);
  const dz = arm * Math.sin(fold);
  for (const bone of ['rightLeg', 'leftLeg'] as const) {
    const leg = rig.parts[bone];
    if (!leg) continue;
    leg.at[1] += dy;
    // Into our sense of depth, like every other z here.
    leg.at[2] -= dz;
  }
}

/**
 * A hundred and eighty blocks is not a lean.
 *
 * Nothing in the pack that means "shift the torso" goes past a couple of blocks,
 * so anything at this scale is the author reaching for the only way the format
 * gives to hide a bone: sending it somewhere nobody can see.
 */
function thrownAway(torso: Pose): boolean {
  return (
    Math.abs(torso.x ?? 0) > TORSO_LIMIT ||
    Math.abs(torso.y ?? 0) > TORSO_LIMIT ||
    Math.abs(torso.z ?? 0) > TORSO_LIMIT
  );
}

/**
 * The walking heads, and everything built the same way.
 *
 * The torso goes far enough to take everything with it, and the bones that should
 * still be seen are given an equal and opposite fling that cancels it. So the
 * cancellation is undone rather than clamped: a bone that was flung is put back
 * where it rests and turned by its own angle less the torso's, which is the
 * composition the author was writing. A bone that was not flung was going with the
 * body, so it goes.
 *
 * The arithmetic checks itself. The legs of the walking run are authored at
 * pitches of 1.20 to 1.95 against a torso pitch of 1.57; subtract, and they swing
 * between −0.37 and +0.38 radians. Numbers that fall out as a walk were a walk.
 */
function bodyPutAway(poses: Map<Drawn, Pose>, slim: boolean, s: number): Rig {
  const rig: Rig = { parts: {}, root: { ...STILL }, hidden: ['torso'] };
  const turn = (poses.get('torso')?.pitch ?? 0) * s;

  for (const bone of DRAWN) {
    if (bone === 'torso') continue;
    const pose = poses.get(bone);
    if (!pose) continue;
    const rest = restOf(bone, slim);

    const compensated =
      Math.abs((pose.x ?? rest[0]) - rest[0]) > LIMB_LIMIT ||
      Math.abs((pose.y ?? rest[1]) - rest[1]) > LIMB_LIMIT ||
      Math.abs((pose.z ?? rest[2]) - rest[2]) > LIMB_LIMIT;
    if (!compensated) {
      rig.hidden.push(bone);
      continue;
    }

    // And the head comes down onto the hips: everything put back where it rests
    // leaves a gap exactly the height of the body that is no longer there.
    const at = ours(rest);
    if (bone === 'head') at[1] += WAIST * s;

    rig.parts[bone] = {
      at,
      hinge: ours(rest),
      pitch: -((pose.pitch ?? 0) - turn) * s,
      yaw: -(pose.yaw ?? 0) * s,
      roll: (pose.roll ?? 0) * s,
      bend: 0,
    };
  }
  return rig;
}

/**
 * The game's model coordinates in ours.
 *
 * The origin moves from the neck to the floor, and depth changes hands: what the
 * model calls the front of a head is what we call the back of one.
 */
function ours(mc: [number, number, number]): [number, number, number] {
  return [mc[0], mc[1] - 24, -mc[2]];
}

function clamp(value: number, most: number): number {
  return Math.min(most, Math.max(-most, value));
}

/**
 * Part of the way from where a limb rests to where the emote wants it.
 *
 * Limb tracks are absolute, so unlike the torso there is nothing to scale and the
 * blend has to be written out. At full strength this is the emote exactly.
 */
export function mix(rest: number, wanted: number, strength: number): number {
  return rest + (wanted - rest) * strength;
}
