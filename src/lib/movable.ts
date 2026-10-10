import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * A window that stands where it is put: dragged by its top bar, sized by its corner.
 *
 * <h2>Where it first stands</h2>
 *
 * In the middle, moved down and right by its slot — how many were open when it
 * opened — so a second window does not land exactly on the first and hide it. Measured
 * after it is drawn, because its size is the stylesheet's to decide, and until then it
 * is kept invisible rather than shown in the corner for a frame.
 *
 * <h2>Where it may go</h2>
 *
 * Anywhere, as long as a hand's width of its top bar stays on the screen: a window
 * dragged off by its bar entirely could never be dragged back.
 *
 * The size is left to the browser's own resize corner (`resize: both` in the
 * stylesheet). It does the job, it is the one people already know from text fields,
 * and a hand-made one would be a second thing to learn.
 *
 * On a narrow screen there is no room to move anything into, so the stylesheet lays
 * the window over the whole screen and the dragging does nothing.
 */

/** How far each next window is moved from the one before, down and right. */
const STEP = 28;

/** How much of the top bar has to stay on screen, in pixels. */
const KEEP = 120;

export function useMovable(slot: number) {
  const box = useRef<HTMLElement | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || at) return;
    const { width, height } = element.getBoundingClientRect();
    const step = (slot % 6) * STEP;
    setAt({
      x: Math.max(8, Math.round((innerWidth - width) / 2) + step),
      y: Math.max(8, Math.round((innerHeight - height) / 2) + step),
    });
  }, [at, slot]);

  /** For the top bar's pointer-down: starts a drag, unless the press is on a control. */
  const grab = (event: ReactPointerEvent<HTMLElement>) => {
    const element = box.current;
    if (!element || !at || event.button !== 0) return;
    if ((event.target as Element).closest('button, a, input, textarea, select, [role="button"]')) return;
    if (matchMedia('(max-width: 46rem)').matches) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, from: at };
    const width = element.offsetWidth;
    const move = (moved: PointerEvent) => {
      setAt({
        x: Math.min(Math.max(start.from.x + moved.clientX - start.x, KEEP - width), innerWidth - KEEP),
        y: Math.min(Math.max(start.from.y + moved.clientY - start.y, 0), innerHeight - 48),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('dragging');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // So a drag across the page does not select every word it passes over.
    document.body.classList.add('dragging');
  };

  const style: CSSProperties = at ? { left: at.x, top: at.y } : { left: 0, top: 0, visibility: 'hidden' };
  return { box, style, grab };
}
