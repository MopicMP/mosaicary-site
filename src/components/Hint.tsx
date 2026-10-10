import { useRef, useState, type ReactNode } from 'react';

import { Floating } from './Floating.js';

/**
 * A short explanation that only appears when somebody asks for it by resting on it.
 *
 * <h2>Why not a line of small text under the label</h2>
 *
 * Because it was, and a panel of switches with two lines each is a wall. The
 * explanation is worth having and it is worth having <em>once</em> — the first
 * time somebody wonders what a switch means. After that it is noise on every
 * visit, and noise on a control panel is what makes people stop reading the panel
 * at all.
 *
 * <h2>Why it is moved to the end of the document</h2>
 *
 * Same reason the dropdowns are: the panel it lives in has rounded corners and
 * therefore clips, the section it lives in animates its height by clipping, and
 * the card it lives in clips too. All three are right and all three cut the top
 * off a tooltip. Stacking cannot fix a clipped child; leaving the ancestor can.
 *
 * <h2>Why not the browser's own</h2>
 *
 * It does the same job, after a second and a half, in a system font, at the
 * pointer rather than at the thing. That delay is long enough that people give up
 * before it appears.
 */
export function Hint({
  says,
  under = false,
  children,
}: {
  says: string;
  /**
   * Below the thing instead of above it.
   *
   * For a row of buttons that sits under the words it acts on: the explanation of the
   * reply button was appearing over the comment being replied to, which is the one
   * thing on screen the person was reading.
   */
  under?: boolean;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const waiting = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(waiting.current);
    waiting.current = window.setTimeout(() => setShown(true), 260);
  };
  const hide = () => {
    window.clearTimeout(waiting.current);
    setShown(false);
  };

  return (
    <span
      className="hinted"
      ref={setAnchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <Floating
        anchor={anchor}
        open={shown}
        align="centre"
        gap={6}
        prefer={under ? 'under' : 'over'}
        through
      >
        <span className="hint-box" role="tooltip">
          {says}
        </span>
      </Floating>
    </span>
  );
}
