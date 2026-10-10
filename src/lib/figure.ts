/**
 * A character drawn as boxes seen from a corner, rather than flat from the front.
 *
 * <h2>Why not a real three-dimensional renderer</h2>
 *
 * Because a skin is six flat rectangles per box and every one of them is a
 * parallelogram once the box is turned. A canvas can draw a parallelogram of an
 * image exactly — that is what an affine transform is — so the whole figure is
 * about forty `drawImage` calls and no WebGL, no shaders, no context that can fail
 * to be created on somebody's laptop.
 *
 * What that costs is what it cannot do: no perspective, no lighting beyond a flat
 * shade per side, and no correct sorting of things that interpenetrate. None of
 * those matter for a character made of boxes that do not touch.
 *
 * <h2>Why the sides are shaded</h2>
 *
 * A skin drawn without it is unreadable at this angle: the front of the torso and
 * the side of the arm are the same texture and the eye cannot find the edge. One
 * fixed multiplier per direction — brighter on top, darker on the side — is what
 * every voxel renderer does and it is enough.
 */

import { BANDS, allowed, angleAt, fold, shadeTurned } from './folding.js';
import type { Drawn, Rig } from './rig.js';

/** A box of the model: where it sits, how big, and where its faces are on the skin. */
export interface Part {
  /** The middle of the box in model space, in sixty-fourths of a skin. */
  at: [number, number, number];
  /** Its size along x, y and z. */
  size: [number, number, number];
  /** The top-left of the box's texture cross on the skin. */
  uv: [number, number];
  /** How much to swell it, for the outer layer. */
  swell?: number;
  /** Whether this part exists on a skin from before 1.8. */
  old?: boolean;
  /** Where to take the texture from instead, on an old skin (mirrored limbs). */
  oldUv?: [number, number];
  /**
   * Where the limb hangs from - the shoulder, the hip, the neck.
   *
   * A limb turned about its own middle scissors through the body; turned about
   * the joint it hangs from, it swings. That is the whole difference between a
   * walk and a mess, and it costs one point per part.
   */
  pivot?: [number, number, number];
  /**
   * Which way this part swings, as a multiple of the stride.
   *
   * Opposite arm to opposite leg, which is what walking is. Nought is a part that
   * does not swing at all, like the torso.
   */
  swing?: number;
}

/**
 * The vanilla figure, in the game's own numbers.
 *
 * y grows downwards, as it does in the model and in every texture; z grows towards
 * the viewer's back. The head sits above zero because that is where a head is.
 */
const NECK: [number, number, number] = [0, -24, 0];
const SHOULDER_RIGHT: [number, number, number] = [-4, -23, 0];
const SHOULDER_LEFT: [number, number, number] = [4, -23, 0];
const HIP_RIGHT: [number, number, number] = [-2, -12, 0];
const HIP_LEFT: [number, number, number] = [2, -12, 0];

/**
 * The two arm widths, and why the rest of the figure does not care.
 *
 * A narrow arm is three across instead of four, and it hangs from the same
 * shoulder — so it is not the body's arm moved, it is a thinner box whose inner
 * edge is in the same place. Its middle therefore sits half a pixel further out.
 *
 * Nothing else changes, and nothing here has to be told about the texture. Every
 * face works out where its pixels are from the box's own size, so a three-wide arm
 * reads a three-wide cross by construction. That is worth more than it looks: the
 * alternative is a second table of coordinates that agrees with this one until
 * somebody edits one of them.
 */
function arm(side: -1 | 1, slim: boolean, over: boolean): Part {
  const width = slim ? 3 : 4;
  const from = 4; // where the arm meets the body
  const middle = side * (from + width / 2);
  return {
    at: [middle, -18, 0],
    size: [width, 12, 4],
    uv: over ? (side < 0 ? [40, 32] : [48, 48]) : side < 0 ? [40, 16] : [32, 48],
    ...(over ? { swell: 0.35, old: false } : side > 0 ? { old: true, oldUv: [40, 16] } : {}),
    pivot: side < 0 ? SHOULDER_RIGHT : SHOULDER_LEFT,
    swing: side < 0 ? 1 : -1,
  } as Part;
}

export function bodyOf(slim = false): Part[] {
  return [
    { at: [0, -28, 0], size: [8, 8, 8], uv: [0, 0], pivot: NECK },
    { at: [0, -18, 0], size: [8, 12, 4], uv: [16, 16] },
    arm(-1, slim, false),
    arm(1, slim, false),
    { at: [-2, -6, 0], size: [4, 12, 4], uv: [0, 16], pivot: HIP_RIGHT, swing: -1 },
    {
      at: [2, -6, 0],
      size: [4, 12, 4],
      uv: [16, 48],
      old: true,
      oldUv: [0, 16],
      pivot: HIP_LEFT,
      swing: 1,
    },
  ];
}

export function overOf(slim = false): Part[] {
  return [
    { at: [0, -28, 0], size: [8, 8, 8], uv: [32, 0], swell: 0.6, pivot: NECK },
    { at: [0, -18, 0], size: [8, 12, 4], uv: [16, 32], swell: 0.35, old: false },
    arm(-1, slim, true),
    arm(1, slim, true),
    {
      at: [-2, -6, 0],
      size: [4, 12, 4],
      uv: [0, 32],
      swell: 0.35,
      old: false,
      pivot: HIP_RIGHT,
      swing: -1,
    },
    {
      at: [2, -6, 0],
      size: [4, 12, 4],
      uv: [0, 48],
      swell: 0.35,
      old: false,
      pivot: HIP_LEFT,
      swing: 1,
    },
  ];
}

/** The ordinary figure, kept as a value because most of the code wants only that. */
export const BODY: Part[] = bodyOf(false);
export const OVER: Part[] = overOf(false);

/** The six faces of a box, and where each sits on its texture cross. */
type FaceName = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

interface Face {
  /** Corners in the box's own space, as fractions of its size from its middle. */
  corners: [number, number, number][];
  /** Which way it looks, which is what decides how it is lit once it is folded. */
  normal: [number, number, number];
  /** Where the face sits on the cross, in units of the box's own size. */
  patch: (w: number, h: number, d: number) => [number, number, number, number];
  shade: number;
}

/**
 * How much darker each direction is.
 *
 * Not physics: the top is lit, the front is plain and the sides are darker, which
 * is the shading every voxel game uses because it is the least a person needs to
 * read a box as a box.
 */
const FACES: Record<FaceName, Face> = {
  top: {
    corners: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
    normal: [0, -1, 0],
    patch: (w, _h, d) => [d, 0, w, d],
    shade: 1.0,
  },
  bottom: {
    corners: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
    normal: [0, 1, 0],
    patch: (w, _h, d) => [d + w, 0, w, d],
    shade: 0.62,
  },
  front: {
    corners: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    normal: [0, 0, 1],
    patch: (w, h, d) => [d, d, w, h],
    shade: 0.88,
  },
  back: {
    corners: [
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
    ],
    normal: [0, 0, -1],
    patch: (w, h, d) => [d + w + d, d, w, h],
    shade: 0.7,
  },
  right: {
    corners: [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ],
    normal: [-1, 0, 0],
    patch: (_w, h, d) => [0, d, d, h],
    shade: 0.75,
  },
  left: {
    corners: [
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
    ],
    normal: [1, 0, 0],
    patch: (w, h, d) => [d + w, d, d, h],
    shade: 0.75,
  },
};

export interface Look {
  /** Turn about the upright axis, in radians. */
  spin: number;
  /** Tilt towards the viewer, in radians. */
  tilt: number;
}

/**
 * The angle a character is shown at.
 *
 * Turned a little and seen from very slightly above. The first attempt tipped it
 * by sixteen degrees, which is enough to see the tops of the shoulders and enough
 * to make the whole figure look squat - a thing seen from above reads as small.
 * Six degrees says "this is solid" and says nothing else.
 */
export const ANGLED: Look = { spin: -0.52, tilt: 0.11 };
export const FLAT: Look = { spin: 0, tilt: 0 };

/** How far the limbs swing at the top of a stride, in radians. */
const STRIDE_LEGS = 0.62;
const STRIDE_ARMS = 0.46;

/**
 * A walk, as two numbers.
 *
 * The whole of it: opposite arm to opposite leg on one sine, and the body rising
 * a little on each step. Anything more elaborate is an animation system, and this
 * is a picture of a skin that happens to be moving.
 *
 * The rise is what stops a walk looking like a pair of scissors opening and
 * shutting - it is small, twice as fast as the stride, and doing without it is
 * the commonest way one of these ends up looking wrong without anybody being able
 * to say why.
 *
 * @param phase where in the stride we are, in radians
 */
export function walk(phase: number): { swing: number; lift: number } {
  return { swing: Math.sin(phase), lift: Math.abs(Math.cos(phase)) * 0.45 };
}

/**
 * Where in a stride a figure stands when it is standing still.
 *
 * The reference does not animate anything: it shows a step that has been stopped.
 * That is a better picture of a character than a figure at attention, because
 * limbs hanging dead straight read as a shop dummy — and it is a better picture
 * than a figure actually walking, because thirty of those on one page is a page
 * nobody can read.
 *
 * Not far into the step. A quarter of a radian of swing is enough to say the legs
 * are separate things and to put one arm in front of the torso; past about twice
 * this the figure is mid-march, and a still picture of a march looks like a
 * mistake rather than a pose.
 */
export const POSE = 0.42;

interface Placed {
  /** The four screen corners of a face, clockwise from its top left. */
  screen: [number, number][];
  /**
   * Which of its two ends may be drawn a little past, to cover the seam.
   *
   * Both, wherever the surface carries on into its neighbour. Neither at a
   * crease: the two halves of a fold meet at an angle, with different skin
   * arriving from different directions and a different brightness because one of
   * them has been turned, so bleeding across it draws a line along the joint.
   */
  ends?: { up: boolean; down: boolean };
  /** Where its pixels are on the skin. */
  patch: [number, number, number, number];
  shade: number;
  /** How far away it is, for drawing the far things first. */
  depth: number;
}

/**
 * Works out where every visible face lands, far ones first.
 *
 * Nothing is drawn here. Keeping the arithmetic apart from the canvas is what lets
 * it be checked by a test — and the arithmetic is where the mistakes are, because
 * a face drawn back to front looks almost right.
 */
/**
 * Which animated bone each model part is.
 *
 * By position rather than by name, because the parts are a plain list and the one
 * thing certainly true about them is where they are: the head is above the neck,
 * the arms are outside the torso, the legs are below it.
 */
export function boneOf(part: Part): Drawn {
  if (part.at[1] < -24) return 'head';
  if (part.at[1] > -12) return part.at[0] < 0 ? 'rightLeg' : 'leftLeg';
  if (Math.abs(part.at[0]) >= 4) return part.at[0] < 0 ? 'rightArm' : 'leftArm';
  return 'torso';
}

export function place(
  parts: Part[],
  look: Look,
  old: boolean,
  phase: number | null = null,
  swellBy = 1,
  /**
   * An animation, as worked out by `lib/rig.ts`.
   *
   * Given, it replaces the pose entirely rather than adding to it: an emote is a
   * whole performance and not a flourish on top of one, and adding it to a walk
   * gives a character that waves while its arm is also swinging.
   */
  rig: Rig | null = null,
): Placed[] {
  /** The waist, which is what the body turns about — twelve below the neck. */
  const root = rig
    ? { ...rig.root, about: [0, -12, 0] as [number, number, number] }
    : null;
  const sin = Math.sin(look.spin);
  const cos = Math.cos(look.spin);
  const sinTilt = Math.sin(look.tilt);
  const cosTilt = Math.cos(look.tilt);
  const step = phase === null ? null : walk(phase);

  const out: Placed[] = [];
  for (const part of parts) {
    if (old && part.old === false) continue;
    const [u0, v0] = old && part.oldUv ? part.oldUv : part.uv;
    const grow = (part.swell ?? 0) * swellBy;
    const [w, h, d] = part.size;
    const size: [number, number, number] = [w + grow * 2, h + grow * 2, d + grow * 2];

    /**
     * What the animation does to this part, and where it hangs while doing it.
     *
     * The hinge is the game's own, not ours: an emote's positions are written
     * against where the game hangs its parts, and our walk uses a shoulder a
     * pixel away from it. One pixel is not much and a limb placed against the
     * wrong rest pose is off by it for the whole animation.
     */
    const bone = rig ? boneOf(part) : null;
    const moved = bone ? rig!.parts[bone] : undefined;
    const gone = bone ? rig!.hidden.includes(bone) : false;
    if (gone) continue;
    // The hinge the emote was written against: the game's own, carried on the
    // rig so that a narrow-armed figure and a wide one each get theirs.
    const hinge: [number, number, number] = moved ? moved.hinge : (part.pivot ?? NECK);

    /**
     * How much this box folds at its middle, and how finely it must be drawn.
     *
     * A fold is a shear, and a shear keeps flat things flat — but only outside
     * the stretch where the lean is ramping up. Across that stretch the map bends
     * in both directions at once, which one affine transform cannot draw, so a
     * folded face goes down in strips. An unfolded one stays a single quad, which
     * is every part of every figure that is not mid-emote.
     */
    const bend = moved ? allowed(moved.bend) : 0;
    /**
     * The limb's own extent — never the sleeve's.
     *
     * A sleeve is the arm inflated by a quarter of a pixel, so every box it could
     * measure is a fraction taller and deeper, and nothing done to a vertex here
     * is linear: given its own numbers the layer creases in a slightly different
     * place from the arm underneath. The arm then shows through along that line,
     * and what you see is a thin hatched stripe across the middle of a sleeve —
     * nowhere near the body, which is what makes it look like limbs colliding.
     *
     * `size` carries the swell; `part.size` does not, and `part.size` is the arm.
     */
    const top = part.at[1] - part.size[1] / 2;
    const bottom = part.at[1] + part.size[1] / 2;
    const halfDepth = part.size[2] / 2;

    for (const [name, face] of Object.entries(FACES) as [FaceName, Face][]) {
     // A face lying across the limb has no length to be cut along, so it is
     // drawn whole however sharply the limb folds — carried by its own corners
     // like anything else.
     const flat = face.corners.every((corner) => corner[1] === face.corners[0]![1]);
     const strips = bend && !flat ? BANDS : 1;
     // Where the two bands either side of the crease land, so that afterwards
     // the nearer of them can be told to cover the join.
     let above = -1;
     let below = -1;

     for (let strip = 0; strip < strips; strip++) {
      const from = strip / strips;
      const to = (strip + 1) / strips;
      const along = (
        one: [number, number, number],
        other: [number, number, number],
        t: number,
      ): [number, number, number] => [
        one[0] + (other[0] - one[0]) * t,
        one[1] + (other[1] - one[1]) * t,
        one[2] + (other[2] - one[2]) * t,
      ];
      const [c0, c1, c2, c3] = face.corners as [
        [number, number, number],
        [number, number, number],
        [number, number, number],
        [number, number, number],
      ];
      // Between the face's own top edge and its bottom one, which for every side
      // face is corners nought and one against three and two.
      const corners: [number, number, number][] =
        strips === 1
          ? face.corners
          : [along(c0, c3, from), along(c1, c2, from), along(c1, c2, to), along(c0, c3, to)];

      // The joint is at the middle of the limb, and BANDS is even, so it always
      // falls on a boundary between two bands. Which of those two may be drawn
      // past the crease is settled below, once both have been placed and it is
      // known which of them is nearer.
      const atJoint = (t: number) => bend !== 0 && Math.abs(t - 0.5) < 1e-9;
      const ends = { up: true, down: true };

      const screen: [number, number][] = [];
      let middle = 0;
      let normal: [number, number, number] = [0, 0, 0];
      // Where this strip sits along the limb, taken before the fold moves it —
      // which is the height that decides whether it has been turned.
      const midY =
        part.at[1] +
        (corners.reduce((sum, corner) => sum + corner[1], 0) / corners.length) * size[1];

      for (const corner of corners) {
        let x = part.at[0] + corner[0] * size[0];
        let y = part.at[1] + corner[1] * size[1];
        let z = part.at[2] + corner[2] * size[2];

        // Folded in the limb's own space, before anything else is done to it: a
        // fold is a property of the box, not of where the box has been put.
        if (bend) {
          const [bentY, bentZ] = fold(y, z - part.at[2], top, bottom, bend, halfDepth);
          y = bentY;
          z = part.at[2] + bentZ;
        }

        /**
         * The animation, about the part's own hinge.
         *
         * Three turns and then a placement, and the placement is absolute: an
         * emote says where a limb ends up, not how far it travelled. The order
         * of the turns is the game's — x, then y, then z — and it is not a
         * preference, because rotations do not commute and a different order is
         * a different pose.
         */
        if (moved) {
          let dx = x - hinge[0];
          let dy = y - hinge[1];
          let dz = z - hinge[2];

          if (moved.pitch) {
            const sinP = Math.sin(moved.pitch);
            const cosP = Math.cos(moved.pitch);
            const ny = dy * cosP - dz * sinP;
            const nz = dy * sinP + dz * cosP;
            dy = ny;
            dz = nz;
          }
          if (moved.yaw) {
            const sinY = Math.sin(moved.yaw);
            const cosY = Math.cos(moved.yaw);
            const nx = dx * cosY + dz * sinY;
            const nz = -dx * sinY + dz * cosY;
            dx = nx;
            dz = nz;
          }
          if (moved.roll) {
            const sinR = Math.sin(moved.roll);
            const cosR = Math.cos(moved.roll);
            const nx = dx * cosR - dy * sinR;
            const ny = dx * sinR + dy * cosR;
            dx = nx;
            dy = ny;
          }

          // Where the emote puts the hinge, not where the hinge was.
          x = moved.at[0] + dx;
          y = moved.at[1] + dy;
          z = moved.at[2] + dz;
        }

        // Swung about the joint it hangs from rather than about its own middle.
        if (step && part.pivot && part.swing) {
          const reach = part.pivot[1] < -20 ? STRIDE_ARMS : STRIDE_LEGS;
          const angle = step.swing * part.swing * reach;
          const swung = Math.sin(angle);
          const still = Math.cos(angle);
          const dy = y - part.pivot[1];
          const dz = z - part.pivot[2];
          y = part.pivot[1] + dy * still - dz * swung;
          z = part.pivot[2] + dy * swung + dz * still;
        }
        if (step) y -= step.lift;

        /**
         * The whole character, turned about its waist and carried.
         *
         * A model part turns about its own origin, so turning the body sends the
         * waist somewhere else; turning about the waist instead leaves it where
         * it was and swings the body around it. The pack settles which is right:
         * "Лежать" pitches by exactly ninety degrees and drops ten pixels, which
         * only reaches the floor if the hips stayed put.
         */
        if (root) {
          let dx = x - root.about[0];
          let dy = y - root.about[1];
          let dz = z - root.about[2];

          if (root.pitch) {
            const sinP = Math.sin(root.pitch);
            const cosP = Math.cos(root.pitch);
            const ny = dy * cosP - dz * sinP;
            const nz = dy * sinP + dz * cosP;
            dy = ny;
            dz = nz;
          }
          if (root.yaw) {
            const sinY = Math.sin(root.yaw);
            const cosY = Math.cos(root.yaw);
            const nx = dx * cosY + dz * sinY;
            const nz = -dx * sinY + dz * cosY;
            dx = nx;
            dz = nz;
          }
          if (root.roll) {
            const sinR = Math.sin(root.roll);
            const cosR = Math.cos(root.roll);
            const nx = dx * cosR - dy * sinR;
            const ny = dx * sinR + dy * cosR;
            dx = nx;
            dy = ny;
          }

          x = root.about[0] + dx + root.x;
          y = root.about[1] + dy + root.y;
          z = root.about[2] + dz + root.z;
        }

        // Turn about the upright axis, then tip the whole thing towards us.
        const rx = x * cos - z * sin;
        const rz = x * sin + z * cos;
        const ry = y * cosTilt - rz * sinTilt;
        const dz = y * sinTilt + rz * cosTilt;

        screen.push([rx, ry]);
        middle += dz;
      }

      // Which way the face points, after the same turn — the sign of the cross
      // product of two of its screen edges. A face pointing away is not drawn,
      // which halves the work and, more to the point, means a face can never be
      // painted over the one in front of it.
      const [a, b, c] = [screen[0]!, screen[1]!, screen[2]!];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 0) continue;
      normal = [0, 0, 0];
      void normal;
      void name;

      // The strip's own slice of the texture, so a face cut into ten pieces
      // draws ten tenths of itself rather than ten copies of the whole.
      const whole = shift(face.patch(w, h, d), u0, v0);
      const patch: [number, number, number, number] =
        strips === 1
          ? whole
          : [whole[0], whole[1] + whole[3] * from, whole[2], whole[3] / strips];

      /**
       * And lit for where the surface ended up rather than where it started.
       *
       * The half past the joint has been turned by the whole fold; the half
       * before it has not moved at all, because a lean slides a surface along
       * itself rather than turning it — so there is nothing in between to
       * account for. Left out, a folded forearm is lit as though it still
       * pointed the way it was hung, and the crook of an elbow reads flat.
       */
      const shade = bend
        ? shadeTurned(face.normal, angleAt(midY, top, bottom, bend))
        : face.shade;

      out.push({
        screen: screen as [number, number][],
        patch,
        shade,
        depth: middle / 4,
        ends,
      });

      // Noted after the push, because a band facing away is never pushed at all
      // and an index taken before would point at the next face along.
      if (atJoint(to)) above = out.length - 1;
      if (atJoint(from)) below = out.length - 1;
     }

     /**
      * Only the nearer half is drawn past the crease.
      *
      * The two bands meet exactly — measured, not assumed: every boundary
      * between bands comes out at a gap of zero. What a canvas leaves there is
      * a soft edge on each, and the two partial coverages add up to less than
      * one, so the dark behind shows through unless one of them covers the
      * other.
      *
      * Which one may is not free. The half in front is drawn last, so its
      * overhang lands on top and it is its own skin at its own brightness. The
      * half behind, given the same licence, would paint half a pixel of itself
      * over the one in front — the other half's skin, turned the other way, at
      * the other brightness. That is a line along the joint, and it is the line
      * that was there.
      */
     if (above >= 0 && below >= 0) {
       const nearer = out[above]!.depth >= out[below]!.depth ? above : below;
       if (nearer === above) out[above]!.ends = { up: true, down: true };
       else out[below]!.ends = { up: true, down: true };
       const farther = nearer === above ? below : above;
       out[farther]!.ends =
         farther === above ? { up: true, down: false } : { up: false, down: true };
     }
    }
  }
  // Far away first, so the near ones land on top. Boxes that do not touch need no
  // cleverer sorting than this.
  return out.sort((one, two) => one.depth - two.depth);
}

function shift(
  patch: [number, number, number, number],
  u: number,
  v: number,
): [number, number, number, number] {
  return [patch[0] + u, patch[1] + v, patch[2], patch[3]];
}

/** How wide and tall the placed faces come to, so a canvas can be sized to them. */
export function extent(faces: Placed[]): { left: number; top: number; wide: number; tall: number } {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const face of faces) {
    for (const [x, y] of face.screen) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, wide: right - left, tall: bottom - top };
}

export type { Placed };
