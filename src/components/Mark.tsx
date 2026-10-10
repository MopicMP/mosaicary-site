import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { parseProject } from '../../shared/bbmodel.js';
import FILE from '../brand/icon.bbmodel?url';
import { motionOf, timeIn, type Clip, type Motion } from '../lib/bbanim.js';
import { buildFigure, type Figure } from '../lib/bbmodel3d.js';
import { FOV, fitTight, type Look } from '../lib/view3d.js';

/**
 * The site's mark in the header: a model, drawn by the code that draws the catalogue.
 *
 * A site about models had a mark made of CSS rectangles, which is a drawing of a model
 * rather than one. This is the file itself — read, built and posed the same way every
 * card picture and every model window is, so the mark is a standing proof that the
 * viewer works, and breaks when the viewer breaks.
 *
 * <h2>What is left when it cannot be drawn</h2>
 *
 * The three rectangles. Without WebGL, with the file missing, or before it has arrived,
 * the header keeps a mark of the right size in the right place; nothing moves and
 * nothing jumps but those pixels.
 *
 * <h2>Why it is this cheap</h2>
 *
 * Twenty-six pixels square at half of sixty frames, and only while the header is on
 * screen — a mark in the corner of the eye does not pay for a core of somebody's
 * laptop. For a person who asked their system for less movement it is one frame, drawn
 * once, of the figure standing still.
 */

/**
 * The file is part of the page, not something in `public/`: in this mode Vite takes no
 * public folder at all, because the one there holds sample skins the models site may
 * not put on the internet. Imported, it is emitted beside the scripts, fetched once and
 * cached under a name that changes when the model does.
 */

/** The quiet cycle: the head turns and breathes, the hat follows it late. */
const CLIP = 'idle';

/**
 * Three-quarters from the left: the face, with enough of the side that the hat still
 * reads as a hat. Measured against the alternatives at the size the header draws —
 * straight on, the figure is flat; from the right, the face turns away.
 */
export const MARK: Look = { spin: -Math.PI / 9, tilt: 0.175 };

/** Frames a second. At this size the half of sixty nobody can see is a core saved. */
const FPS = 30;

/** How many poses of the clip the frame is measured over. */
const SAMPLES = 16;

/** What the stylesheet gives the mark, for the moment before the layout has said. */
const SIDE = 26;

let asked: Promise<string> | null = null;

/** The file, fetched once however many marks ask for it. */
function fileText(): Promise<string> {
  asked ??= fetch(FILE)
    .then((answer) => {
      if (!answer.ok) throw new Error(`mark model: ${answer.status}`);
      return answer.text();
    })
    .catch((why) => {
      // Not kept: a mark that failed once on a dropped connection can try again.
      asked = null;
      throw why;
    });
  return asked;
}

export function Mark() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<{ figure: Figure; motion: Motion; clip: Clip | null } | null>(null);
  const [broken, setBroken] = useState(false);
  const [held, setHeld] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const seen = () => setHeld(media.matches);
    media.addEventListener('change', seen);
    return () => media.removeEventListener('change', seen);
  }, []);

  useEffect(() => {
    let alive = true;
    let made: Figure | null = null;
    (async () => {
      try {
        const project = parseProject(await fileText());
        const figure = await buildFigure(project);
        if (!alive) {
          figure.dispose();
          return;
        }
        made = figure;
        const motion = motionOf(project, figure);
        setLive({ figure, motion, clip: motion.clips.find((clip) => clip.name === CLIP) ?? null });
      } catch {
        // Nothing to say to anybody: the rectangles stay and the header is unharmed.
        if (alive) setBroken(true);
      }
    })();
    return () => {
      alive = false;
      made?.dispose();
    };
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!live || !target) return;
    const { figure, motion, clip } = live;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
    } catch {
      setBroken(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    scene.add(figure.root);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);

    // The camera is placed once, around everything the clip ever reaches rather than
    // around the figure standing still: the hat turns wider than its resting box, and
    // a frame fitted to the rest pose would shave its brim every second and a half.
    const room = new THREE.Box3();
    if (clip && clip.length > 0) {
      for (let i = 0; i < SAMPLES; i++) {
        motion.pose(clip, timeIn(clip, (clip.length * i) / SAMPLES));
        room.union(new THREE.Box3().setFromObject(figure.root));
      }
    } else {
      room.copy(figure.box);
    }
    figure.rest();
    fitTight(camera, room, MARK);

    // Sharp after a zoom as well: zooming the page changes how many screen pixels a
    // CSS pixel is worth without changing that there are twenty-six of them.
    const draw = () => {
      const dense = Math.min(2, window.devicePixelRatio || 1);
      const side = target.clientWidth || SIDE;
      if (renderer.getPixelRatio() !== dense || renderer.domElement.width !== Math.floor(side * dense)) {
        renderer.setPixelRatio(dense);
        renderer.setSize(side, target.clientHeight || SIDE, false);
      }
      renderer.render(scene, camera);
    };
    const down = () => {
      scene.remove(figure.root);
      figure.rest();
      renderer.dispose();
    };

    if (held || !clip) {
      draw();
      return down;
    }

    // Still while the header is scrolled away. In a tab nobody is looking at the
    // browser stops the frames itself; the step is capped in case it only slows them.
    let onScreen = true;
    const watch = new IntersectionObserver(([seen]) => (onScreen = seen!.isIntersecting), { threshold: 0 });
    watch.observe(target);

    let frame = 0;
    let seconds = 0;
    let last = performance.now();
    let drawnAt = -Infinity;
    const tick = (at: number) => {
      frame = requestAnimationFrame(tick);
      const step = Math.min(0.25, (at - last) / 1000);
      last = at;
      // Out of sight, the clock stops too, so the mark carries on from the pose it
      // was left in instead of having run on without anybody.
      if (!onScreen) return;
      seconds += step;
      if (at - drawnAt < 1000 / FPS - 1) return;
      drawnAt = at;
      motion.pose(clip, timeIn(clip, seconds));
      draw();
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      down();
    };
  }, [live, held]);

  if (broken || !live) {
    return (
      <span className="brand-mark" aria-hidden>
        <i />
        <i />
      </span>
    );
  }
  return (
    <span className="brand-mark live" aria-hidden>
      <canvas ref={canvas} />
    </span>
  );
}
