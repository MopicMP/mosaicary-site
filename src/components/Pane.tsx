import type { ReactNode } from 'react';

import { Hint } from './Hint.js';

/** One titled block of a window's side column. */
export function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  /** A count or a mark at the far end of the title, where a panel has one. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pane">
      <h3>
        {title}
        {aside}
      </h3>
      <div className="pane-body">{children}</div>
    </section>
  );
}

/**
 * One fact, with its explanation on the hover and not underneath it.
 *
 * Five lines of small grey text under five values is a panel nobody reads twice —
 * and it is the same five lines on every skin, which is to say noise on every visit
 * after the first.
 */
export function Fact({ icon, says, children }: { icon: ReactNode; says: string; children: ReactNode }) {
  return (
    <Hint says={says}>
      <div className="fact">
        <span className="fact-icon">{icon}</span>
        <span className="fact-said">{children}</span>
      </div>
    </Hint>
  );
}
