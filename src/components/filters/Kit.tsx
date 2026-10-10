import {
  AtSign,
  CalendarClock,
  ChevronDown,
  Clock,
  Globe,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Type,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { Scope } from '../../lib/catalogue.js';
import { Dropdown } from '../Dropdown.js';
import { Hint } from '../Hint.js';

/**
 * The parts every filter panel on the site is built from.
 *
 * <h2>Why one kit and not one panel</h2>
 *
 * Because the catalogues are different things and the panels are meant to feel like
 * one. Skins are chosen by who is drawn, models by what they are for, animations by
 * what kind of movement — each panel asks its own questions, and each is built from
 * the same pieces in the same order, so a person who has used one already knows
 * where everything is on the next.
 *
 * Two rules hold in every panel. Nothing is a plain run of values — every list is a
 * dropdown or a row of icons, because a run of twelve tags is a run of forty next
 * month. And nothing explains itself in a line of small text under its label: the
 * explanation waits until somebody rests on the thing and asks.
 */

/** Where a search looks, the same four places in every catalogue. */
export const SCOPES: { value: Scope; label: string; icon: ReactNode }[] = [
  { value: 'all', label: 'Везде', icon: <Globe size={15} /> },
  { value: 'name', label: 'По названию', icon: <Type size={15} /> },
  { value: 'author', label: 'По автору', icon: <AtSign size={15} /> },
  { value: 'tag', label: 'По тегу', icon: <Tag size={15} /> },
];

const AGES = [
  { value: 1, label: 'За сутки' },
  { value: 7, label: 'За неделю' },
  { value: 30, label: 'За месяц' },
  { value: 365, label: 'За год' },
];

/** The top of a panel: its name, the reset, and the cross that puts it away. */
export function FiltersTop({
  narrowed,
  onReset,
  onClose,
}: {
  narrowed: boolean;
  onReset: () => void;
  onClose?: () => void;
}) {
  return (
    <header className="filters-top">
      <span>Фильтры</span>
      <Hint says="Сбросить всё">
        <button
          type="button"
          className="icon-only"
          aria-label="Сбросить всё"
          disabled={!narrowed}
          onClick={onReset}
        >
          <RotateCcw size={15} />
        </button>
      </Hint>
      {onClose && (
        <Hint says="Закрыть">
          <button type="button" className="icon-only" aria-label="Закрыть" onClick={onClose}>
            <X size={15} />
          </button>
        </Hint>
      )}
    </header>
  );
}

/**
 * What is being looked for, and where it is looked for.
 *
 * In the panel and not across the top of the page, because a search is a filter and
 * nothing else: it narrows the same list the rest of the panel narrows, the same
 * reset clears it, and the count at the bottom answers it. Across the top it was the
 * one control that narrowed the catalogue from outside the thing that says what the
 * catalogue is narrowed by.
 *
 * Where it looks sits under the field rather than four sections below, because it is
 * not a filter of its own: on an empty field it does nothing at all.
 */
export function Hunt({
  search,
  scope,
  onSearch,
  onScope,
}: {
  search: string;
  scope: Scope;
  onSearch: (text: string) => void;
  onScope: (scope: Scope) => void;
}) {
  return (
    <div className="filters-hunt">
      <label className="hunt">
        <Search size={16} />
        <input type="search" value={search} placeholder="Что ищем" onChange={(event) => onSearch(event.target.value)} />
      </label>
      <Where scope={scope} onChange={onScope} />
    </div>
  );
}

/** How many are left, under everything, so the effect of a control is seen at once. */
export function Found({ found }: { found: number }) {
  return (
    <footer className="filters-found">
      <Sparkles size={14} />
      {found === 0 ? 'Ничего не нашлось' : `Нашлось: ${found}`}
    </footer>
  );
}

/**
 * A row of icons, one of which — or several of which — is chosen.
 *
 * A row rather than a list of words: six things read at a glance as six shapes and
 * as six lines of Russian they have to be read one at a time. The name is on the
 * hover, where it costs nothing.
 */
export function Icons<T extends string>({
  options,
  isOn,
  onPick,
}: {
  options: { value: T; label: string; icon: ReactNode }[];
  isOn: (value: T) => boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div className="row">
      {options.map((one) => (
        <Hint key={one.value} says={one.label}>
          <button
            type="button"
            className={isOn(one.value) ? 'chip on' : 'chip'}
            aria-label={one.label}
            onClick={() => onPick(one.value)}
          >
            {one.icon}
          </button>
        </Hint>
      ))}
    </div>
  );
}

/**
 * A section that folds, and folds smoothly.
 *
 * The height is animated through a grid row going from nothing to its own size,
 * which is the one way of doing it in CSS that does not need the height measured in
 * JavaScript first — and measuring is what makes these things stutter on the first
 * open.
 */
export function Section({
  title,
  aside,
  folded = false,
  children,
}: {
  title: string;
  aside?: ReactNode;
  folded?: boolean;
  children: ReactNode;
}) {
  const [shut, setShut] = useState(folded);
  return (
    <section className={shut ? 'group shut' : 'group'}>
      <h3>
        <button type="button" className="group-title" onClick={() => setShut(!shut)}>
          <ChevronDown size={14} className="caret" />
          {title}
        </button>
        {aside}
      </h3>
      <div className="group-fold">
        <div className="group-body">{children}</div>
      </div>
    </section>
  );
}

/** A yes-or-no, with what it means on the hover. */
export function Switch({
  on,
  icon,
  label,
  says,
  onToggle,
}: {
  on: boolean;
  icon: ReactNode;
  label: string;
  says: string;
  onToggle: () => void;
}) {
  return (
    <Hint says={says}>
      <button type="button" className={on ? 'switch on' : 'switch'} onClick={onToggle}>
        <span className="switch-box">{on && icon}</span>
        <span className="switch-text">{label}</span>
      </button>
    </Hint>
  );
}

/** Whether every chosen tag is needed or any one will do, beside the heading of the tags. */
export function AnyOrAll({ all, onChange }: { all: boolean; onChange: (all: boolean) => void }) {
  return (
    <div className="either">
      <Hint says="Достаточно любого из выбранных">
        <button type="button" className={all ? 'tiny' : 'tiny on'} onClick={() => onChange(false)}>
          Любой
        </button>
      </Hint>
      <Hint says="Нужны все выбранные сразу">
        <button type="button" className={all ? 'tiny on' : 'tiny'} onClick={() => onChange(true)}>
          Все
        </button>
      </Hint>
    </div>
  );
}

/** How recent, in the four steps people think in. */
export function Within({ days, onChange }: { days: number | null; onChange: (days: number | null) => void }) {
  return (
    <Dropdown
      choices={[
        { value: 'any', label: 'За всё время', icon: <CalendarClock size={14} /> },
        ...AGES.map((one) => ({ value: String(one.value), label: one.label, icon: <Clock size={14} /> })),
      ]}
      chosen={[days === null ? 'any' : String(days)]}
      onChange={([pick]) => onChange(pick === 'any' || pick === undefined ? null : Number(pick))}
      placeholder="За всё время"
      most={1}
    />
  );
}

/** Where a search looks. Only ever beside the field it belongs to, which is `Hunt`. */
function Where({ scope, onChange }: { scope: Scope; onChange: (scope: Scope) => void }) {
  return (
    <Dropdown
      choices={SCOPES.map((one) => ({ value: one.value, label: one.label, icon: one.icon }))}
      chosen={[scope]}
      onChange={([pick]) => onChange((pick ?? 'all') as Scope)}
      placeholder="Везде"
      most={1}
    />
  );
}
