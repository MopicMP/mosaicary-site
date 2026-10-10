import { Grid2x2, SlidersHorizontal, Upload as UploadMark } from 'lucide-react';
import type { ReactNode } from 'react';

import { here } from '../lib/address.js';
import type { Me } from '../lib/me.js';
import { NAME } from '../lib/site.js';
import { words } from '../lib/words.js';
import { Account } from './Account.js';
import { Dropdown } from './Dropdown.js';
import { Hint } from './Hint.js';
import { LanguagePick } from './LanguagePick.js';
import { Mark } from './Mark.js';

/**
 * The top of every page: the mark, a few words of navigation, and the buttons.
 *
 * One row, and the search is not in it. Catalogue sites put a bar across the whole
 * width because they have nowhere else to put it; this site has a panel of filters
 * that does nothing but narrow the catalogue, and a search narrows the catalogue.
 * Kept up here it was the one control standing outside the thing that says what the
 * list is narrowed by — and on a page with no panel at all, the shelf of your own
 * models, it was a field that did nothing when typed in.
 *
 * So the row holds what is not a filter: how many cards to a row, the panel's own
 * switch, uploading, what the site has to tell you, and who you are.
 *
 * <h2>The same header over every section</h2>
 *
 * Each section brings its own navigation and its own tools — the skins have their
 * angle and walking switches, the models do not — and the header lays them out the
 * same way whichever it is. A section that is not open yet still has its place in the
 * navigation, greyed, with a hint saying when it comes: taken out, it would look as
 * though it had been dropped.
 */

/**
 * How many to a row.
 *
 * A short list rather than a slider: the difference between seven and eight to a
 * row is not a thing anybody has an opinion about, and a control offering it
 * invites a decision that does not exist.
 */
export const ROWS = [3, 4, 5, 6, 8];

export interface NavItem {
  label: string;
  href: string;
  on: boolean;
  /** Why it cannot be used yet, for a section that is not open. */
  closed?: string;
}

export function Header({
  nav,
  onNav,
  tools,
  panelOpen,
  narrowed = false,
  onFilters,
  me,
  onLeave,
  onMe,
  notices,
  perRow,
  onPerRow,
  onUpload,
  uploadSays,
}: {
  nav: NavItem[];
  onNav: (href: string) => void;
  /** Switches that belong to one section, set in front of the filters button. */
  tools?: ReactNode;
  panelOpen?: boolean;
  /** Whether the panel is narrowing anything, which a shut panel cannot say itself. */
  narrowed?: boolean;
  onFilters?: () => void;
  me: Me;
  onLeave: () => void;
  /** Something about this person changed on the far side: ask again. */
  onMe: () => void;
  /** What the site has to tell this person, where there is anything to tell. */
  notices?: ReactNode;
  perRow?: number;
  onPerRow?: (many: number) => void;
  onUpload?: () => void;
  /** What the upload button is for here, where it is not simply "upload". */
  uploadSays?: string;
}) {
  const says = uploadSays ?? words().head.upload;
  const home = here('/');
  return (
    <header className="top">
      <div className="top-bar">
        <a
          className="brand"
          href={home}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.button !== 0) return;
            event.preventDefault();
            onNav(home);
          }}
        >
          <Mark />
          {NAME.replace(/ /g, '\u00a0')}
        </a>

        {/*
         * Real links with real addresses, caught rather than followed. The address
         * is what decides which page this is, so a middle click and "open in a new
         * tab" work without anything extra being written.
         */}
        <nav className="top-nav">
          {nav.map((item) => {
            const link = (
              <a
                key={item.href}
                className={[item.on && 'on', item.closed && 'closed'].filter(Boolean).join(' ') || undefined}
                href={item.href}
                aria-disabled={item.closed ? true : undefined}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.button !== 0) return;
                  event.preventDefault();
                  onNav(item.href);
                }}
              >
                {item.label}
              </a>
            );
            return item.closed ? (
              <Hint key={item.href} says={item.closed}>
                {link}
              </Hint>
            ) : (
              link
            );
          })}
        </nav>

        <div className="top-right">
          {/*
           * How many to a row, chosen rather than left to the window. As many as fit
           * is nine or ten across a wide screen, and a row of ten reads as texture
           * instead of as ten things. Beside the panel's switch because both are
           * about the looking and neither narrows what is looked at.
           */}
          {perRow !== undefined && onPerRow && (
            <div className="top-rows">
              <Dropdown
                choices={ROWS.map((many) => ({
                  value: many,
                  label: words().head.per_row(many),
                  icon: <Grid2x2 size={15} />,
                }))}
                chosen={[perRow]}
                onChange={([pick]) => onPerRow(pick ?? 5)}
                placeholder={words().head.per_row_short}
                most={1}
                align="start"
              />
            </div>
          )}

          <div className="views">
            {tools}
            {/*
             * Here rather than hidden on wide screens, because the panel can be shut
             * on any screen — and a thing that can be shut needs something that
             * opens it again, in one fixed place.
             *
             * Marked when something in it is narrowing the list. The panel says that
             * itself while it is open; shut, it holds a search and nine sections
             * nothing on the page would otherwise account for.
             */}
            {onFilters && (
              <Hint
                says={
                  panelOpen
                    ? words().head.filters_close
                    : narrowed
                      ? words().head.filters_marked
                      : words().head.filters
                }
              >
                <button
                  type="button"
                  className={['chip', panelOpen && 'on', narrowed && 'marked'].filter(Boolean).join(' ')}
                  aria-label={words().head.filters}
                  onClick={onFilters}
                >
                  <SlidersHorizontal size={16} />
                </button>
              </Hint>
            )}
          </div>
          {/* Only where it can work. A button that answers "войди сначала" is a
              button that should not have been there. */}
          {me.signedIn && onUpload && (
            <Hint says={says}>
              <button type="button" className="chip go" aria-label={says} onClick={onUpload}>
                <UploadMark size={16} />
              </button>
            </Hint>
          )}
          <LanguagePick />
          {me.signedIn && notices}
          <Account me={me} onLeave={onLeave} onMe={onMe} />
        </div>
      </div>
    </header>
  );
}
