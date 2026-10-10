/**
 * Folding a limb at its middle, which a box cannot do on its own.
 *
 * <h2>A joint is a mitre, and it is made by leaning rather than by cutting</h2>
 *
 * Two boxes meeting at an angle fit exactly when each is cut along the bisector —
 * a picture frame's corner. Getting there by actually cutting the box and moving
 * rigid pieces forces each piece to reach past the middle for the material the
 * outside of a bend needs, and so to borrow a band of skin from its neighbour and
 * draw it twice. That band is skin appearing where no skin belongs.
 *
 * There is no need to borrow. Lean the half instead: slide each point along the
 * limb by its depth times `tan(bend/2)`. The far end does not move, the joint end
 * moves the full amount, and the end face tilts by half the fold — which is the
 * bisector — so the halves still meet exactly and every scrap of surface a half
 * needs is found inside that half.
 *
 * This is how bendy-lib does it, which is the library Emotecraft actually bends
 * with. The arithmetic is that library's, by way of the mod's own port of it.
 *
 * <h2>Why the lean is not spread over the whole half</h2>
 *
 * bendy-lib ramps it from nothing at a half's far end to full at the joint, so
 * every point is dragged a little. That is fine for a plain surface and wrong for
 * a character drawn pixel by pixel: the lean is proportional to depth, so on a
 * limb's side — the one face whose depth varies across it — one edge is dragged
 * forwards and the other back, and a horizontal stripe on a sleeve comes out
 * diagonal with the rest of the pattern smeared along the arm.
 *
 * Nothing requires the drag to reach that far. The mitre closes as long as the
 * lean is full at the joint; where it starts is free. So it starts as late as the
 * angle allows and most of the limb is left exactly as it was drawn.
 */

/** The sharpest fold anything is drawn at, whatever the animation asks for. */
export const MOST = 2.2;

/** How much of itself the leaned stretch keeps, at its most compressed. */
const KEEP = 0.35;

/** The least of a limb the lean is ever spread over: a pixel and a half. */
const LEAST = 1.5;

export function allowed(bend: number): number {
  return Math.min(MOST, Math.max(-MOST, bend));
}

/**
 * How much of the limb the lean is spread over, either side of the joint.
 *
 * Set by the one thing that limits it: across this stretch the surface is
 * compressed by `depth · tan(bend/2) / reach`, and if that reaches one the limb
 * folds through itself. {@link KEEP} is what is held back from that, so a sharp
 * fold spreads and a gentle one stays a crease.
 */
export function reachOf(top: number, bottom: number, bend: number, halfDepth: number): number {
  const half = (bottom - top) / 2;
  if (half <= 0) return 0;
  const needed = Math.abs(Math.tan(bend / 2) * halfDepth) / (1 - KEEP);
  return Math.min(half, Math.max(Math.min(LEAST, half), needed));
}

/**
 * Where a point of the limb ends up.
 *
 * Two pieces and no cut. The shoulder half leans one way and stays where it is;
 * the hand half leans the other way and is then swung about the joint. Both leans
 * are nothing until {@link reachOf} of the joint and full at it, so both far ends
 * stay exactly where they were hung.
 *
 * @param y along the limb, in the same units as `top` and `bottom`
 * @param z depth from the limb's own middle
 */
export function fold(
  y: number,
  z: number,
  top: number,
  bottom: number,
  bend: number,
  halfDepth: number,
): [number, number] {
  const half = (bottom - top) / 2;
  if (half <= 0 || bend === 0) return [y, z];

  const middle = (top + bottom) / 2;
  const reach = reachOf(top, bottom, bend, halfDepth);
  if (reach <= 0) return [y, z];

  const lean = Math.tan(bend / 2) * z;

  if (y <= middle) {
    const ramp = Math.min(1, Math.max(0, (y - (middle - reach)) / reach));
    return [y - ramp * lean, z];
  }
  const ramp = Math.min(1, Math.max(0, (middle + reach - y) / reach));
  return carry(y + ramp * lean, z, middle, bend);
}

/**
 * Swings a point about the joint, rigidly.
 *
 * Kept apart because the hand half is turned by exactly this and nothing else — so
 * a hand is moved and turned, never stretched, whatever the joint above it does.
 */
export function carry(
  y: number,
  z: number,
  middle: number,
  angle: number,
): [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = y - middle;
  return [middle + along * cos - z * sin, along * sin + z * cos];
}

/** Whether a point belongs to the half that swings. */
export function swings(y: number, top: number, bottom: number): boolean {
  return y > (top + bottom) / 2;
}

/**
 * How far a surface at this height has been turned, for its shading.
 *
 * Nought on the shoulder half and the whole fold on the hand half. A lean does not
 * turn a surface — it slides it along itself — so there is nothing in between to
 * account for.
 */
export function angleAt(y: number, top: number, bottom: number, bend: number): number {
  return swings(y, top, bottom) ? bend : 0;
}

/**
 * How bright a face is once the fold has turned it.
 *
 * The renderer has no lighting, only a fixed brightness per direction — brighter
 * on top, plain at the front, darker at the sides and behind, which is what every
 * voxel renderer does. So a turned surface is lit by blending those by where its
 * normal now points, which comes out at exactly the old numbers for a face that
 * has not been turned at all.
 */
export function shadeTurned(normal: [number, number, number], angle: number): number {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = normal[0];
  // The same turn the points take: y against z, about the limb's own axis.
  const y = normal[1] * cos - normal[2] * sin;
  const z = normal[1] * sin + normal[2] * cos;

  const UP = 1;
  const DOWN = 0.62;
  const FRONT = 0.88;
  const BACK = 0.7;
  const SIDE = 0.75;

  /**
   * Weighted by the squares, which is the whole of what was wrong.
   *
   * A unit vector's components square to one; their absolute values sum to as
   * much as 1.73. Blended by those instead, a surface turned halfway between two
   * directions came out at 1.25 — and anything at or above one is "do not darken
   * this at all", so the swung half of every folded limb was drawn at full
   * brightness against a shoulder at 0.88. That is a hard bright step exactly
   * along the joint, which is the line that was there.
   *
   * Squared, this is a proper mixture: it sums to one, and for a face that has
   * not been turned it gives back its own number exactly.
   */
  return (
    x * x * SIDE + y * y * (y < 0 ? UP : DOWN) + z * z * (z > 0 ? FRONT : BACK)
  );
}

/**
 * How many bands a folded limb is drawn in.
 *
 * The mod's number, and its reason is worth keeping exactly: within either half of
 * a fold the map is near enough affine that a quad stays flat and one band would
 * do. What actually needs the cutting is **the joint** — no single quad may have
 * corners on both halves, or it is stretched across the crease. This is even, so
 * the middle of a part is always a boundary.
 *
 * The rest of the bands pay for the stretch where the lean ramps up, which does
 * bend in two directions at once and cannot be drawn by one affine transform.
 */
export const BANDS = 16;
