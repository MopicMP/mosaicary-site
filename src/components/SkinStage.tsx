import { useEffect, useRef, useState } from 'react';

import { useArms } from '../lib/arms.js';
import type { Layout } from '../lib/catalogue.js';
import { ANGLED, POSE, bodyOf, extent, overOf, place, type Look } from '../lib/figure.js';
import { paintFaces } from '../lib/paint.js';

/**
 * The figure at its full size, turned by dragging it.
 *
 * <h2>Filling what it is given</h2>
 *
 * It measures the room it has and takes all of it, rather than being drawn at some
 * height decided here. A picture that is the point of the window and sits in the
 * middle of it at a third of the size is the commonest way one of these looks
 * unfinished, and the fix is never a bigger number — it is asking the box.
 *
 * <h2>Turning it both ways</h2>
 *
 * Sideways all the way round, and up and down to about seventy degrees either way.
 * Not further: past that the figure is seen from directly overhead, which is a view
 * of the top of a head and nothing else. There is no perspective here, so a turn is
 * exact at every angle — the boxes stay boxes.
 *
 * <h2>Why the box is measured over every angle at once</h2>
 *
 * Because a canvas sized against the angle it is currently at changes size as the
 * shoulders come round, and at this size that is not a hairline of jitter but the
 * whole picture sliding under the hand that is turning it. Measured over the whole
 * sphere it comes out barely larger than the default view — the width is decided by
 * the arms and the height by the figure standing up — so nothing is given away for
 * it.
 */
export function SkinStage({
  url,
  layout,
  moving,
  look,
  onLook,
  closer,
  onCloser,
}: {
  url: string;
  layout: Layout;
  moving: boolean;
  look: Look;
  onLook: (look: Look) => void;
  /**
   * How much closer than "fills the box" the figure is drawn.
   *
   * Held by the window rather than here, along with the angle, so that the one
   * button putting things straight can put both straight.
   */
  closer: number;
  onCloser: (closer: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState({ wide: 0, tall: 0 });
  const started = useRef(performance.now());
  const slim = useArms(url) === 'slim';

  // Read inside the animation loop, which is set up once and must not be torn
  // down and rebuilt on every frame of a drag.
  const now = useRef({ look, moving, closer });
  now.current = { look, moving, closer };

  useEffect(() => {
    setReady(false);
    const picture = new Image();
    picture.crossOrigin = 'anonymous';
    picture.onload = () => {
      image.current = picture;
      setReady(true);
    };
    picture.src = url;
    return () => {
      picture.onload = null;
    };
  }, [url]);

  // The room it has, and again whenever the window changes it.
  useEffect(() => {
    const target = box.current;
    if (!target) return;
    const watch = new ResizeObserver(([seen]) => {
      const rect = seen!.contentRect;
      setRoom({ wide: Math.floor(rect.width), tall: Math.floor(rect.height) });
    });
    watch.observe(target);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const target = canvas.current;
    const picture = image.current;
    if (!ready || !target || !picture || room.wide < 8 || room.tall < 8) return;

    const paint = target.getContext('2d');
    if (!paint) return;

    const old = layout === 32;
    const scale = Math.max(1, Math.round(picture.width / 64));
    const dots = Math.min(2, window.devicePixelRatio || 1);
    const parts = [...bodyOf(slim), ...overOf(slim)];

    const around = extent(
      SPINS.flatMap((spin) =>
        TILTS.flatMap((tilt) =>
          [POSE, Math.PI / 2].flatMap((phase) => place(parts, { spin, tilt }, old, phase)),
        ),
      ),
    );
    // Whichever runs out first. Fitting only the height is what leaves a figure
    // spilling off the sides of a short wide window.
    const zoom = Math.min(room.tall / around.tall, room.wide / around.wide);

    target.width = room.wide * dots;
    target.height = room.tall * dots;
    target.style.width = `${room.wide}px`;
    target.style.height = `${room.tall}px`;

    // Placed about the model's own upright axis rather than about the edge of
    // whatever it happens to occupy: the figure is near enough symmetric about it,
    // so it stays put through a whole turn instead of swaying side to side.
    const originX = room.wide / 2;
    const originY = (room.tall - around.tall * zoom) / 2 - around.top * zoom;

    let alive = true;
    let frame = 0;

    const draw = (at: number) => {
      const state = now.current;
      const phase = state.moving ? ((at - started.current) / STRIDE) * Math.PI * 2 : POSE;
      const faces = place(parts, state.look, old, phase);

      // Closing in about the middle of the box, so what was in the centre stays
      // in the centre. Zooming about a corner is what makes one of these feel
      // like it is fighting the hand.
      const near = zoom * state.closer;
      const shiftX = room.wide / 2 - (room.wide / 2 - originX) * state.closer;
      const shiftY = room.tall / 2 - (room.tall / 2 - originY) * state.closer;

      paint.setTransform(dots, 0, 0, dots, 0, 0);
      paint.imageSmoothingEnabled = false;
      paint.clearRect(0, 0, room.wide, room.tall);
      paintFaces(paint, picture, faces, near, dots, shiftX, shiftY, scale);
      paint.setTransform(1, 0, 0, 1, 0, 0);
      if (alive) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [ready, layout, slim, room.wide, room.tall]);

  /**
   * The wheel brings it closer, and it has to be claimed to do that.
   *
   * React puts wheel handlers on the document as passive listeners, and a passive
   * listener may not stop the page scrolling underneath. So this one is attached
   * by hand: without it, closing in on a figure also scrolls whatever is behind
   * the window, which is the page you were looking at.
   */
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const rolled = (event: WheelEvent) => {
      event.preventDefault();
      // One is the whole figure in view. Nearer than four is a single pixel
      // filling the window, further than a third is too small to be looking at.
      const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      onCloser(Math.min(4, Math.max(0.35, now.current.closer * step)));
    };
    target.addEventListener('wheel', rolled, { passive: false });
    return () => target.removeEventListener('wheel', rolled);
  }, [ready, onCloser]);

  const dragging = useRef<{ x: number; y: number; from: Look } | null>(null);

  return (
    <div className="stage-box" ref={box}>
      <canvas
        ref={canvas}
        className="stage"
        aria-hidden
        onPointerDown={(event) => {
          dragging.current = { x: event.clientX, y: event.clientY, from: look };
          // Kept even when the pointer leaves the canvas, which is where a spin
          // right round takes it.
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const held = dragging.current;
          if (!held) return;
          onLook({
            // Two thirds of a degree per pixel: a comfortable drag across the
            // picture is most of a turn, and a twitch is not half of one.
            spin: held.from.spin + (event.clientX - held.x) * 0.012,
            // Held short of straight down. Overhead is a view of the top of a
            // head, and the way back from it is not obvious to anybody.
            tilt: Math.max(-MOST_TILT, Math.min(MOST_TILT, held.from.tilt + (event.clientY - held.y) * 0.009)),
          });
        }}
        onPointerUp={(event) => {
          dragging.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onDoubleClick={() => {
          onLook(ANGLED);
          onCloser(1);
        }}
      />
    </div>
  );
}

/** How long one stride takes, in milliseconds. Slow, so it does not demand looking at. */
const STRIDE = 1700;

/** As far up and down as it goes: about seventy degrees. */
export const MOST_TILT = 1.22;

const SPINS = Array.from({ length: 8 }, (_, at) => (at * Math.PI) / 4);
const TILTS = [-MOST_TILT, -0.6, 0, ANGLED.tilt, 0.6, MOST_TILT];
