import { useEffect, useRef, useState } from 'react';

import { readEmote, tickAt, type Emote } from '../../shared/emote.js';
import { useArms } from '../lib/arms.js';
import type { Layout } from '../lib/catalogue.js';
import { ANGLED, bodyOf, extent, overOf, place, type Look } from '../lib/figure.js';
import { rigAt } from '../lib/rig.js';
import { paintFaces } from '../lib/paint.js';

/**
 * An animation, played on a skin.
 *
 * <h2>Why this is worth doing in the browser at all</h2>
 *
 * Because the alternative is a grid of icons, and an icon of an animation is a
 * photograph of a dance. Seven hundred of them cannot be chosen between by name —
 * "Beyond the way", "Стойка Альбедо" — and the only question anybody has is what
 * it looks like on a character.
 *
 * It costs almost nothing, which is the good part. The figure already turns limbs
 * about their joints, because a walk needs that; an emote is the same arithmetic
 * with the angles read from a file instead of from a sine.
 *
 * <h2>The box is measured over the whole animation</h2>
 *
 * Once, over the entire run, so a figure that throws its arms out on tick forty
 * does not resize the canvas when it gets there. Some of these reach a very long
 * way, so what that costs is a small figure in a large box — and the alternative
 * is a picture that jumps, which is worse and harder to explain.
 */
export function AnimationStage({
  url,
  skinUrl,
  layout,
  playing,
  onLoaded,
}: {
  /** Where the keyframes are, fetched only when something is going to play. */
  url: string;
  skinUrl: string;
  layout: Layout;
  playing: boolean;
  onLoaded?: (emote: Emote) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const picture = useRef<HTMLImageElement | null>(null);
  const [emote, setEmote] = useState<Emote | null>(null);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState({ wide: 0, tall: 0 });
  const [look] = useState<Look>(ANGLED);
  const slim = useArms(skinUrl) === 'slim';
  const started = useRef(performance.now());
  const running = useRef(playing);
  running.current = playing;

  useEffect(() => {
    let alive = true;
    setEmote(null);
    fetch(url)
      .then((answer) => answer.json())
      .then((json) => {
        if (!alive) return;
        const read = readEmote(json);
        setEmote(read);
        started.current = performance.now();
        onLoaded?.(read);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    setReady(false);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      picture.current = image;
      setReady(true);
    };
    image.src = skinUrl;
    return () => {
      image.onload = null;
    };
  }, [skinUrl]);

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
    const image = picture.current;
    if (!ready || !emote || !target || !image || room.wide < 8 || room.tall < 8) return;
    const paint = target.getContext('2d');
    if (!paint) return;

    const old = layout === 32;
    const scale = Math.max(1, Math.round(image.width / 64));
    const dots = Math.min(2, window.devicePixelRatio || 1);
    const parts = [...bodyOf(slim), ...overOf(slim)];

    // Sampled across the whole run rather than every frame: a canvas that grows
    // when the arms go out is a picture that jumps in the middle of a dance.
    const last = Math.max(emote.stopTick, emote.endTick, 1);
    const steps = Math.min(48, last + 1);
    const around = extent(
      Array.from({ length: steps }, (_, at) =>
        place(parts, look, old, null, 1, rigAt(emote, (at * last) / (steps - 1 || 1), slim)),
      ).flat(),
    );
    const zoom = Math.min(room.tall / around.tall, room.wide / around.wide) * 0.94;

    target.width = room.wide * dots;
    target.height = room.tall * dots;
    target.style.width = `${room.wide}px`;
    target.style.height = `${room.tall}px`;

    const originX = room.wide / 2;
    const originY = (room.tall - around.tall * zoom) / 2 - around.top * zoom;

    let alive = true;
    let frame = 0;
    let held = 0;

    const draw = (now: number) => {
      if (running.current) held = (now - started.current) / 1000;
      else started.current = now - held * 1000;
      const tick = tickAt(emote, held);
      const faces = place(parts, look, old, null, 1, rigAt(emote, tick, slim));

      paint.setTransform(dots, 0, 0, dots, 0, 0);
      paint.imageSmoothingEnabled = false;
      paint.clearRect(0, 0, room.wide, room.tall);
      paintFaces(paint, image, faces, zoom, dots, originX, originY, scale);
      paint.setTransform(1, 0, 0, 1, 0, 0);
      if (alive) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [ready, emote, layout, slim, look, room.wide, room.tall]);

  return (
    <div className="stage-box" ref={box}>
      <canvas ref={canvas} className="stage still" aria-hidden />
      {!emote && <span className="stage-wait">загружаю движение…</span>}
    </div>
  );
}
