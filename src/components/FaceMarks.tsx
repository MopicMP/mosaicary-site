import { ChevronUp, CircleDot, Eye, Feather, Layers } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { FaceMask, type Kind } from '../../shared/faceMask.js';
import type { Layout } from '../lib/catalogue.js';
import { Hint } from './Hint.js';

/**
 * The face, close up, with what somebody marked on it.
 *
 * <h2>Why this is the panel that matters</h2>
 *
 * Every skin site shows a figure. None of them can tell you which pixels of a face
 * are pupil and which are white, because nothing they do needs to know — and that
 * is the one thing this catalogue holds that theirs do not. A marked face is a
 * character who blinks and looks at you; an unmarked one stares. Saying so in words
 * under the card would be a claim; showing the marking is the thing itself.
 *
 * <h2>The colours are the editor's colours</h2>
 *
 * The same four the mod's own eye editor uses, and deliberately not new ones.
 * Somebody who marks a face here and then opens one in game should not have to
 * learn a second key for the same four things.
 *
 * <h2>Both layers at once</h2>
 *
 * A mark can sit on the face or on the layer drawn over it, and HD skins use both
 * — the white below and a more detailed pupil above is a common way to draw one.
 * They are drawn together here because together is what a player sees; which layer
 * a mark is on belongs in the editor, where it changes what a stroke does.
 */

/** Where the face and the layer over it sit on a skin, in sixty-fourths. */
interface Patch {
  u: number;
  v: number;
  span: number;
}

const FACE_AT: Patch = { u: 8, v: 8, span: 8 };
const OVER_AT: Patch = { u: 40, v: 8, span: 8 };

interface Legend {
  kind: Kind;
  label: string;
  colour: string;
  icon: ReactNode;
}

const LEGEND: Legend[] = [
  { kind: 'EYE', label: 'зрачок', colour: '#4fc3f7', icon: <CircleDot size={14} /> },
  { kind: 'WHITE', label: 'белок', colour: '#81c784', icon: <Eye size={14} /> },
  { kind: 'BROW', label: 'бровь', colour: '#ffb74d', icon: <ChevronUp size={14} /> },
  { kind: 'LASH', label: 'ресница', colour: '#ba8cff', icon: <Feather size={14} /> },
];

export function FaceMarks({
  url,
  layout,
  mask: encoded,
  hasOverlay,
  span = 184,
}: {
  url: string;
  layout: Layout;
  mask: string | null;
  hasOverlay: boolean;
  span?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [overlay, setOverlay] = useState(true);
  /**
   * Nothing coloured in until it is asked for.
   *
   * The face itself is what somebody came to look at; four colours laid over it
   * the moment it opens answer a question that has not been asked yet, and hide
   * the pixels they are describing while doing it. The keys are right there and
   * they light up one at a time, which is also how they are read.
   */
  const [hidden, setHidden] = useState<Kind[]>(() => LEGEND.map((one) => one.kind));

  const mask = useMemo(() => FaceMask.decode(encoded), [encoded]);
  const marked = !mask.isNone;

  // How many cells of each kind there are, which is also what says whether a kind
  // is there at all — a legend offering to hide something that was never drawn is
  // a control that does nothing, and one of those makes people distrust the rest.
  const counts = useMemo(() => {
    const out = new Map<Kind, number>();
    for (const { kind } of LEGEND) {
      let n = 0;
      for (let y = 0; y < mask.size; y++) {
        for (let x = 0; x < mask.size; x++) if (mask.isEither(kind, x, y)) n++;
      }
      out.set(kind, n);
    }
    return out;
  }, [mask]);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const paint = target.getContext('2d');
    if (!paint) return;

    let alive = true;
    const picture = new Image();
    picture.crossOrigin = 'anonymous';
    picture.onload = () => {
      if (!alive) return;
      const scale = Math.max(1, Math.round(picture.width / 64));
      const dots = Math.min(2, window.devicePixelRatio || 1);
      target.width = span * dots;
      target.height = span * dots;
      paint.setTransform(dots, 0, 0, dots, 0, 0);
      paint.imageSmoothingEnabled = false;
      paint.clearRect(0, 0, span, span);

      const take = (at: Patch) =>
        paint.drawImage(
          picture,
          at.u * scale,
          at.v * scale,
          at.span * scale,
          at.span * scale,
          0,
          0,
          span,
          span,
        );

      take(FACE_AT);
      if (hasOverlay && overlay) take(OVER_AT);

      if (!marked) return;
      const cell = span / mask.size;
      for (const { kind, colour } of LEGEND) {
        if (hidden.includes(kind)) continue;
        // Translucent rather than solid: what is underneath is the point, and a
        // mark that hides the pixel it describes cannot be checked against it.
        paint.fillStyle = `${colour}b0`;
        // Whole runs at a time rather than a rectangle per cell. A face at 256
        // across is sixty-five thousand cells four times over, and what people
        // mark is a handful of solid blobs — which is a few dozen runs.
        for (let y = 0; y < mask.size; y++) {
          let from = -1;
          for (let x = 0; x <= mask.size; x++) {
            const on = x < mask.size && mask.isEither(kind, x, y);
            if (on && from < 0) from = x;
            if (!on && from >= 0) {
              paint.fillRect(from * cell, y * cell, (x - from) * cell, cell);
              from = -1;
            }
          }
        }
      }
    };
    picture.src = url;
    return () => {
      alive = false;
    };
  }, [url, layout, span, mask, marked, hasOverlay, overlay, hidden]);

  return (
    <div className="face">
      <canvas ref={canvas} className="face-canvas" style={{ width: span, height: span }} aria-hidden />

      <div className="face-keys">
        {LEGEND.map((one) => {
          const has = (counts.get(one.kind) ?? 0) > 0;
          const off = hidden.includes(one.kind);
          return (
            <Hint
              key={one.kind}
              says={
                has
                  ? `${off ? 'показать' : 'убрать'}: ${one.label}, ${counts.get(one.kind)} точек`
                  : `${one.label} не отмечена`
              }
            >
              <button
                type="button"
                className={!has ? 'key off' : off ? 'key' : 'key on'}
                disabled={!has}
                aria-label={one.label}
                onClick={() =>
                  setHidden((was) =>
                    was.includes(one.kind)
                      ? was.filter((each) => each !== one.kind)
                      : [...was, one.kind],
                  )
                }
              >
                <span className="key-dot" style={{ background: one.colour }} />
                {one.icon}
              </button>
            </Hint>
          );
        })}

        {hasOverlay && (
          <Hint says={overlay ? 'убрать верхний слой' : 'вернуть верхний слой'}>
            <button
              type="button"
              className={overlay ? 'key wide on' : 'key wide'}
              aria-label="верхний слой"
              onClick={() => setOverlay(!overlay)}
            >
              <Layers size={14} />
            </button>
          </Hint>
        )}
      </div>

      {!marked && <p className="face-none">глаза ещё никто не разметил</p>}
      {marked && (
        <p className="face-note">
          сетка {mask.size}×{mask.size}
        </p>
      )}
    </div>
  );
}
