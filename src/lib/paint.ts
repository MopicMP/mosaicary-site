import type { Placed } from './figure.js';

/**
 * Putting placed faces on a canvas.
 *
 * Apart from the components that use it because two of them do — the small figure
 * in a card and the large one in the window — and a second copy of this would be a
 * second place for the seam arithmetic to be subtly different. The arithmetic is
 * short and entirely unobvious, which is exactly the kind that gets copied and then
 * fixed in one of the copies.
 */

/**
 * The skin darkened by a fixed amount, kept so it is done once per shade.
 *
 * Drawn through `source-atop` so that only pixels that are actually there get
 * darker — filling a rectangle over a face would paint shadow into the holes of a
 * transparent outer layer, which is most of what an outer layer is.
 */
const shaded = new WeakMap<HTMLImageElement, Map<number, HTMLCanvasElement>>();

export function shade(image: HTMLImageElement, amount: number): CanvasImageSource {
  if (amount >= 0.999) return image;
  let byAmount = shaded.get(image);
  if (!byAmount) {
    byAmount = new Map();
    shaded.set(image, byAmount);
  }
  const already = byAmount.get(amount);
  if (already) return already;

  const sheet = document.createElement('canvas');
  sheet.width = image.width;
  sheet.height = image.height;
  const paint = sheet.getContext('2d');
  if (!paint) return image;
  paint.imageSmoothingEnabled = false;
  paint.drawImage(image, 0, 0);
  paint.globalCompositeOperation = 'source-atop';
  paint.fillStyle = `rgba(0, 0, 0, ${1 - amount})`;
  paint.fillRect(0, 0, sheet.width, sheet.height);

  byAmount.set(amount, sheet);
  return sheet;
}

/**
 * How far every quad is drawn past its own edge, in screen pixels.
 *
 * Two quads that share an edge do not meet cleanly on a canvas: each is drawn
 * with a soft edge, the two partial coverages add up to less than one, and what
 * shows through the difference is whatever is behind — which on this page is the
 * dark of the background. Half a pixel of overlap covers it.
 */
export const SEAM = 0.5;

/**
 * A quad grown by a fixed amount on every side, in the space it will be drawn in.
 *
 * <h2>Why a fixed amount and not a fraction</h2>
 *
 * It was a fraction — six thousandths, about its own middle — and that is a
 * hairline on a whole face and nothing at all on a sixteenth of one. The moment a
 * folded limb started arriving as sixteen bands, every band was compensated by a
 * sixteenth of what it needed, and the figure came out ruled with dozens of thin
 * dark lines: one at every seam of every band of every folded part.
 *
 * A seam is a property of the screen, not of the shape. Two quads meeting leave
 * the same soft edge whether they are a whole arm or a slice of one, so what
 * covers it is the same half pixel either way.
 *
 * Grown along its own two edges rather than away from its middle, which is the
 * other half of the same point: a long thin band pushed out from its centre grows
 * mostly along its length, where it has no seam, and barely across it, where all
 * of them are.
 */
export function spread(
  a: [number, number],
  b: [number, number],
  d: [number, number],
  pad: number,
  /**
   * Which of the two ends may be grown past.
   *
   * Both, everywhere a surface is continuous. Neither, at a crease — see
   * {@link paintFaces}.
   */
  ends: { up: boolean; down: boolean } = { up: true, down: true },
): [[number, number], [number, number], [number, number]] {
  const unit = (from: [number, number], to: [number, number], by: number): [number, number] => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    // A quad with no width has no edge to grow along, and no seam either.
    return length < 1e-9 ? [0, 0] : [(dx / length) * by, (dy / length) * by];
  };
  const across = unit(a, b, pad);
  const up = unit(a, d, ends.up ? pad : 0);
  const down = unit(a, d, ends.down ? pad : 0);
  return [
    [a[0] - across[0] - up[0], a[1] - across[1] - up[1]],
    [b[0] + across[0] - up[0], b[1] + across[1] - up[1]],
    [d[0] - across[0] + down[0], d[1] - across[1] + down[1]],
  ];
}

/**
 * Every visible face, far ones first, each as a parallelogram of the skin.
 *
 * The transform is set from three corners of the face rather than from an angle:
 * an affine transform *is* three corners, and reading them off is exact where
 * working back to a rotation and a scale is a place to lose a half pixel.
 */
export function paintFaces(
  paint: CanvasRenderingContext2D,
  image: HTMLImageElement,
  faces: Placed[],
  zoom: number,
  dots: number,
  originX: number,
  originY: number,
  scale: number,
): void {
  for (const face of faces) {
    const [p0, p1, , p3] = face.screen;
    /**
     * Grown past its own edges, except where the edge is a crease.
     *
     * A surface may be drawn a little past itself wherever it carries on: the
     * neighbour has the same skin at that point and the same brightness, so the
     * overlap cannot be seen and it covers the soft edge between them.
     *
     * At a fold neither is true. The two halves of the joint meet at an angle,
     * with different skin arriving from different directions and a different
     * brightness because one of them has been turned — so growing across it
     * paints half a pixel of one half over the other, and that is a line drawn
     * exactly along every elbow and knee.
     *
     * A crease is meant to show. What it must not do is bleed.
     */
    const [a, b, d] = spread(p0, p1, p3, SEAM / zoom, face.ends ?? { up: true, down: true });
    const [su, sv, sw, sh] = face.patch;
    const across: [number, number] = [(b[0] - a[0]) / sw, (b[1] - a[1]) / sw];
    const down: [number, number] = [(d[0] - a[0]) / sh, (d[1] - a[1]) / sh];

    paint.setTransform(
      across[0] * zoom * dots,
      across[1] * zoom * dots,
      down[0] * zoom * dots,
      down[1] * zoom * dots,
      (a[0] * zoom + originX) * dots,
      (a[1] * zoom + originY) * dots,
    );
    paint.drawImage(shade(image, face.shade), su * scale, sv * scale, sw * scale, sh * scale, 0, 0, sw, sh);
  }
}
