import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Something that has to appear over everything, wherever it was opened from.
 *
 * <h2>Why it cannot simply be positioned next to the thing</h2>
 *
 * Because the panel it lives in has rounded corners, so it clips what overflows;
 * and the section it lives in animates its height by clipping; and the card it
 * lives in clips too. Every one of those is right on its own and all three of them
 * cut the top off a dropdown. That is what happened here, and no amount of
 * z-index fixes it — a clipped child is clipped whatever it is stacked above.
 *
 * So it is moved to the end of the document and placed by measuring, which is the
 * one arrangement that cannot be cut by an ancestor because it no longer has the
 * ancestor.
 *
 * <h2>What that costs</h2>
 *
 * It has to be told to move when the page scrolls, and it has to be measured after
 * layout rather than during render. Both are handled here so that nothing using it
 * has to know.
 */
/**
 * The room there is, without the scrollbar.
 *
 * `window.innerWidth` counts the scrollbar as room, so a menu held against the right
 * edge by it was held against a right edge seventeen pixels further out than the one
 * a person can see — and the last word of every line in it sat under the scrollbar.
 * The document element's own width is the drawing area and nothing else.
 */
function roomAcross(): number {
  return document.documentElement.clientWidth || window.innerWidth;
}

function roomDown(): number {
  return document.documentElement.clientHeight || window.innerHeight;
}

/**
 * Above the thing or below it.
 *
 * Below by default, above when below would not fit: a list that opens off the bottom
 * of the window is a list nobody can reach the end of. Centred asks for above and gets
 * it unless it was asked to sit below, and then falls back the same way round.
 */
function topFor(
  rect: DOMRect,
  tall: number,
  gap: number,
  align: 'stretch' | 'start' | 'centre',
  prefer: 'over' | 'under',
): number {
  const under = rect.bottom + gap;
  const over = rect.top - gap - tall;
  const room = roomDown() - under;
  if (align === 'centre' && prefer === 'over') return over;
  return room >= tall || over < 0 ? under : over;
}

export function Floating({
  anchor,
  open,
  align = 'stretch',
  gap = 4,
  prefer = 'over',
  through = false,
  children,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  /**
   * How it sits against the thing it belongs to.
   *
   * `stretch` takes the anchor's width, `start` lines up with its left edge but
   * keeps its own width, `centre` sits centred above it.
   */
  align?: 'stretch' | 'start' | 'centre';
  gap?: number;
  /**
   * Which side of the anchor it sits on when both would fit.
   *
   * Over, for anything centred: an explanation of a switch belongs above the switch,
   * where it does not cover the rest of the panel the person is reading. Under, for a
   * row of buttons that sits beneath the words it acts on — the explanation of the
   * reply button was landing on the comment being replied to.
   */
  prefer?: 'over' | 'under';
  /**
   * Let the mouse pass straight through it.
   *
   * For anything that only explains and is never pressed. Because this sits at the
   * end of the document it is nobody's child, so a menu watching for a press
   * outside itself counts a press on this as outside — and the control underneath
   * never hears it at all. Both were visible at once: resting on one button put
   * its explanation over the switch above, and the press meant for the switch shut
   * the menu instead.
   */
  through?: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [where, setWhere] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setWhere(null);
      return;
    }

    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const own = box.current?.getBoundingClientRect();
      const tall = own?.height ?? 0;
      const wide = own?.width ?? rect.width;

      const top = topFor(rect, tall, gap, align, prefer);

      const middle = rect.left + rect.width / 2;
      const rawLeft = align === 'centre' ? middle - wide / 2 : rect.left;
      const left = Math.max(8, Math.min(rawLeft, roomAcross() - wide - 8));

      setWhere({ left, top, width: rect.width });
    };

    place();
    // Scrolling anywhere can move the anchor, including inside a panel, so this
    // listens on the capture phase rather than only on the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, align, gap, prefer, children]);

  // A second pass once the content has a size of its own: the first placement is
  // made before it has been laid out, so anything opening upwards would be out by
  // its own height.
  useEffect(() => {
    if (!open || !anchor) return;
    const again = requestAnimationFrame(() => {
      const rect = anchor.getBoundingClientRect();
      const own = box.current?.getBoundingClientRect();
      if (!own) return;
      const top = topFor(rect, own.height, gap, align, prefer);
      const middle = rect.left + rect.width / 2;
      const rawLeft = align === 'centre' ? middle - own.width / 2 : rect.left;
      const left = Math.max(8, Math.min(rawLeft, roomAcross() - own.width - 8));
      setWhere({ left, top, width: rect.width });
    });
    return () => cancelAnimationFrame(again);
  }, [open, anchor, align, gap, prefer, children]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={box}
      className="floating"
      style={{
        left: where?.left ?? -9999,
        top: where?.top ?? -9999,
        width: align === 'stretch' ? where?.width : undefined,
        minWidth: align === 'start' ? where?.width : undefined,
        visibility: where ? 'visible' : 'hidden',
        pointerEvents: through ? 'none' : undefined,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
