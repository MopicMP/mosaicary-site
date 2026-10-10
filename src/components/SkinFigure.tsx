import { useEffect, useRef } from 'react';

import type { Layout } from '../lib/catalogue.js';
import { useArms } from '../lib/arms.js';
import { ANGLED, POSE, bodyOf, extent, overOf, place } from '../lib/figure.js';
import { paintFaces } from '../lib/paint.js';

/**
 * A costume, either flat from the front or turned at the corner.
 *
 * <h2>Flat</h2>
 *
 * The same nine rectangles the mod's own paper doll uses, and deliberately so: a
 * skin should look the same in the browser as it does in the wardrobe, and the
 * surest way to guarantee that is to lay it out from the same table rather than to
 * write down that it ought to match.
 *
 * <h2>Turned</h2>
 *
 * What a skin site shows, and the default here for the reason it is theirs: a
 * character seen from a corner reads as a character, and one seen flat reads as a
 * texture. See {@code lib/figure.ts} — it is boxes drawn as parallelograms with
 * affine transforms, so there is no WebGL to fail on somebody's laptop.
 *
 * <h2>Standing, not walking</h2>
 *
 * A figure stands in a stopped step, which is what the reference shows and what
 * this defaults to. The walk is the same arithmetic run over time, kept because it
 * was asked for and put behind a switch in the header — a page of thirty figures
 * all striding is a page nobody reads.
 *
 * <h2>The old half-height layout</h2>
 *
 * A skin from before 1.8 has no left arm, no left leg and no jacket — the right
 * limbs were mirrored for both sides. Drawn from the full table it samples rows
 * the picture does not have, which is what made seven of fifty real skins look
 * like broken textures.
 */

export type View = 'angled' | 'flat';

interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
  u: number;
  v: number;
}

/**
 * Seen from the front, with the arms as wide as the skin was drawn for.
 *
 * The front of a narrow arm is three columns rather than four, and it hangs from
 * the same shoulder — so it starts one pixel further in on the right and stays put
 * on the left. Its texture starts in the same place either way; only the width of
 * the strip taken changes.
 */
function flatBody(slim: boolean): Piece[] {
  const w = slim ? 3 : 4;
  return [
    { x: 4, y: 0, w: 8, h: 8, u: 8, v: 8 },
    { x: 4, y: 8, w: 8, h: 12, u: 20, v: 20 },
    { x: 4 - w, y: 8, w, h: 12, u: 44, v: 20 },
    { x: 12, y: 8, w, h: 12, u: 36, v: 52 },
    { x: 4, y: 20, w: 4, h: 12, u: 4, v: 20 },
    { x: 8, y: 20, w: 4, h: 12, u: 20, v: 52 },
  ];
}

function flatOver(slim: boolean): Piece[] {
  const w = slim ? 3 : 4;
  return [
    { x: 4, y: 0, w: 8, h: 8, u: 40, v: 8 },
    { x: 4, y: 8, w: 8, h: 12, u: 20, v: 36 },
    { x: 4 - w, y: 8, w, h: 12, u: 44, v: 36 },
    { x: 12, y: 8, w, h: 12, u: 52, v: 52 },
    { x: 4, y: 20, w: 4, h: 12, u: 4, v: 36 },
    { x: 8, y: 20, w: 4, h: 12, u: 4, v: 52 },
  ];
}

const FLAT_BODY_OLD: Piece[] = [
  { x: 4, y: 0, w: 8, h: 8, u: 8, v: 8 },
  { x: 4, y: 8, w: 8, h: 12, u: 20, v: 20 },
  { x: 0, y: 8, w: 4, h: 12, u: 44, v: 20 },
  { x: 12, y: 8, w: 4, h: 12, u: 44, v: 20 },
  { x: 4, y: 20, w: 4, h: 12, u: 4, v: 20 },
  { x: 8, y: 20, w: 4, h: 12, u: 4, v: 20 },
];

const FLAT_OVER_OLD: Piece[] = [{ x: 4, y: 0, w: 8, h: 8, u: 40, v: 8 }];

export const WIDE = 16;
export const TALL = 32;

/**
 * How long one stride takes, in milliseconds.
 *
 * Slow. A grid of thirty figures all marching at a brisk pace is a page nobody can
 * read — the movement is meant to say "this is a character" and then get out of
 * the way, not to be the thing you look at.
 */
const STRIDE = 1700;

export function SkinFigure({
  url,
  layout,
  view = 'angled',
  moving = true,
  height = 168,
  className,
}: {
  url: string;
  layout: Layout;
  view?: View;
  moving?: boolean;
  height?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useRef(Math.random() * STRIDE);
  // Which model this skin was drawn for. Wide until the picture has been read,
  // which is also what it stays if it cannot be.
  const slim = useArms(url) === 'slim';

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;

    let alive = true;
    let frame = 0;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!alive) return;
      const paint = target.getContext('2d');
      if (!paint) return;
      const old = layout === 32;
      const scale = Math.max(1, Math.round(image.width / 64));
      const dots = Math.min(2, window.devicePixelRatio || 1);
      const parts = [...bodyOf(slim), ...overOf(slim)];
      paint.imageSmoothingEnabled = false;

      if (view === 'flat') {
        const zoom = Math.max(1, Math.floor(height / TALL));
        target.width = WIDE * zoom * dots;
        target.height = TALL * zoom * dots;
        target.style.width = `${WIDE * zoom}px`;
        target.style.height = `${TALL * zoom}px`;
        paint.setTransform(dots, 0, 0, dots, 0, 0);
        paint.imageSmoothingEnabled = false;
        paint.clearRect(0, 0, target.width, target.height);

        const pieces = old
          ? [...FLAT_BODY_OLD, ...FLAT_OVER_OLD]
          : [...flatBody(slim), ...flatOver(slim)];
        for (const piece of pieces) {
          paint.drawImage(
            image,
            piece.u * scale,
            piece.v * scale,
            piece.w * scale,
            piece.h * scale,
            piece.x * zoom,
            piece.y * zoom,
            piece.w * zoom,
            piece.h * zoom,
          );
        }
        return;
      }

      // The canvas is sized once, to the widest the figure ever gets. While it is
      // moving that means over the whole stride: sizing it per frame would make
      // every figure on the page jitter by a pixel as its legs open and shut,
      // which on a grid reads as a fault. Standing still it is sized to the one
      // pose, so a still figure is not padded out by room it never uses.
      const phases = moving ? [0, 0.5, 1, 1.5].map((quarter) => quarter * Math.PI) : [POSE];
      const widest = extent(
        phases.flatMap((phase) => place(parts, ANGLED, old, phase)),
      );
      const zoom = height / widest.tall;
      const wide = Math.ceil(widest.wide * zoom) + 2;
      const tall = Math.ceil(widest.tall * zoom) + 2;

      target.width = wide * dots;
      target.height = tall * dots;
      target.style.width = `${wide}px`;
      target.style.height = `${tall}px`;

      const originX = 1 - widest.left * zoom;
      const originY = 1 - widest.top * zoom;

      const draw = (now: number) => {
        const phase = moving ? ((now - started.current) / STRIDE) * Math.PI * 2 : POSE;
        const faces = place(parts, ANGLED, old, phase);


        paint.setTransform(dots, 0, 0, dots, 0, 0);
        paint.imageSmoothingEnabled = false;
        paint.clearRect(0, 0, wide, tall);
        paintFaces(paint, image, faces, zoom, dots, originX, originY, scale);
        paint.setTransform(1, 0, 0, 1, 0, 0);
        if (moving && alive) frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    };
    image.src = url;

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [url, layout, view, moving, height, slim]);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
