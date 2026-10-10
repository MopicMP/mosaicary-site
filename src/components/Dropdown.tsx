import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { words } from '../lib/words.js';
import { Floating } from './Floating.js';

/**
 * A list that lives inside one line until it is asked for.
 *
 * The rule this exists to keep: nothing here is ever laid out as a plain run of
 * values. A list of tags spread across a panel is twelve things today and forty
 * next month, and the panel falls apart the day somebody adds the fortieth. A
 * dropdown is one line at any length, and it can be searched, which a scattering
 * of pills never can.
 *
 * Multiple choice keeps the panel open after a pick, because choosing three tags
 * is one action in a person's head and should not be three trips. Single choice
 * closes, because it is finished.
 */

export interface Choice<T> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

export function Dropdown<T extends string | number>({
  choices,
  chosen,
  onChange,
  placeholder,
  most = Infinity,
  searchable = false,
  tone = 'in',
  align = 'stretch',
}: {
  choices: Choice<T>[];
  chosen: T[];
  onChange: (next: T[]) => void;
  placeholder: string;
  /** Above one, this is a multiple choice and the list stays open. */
  most?: number;
  searchable?: boolean;
  tone?: 'in' | 'out';
  /**
   * Whether the list takes the button's width or its own.
   *
   * A button sized to the word in it is narrower than the longest choice, and a
   * list squeezed to that width wraps every line. Where the button is a column
   * of a panel, matching it is right; where it is a chip, it is not.
   */
  align?: 'stretch' | 'start';
}) {
  const [open, setOpen] = useState(false);
  const [hunt, setHunt] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [face, setFace] = useState<HTMLElement | null>(null);
  const many = most > 1;

  // Clicking anywhere else puts it away. Without this a panel of six dropdowns
  // ends up with three of them hanging open over each other.
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const at = event.target as Node;
      // The list is no longer inside the control — it is at the end of the
      // document, so that no panel can clip it — so both have to be asked.
      if (box.current?.contains(at) || list.current?.contains(at)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const shown = useMemo(() => {
    const needle = hunt.trim().toLowerCase();
    if (!needle) return choices;
    return choices.filter((one) => one.label.toLowerCase().includes(needle));
  }, [choices, hunt]);

  const picked = choices.filter((one) => chosen.includes(one.value));
  /**
   * Whether no more may be chosen — and only where more than one ever could.
   *
   * Written without that condition this was true for every single-choice list
   * the moment it had an answer: one chosen, one allowed, full. Every other
   * option then went grey, so a list that had been used once could never be
   * changed again. It read as a broken control rather than as a rule.
   */
  const full = many && chosen.length >= most;

  function pick(value: T) {
    if (!many) {
      onChange([value]);
      setOpen(false);
      return;
    }
    if (chosen.includes(value)) onChange(chosen.filter((each) => each !== value));
    else if (!full) onChange([...chosen, value]);
  }

  return (
    <div className={open ? 'drop open' : 'drop'} ref={box}>
      <button
        type="button"
        className="drop-face"
        ref={setFace}
        onClick={() => setOpen(!open)}
      >
        <span className="drop-said">
          {picked.length === 0 && <span className="drop-none">{placeholder}</span>}
          {picked.length > 0 && !many && (
            <>
              {picked[0]!.icon}
              {picked[0]!.label}
            </>
          )}
          {picked.length > 0 && many && words().drop.chosen(picked.length)}
        </span>
        <ChevronDown size={14} className="caret" />
      </button>

      {many && picked.length > 0 && (
        <div className="drop-picked">
          {picked.map((one) => (
            <button
              key={String(one.value)}
              type="button"
              className={tone === 'out' ? 'taken out' : 'taken'}
              onClick={() => pick(one.value)}
              title={words().drop.remove}
            >
              {one.label}
              <X size={11} />
            </button>
          ))}
        </div>
      )}

      <Floating anchor={face} open={open} align={align}>
        <div className="drop-list" ref={list}>
          {searchable && (
            <label className="drop-hunt">
              <Search size={13} />
              <input
                autoFocus
                value={hunt}
                placeholder={words().drop.find}
                onChange={(event) => setHunt(event.target.value)}
              />
            </label>
          )}
          <div className="drop-scroll">
            {shown.length === 0 && <p className="empty">{words().drop.nothing}</p>}
            {shown.map((one) => {
              const on = chosen.includes(one.value);
              return (
                <button
                  key={String(one.value)}
                  type="button"
                  className={on ? 'drop-one on' : 'drop-one'}
                  disabled={!on && full}
                  onClick={() => pick(one.value)}
                >
                  <span className="drop-tick">{on && <Check size={13} />}</span>
                  {one.icon}
                  <span className="drop-label">{one.label}</span>
                  {one.hint && <small>{one.hint}</small>}
                </button>
              );
            })}
          </div>
          {many && full && <p className="empty">{words().drop.most(most)}</p>}
        </div>
      </Floating>
    </div>
  );
}
