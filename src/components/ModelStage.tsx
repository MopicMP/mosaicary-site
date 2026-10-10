import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { backed } from '../lib/backdrop.js';
import { timeIn, type Clip, type Motion } from '../lib/bbanim.js';
import type { Figure } from '../lib/bbmodel3d.js';
import { ANGLED, FOV, MOST_TILT, fitAround, type Look } from '../lib/view3d.js';

/**
 * A model at the full size of its window, turned by dragging it.
 *
 * The skin stage's hand, on a real 3D scene: the same drag, the same wheel, the same
 * double click back to where it started, so the two windows feel like one tool.
 *
 * <h2>Drawn when something changes, not every frame</h2>
 *
 * A model standing still is the same picture until somebody turns it, and a page that
 * redraws an unchanged picture sixty times a second is a laptop fan for nothing. So
 * the loop runs only while a clip plays, and otherwise one frame is drawn for each
 * turn, zoom or resize.
 *
 * <h2>Fitted to the ball around the model</h2>
 *
 * The camera stands as far back as the sphere around the model needs, not the box
 * seen from this angle, so turning it does not slide the camera in and out under the
 * hand doing the turning.
 */
export function ModelStage({
  figure,
  motion,
  clip,
  playing,
  look,
  onLook,
  closer,
  onCloser,
  home = ANGLED,
  backdrop = null,
}: {
  figure: Figure;
  motion: Motion | null;
  /** The clip shown, at rest when there is none. */
  clip: Clip | null;
  playing: boolean;
  look: Look;
  onLook: (look: Look) => void;
  closer: number;
  onCloser: (closer: number) => void;
  /** Where a double click goes back to: the author's angle, when the model has one. */
  home?: Look;
  /** The colour behind the figure, or null for the chequer. */
  backdrop?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const behind = backed(backdrop);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [room, setRoom] = useState({ wide: 0, tall: 0 });
  const [broken, setBroken] = useState(false);

  // Read inside the loop, which is built once per figure and must not be torn down
  // on every frame of a drag.
  const now = useRef({ look, closer, clip, playing });
  now.current = { look, closer, clip, playing };
  const redraw = useRef<() => void>(() => undefined);

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
    if (!target) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
    } catch {
      setBroken(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();
    scene.add(figure.root);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);

    let alive = true;
    let frame = 0;
    let wanted = true;
    // Seconds into the clip, counted only while it plays, so a pause holds the pose.
    let seconds = 0;
    let shownClip: Clip | null = null;
    let last = performance.now();

    const draw = () => {
      const state = now.current;
      const wide = target.clientWidth;
      const tall = target.clientHeight;
      if (wide < 8 || tall < 8) return;
      if (renderer.domElement.width !== Math.floor(wide * renderer.getPixelRatio())) {
        renderer.setSize(wide, tall, false);
      }
      camera.aspect = wide / tall;
      if (state.clip !== shownClip) {
        shownClip = state.clip;
        seconds = 0;
      }
      if (motion && state.clip) motion.pose(state.clip, timeIn(state.clip, seconds));
      else figure.rest();
      fitAround(camera, figure.box, state.look, state.closer);
      renderer.render(scene, camera);
    };

    const tick = (at: number) => {
      if (!alive) return;
      const state = now.current;
      const step = Math.min(0.1, (at - last) / 1000);
      last = at;
      if (state.playing && state.clip) {
        seconds += step;
        wanted = true;
      }
      if (wanted) {
        wanted = false;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    redraw.current = () => {
      wanted = true;
    };
    frame = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      redraw.current = () => undefined;
      scene.remove(figure.root);
      figure.rest();
      renderer.dispose();
    };
  }, [figure, motion]);

  // Anything that changes the picture without playing asks for one more frame.
  useEffect(() => {
    redraw.current();
  }, [look, closer, clip, playing, room.wide, room.tall]);

  // The wheel has to be claimed by hand: React's own wheel listener is passive and
  // cannot stop the page behind the window scrolling too.
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const rolled = (event: WheelEvent) => {
      event.preventDefault();
      const step = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      onCloser(Math.min(6, Math.max(0.35, now.current.closer * step)));
    };
    target.addEventListener('wheel', rolled, { passive: false });
    return () => target.removeEventListener('wheel', rolled);
  }, [onCloser]);

  const dragging = useRef<{ x: number; y: number; from: Look } | null>(null);

  return (
    <div className={`stage-box model-box${behind.className}`} style={behind.style} ref={box}>
      {broken ? (
        <p className="stage-wait">Браузер не дал нарисовать модель: WebGL выключен или недоступен.</p>
      ) : (
        <canvas
          ref={canvas}
          className="stage model-stage"
          aria-hidden
          onPointerDown={(event) => {
            dragging.current = { x: event.clientX, y: event.clientY, from: look };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const held = dragging.current;
            if (!held) return;
            onLook({
              // Dragging right brings the model's right side round to the front,
              // the way Blockbench's own view turns.
              spin: held.from.spin - (event.clientX - held.x) * 0.012,
              tilt: Math.max(-MOST_TILT, Math.min(MOST_TILT, held.from.tilt + (event.clientY - held.y) * 0.009)),
            });
          }}
          onPointerUp={(event) => {
            dragging.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onDoubleClick={() => {
            onLook(home);
            onCloser(1);
          }}
        />
      )}
    </div>
  );
}
