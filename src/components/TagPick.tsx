import { Plus, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { TAGS_MAX, cleanTags } from '../../shared/modelRules.js';
import { useKnownTags } from '../lib/knownTags.js';
import { Floating } from './Floating.js';

/** How many suggestions are shown at once. More is a list to read, not a hint. */
const SHOWN = 8;

/**
 * Tags, chosen by searching the ones that exist, and made new only when needed.
 *
 * <h2>Why not a line of words and commas</h2>
 *
 * Because a typed line invents a new tag on every typo, and the catalogue ends up with
 * "мебель", "мебеля" and "furniture", each finding a third of what it should. Typing
 * here searches the tags in use, most used first, and the suggestion is one key away.
 *
 * <h2>When a new one is offered</h2>
 *
 * Whenever no tag is exactly what was typed — after the suggestions, not instead of
 * them. Offering it only when nothing matched at all would make "кот" impossible to
 * create while "котёл" exists.
 *
 * Enter takes the highlighted row, a comma takes what was typed as it is, Backspace in
 * an empty field takes the last tag off. The words are cleaned the way the far side
 * cleans them, so what is shown is exactly what will be kept.
 */
export function TagPick({
  tags,
  onChange,
  disabled = false,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const known = useKnownTags();
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const full = tags.length >= TAGS_MAX;
  const word = cleanTags([typed])[0] ?? '';

  const offered = useMemo(() => {
    const free = known.filter((one) => !tags.includes(one.tag));
    if (!word) return free.slice(0, SHOWN);
    // Starting with the word first, then containing it; the most used first in each.
    const starts = free.filter((one) => one.tag.startsWith(word));
    const inside = free.filter((one) => !one.tag.startsWith(word) && one.tag.includes(word));
    return [...starts, ...inside].slice(0, SHOWN);
  }, [known, tags, word]);

  const fresh = word !== '' && !tags.includes(word) && !known.some((one) => one.tag === word);
  const rows = offered.length + (fresh ? 1 : 0);

  useEffect(() => setActive(0), [word]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const at = event.target as Node;
      if (anchor?.contains(at) || list.current?.contains(at)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, anchor]);

  const add = (tag: string) => {
    if (!tag || tags.includes(tag) || full) return;
    onChange([...tags, tag]);
    setTyped('');
    field.current?.focus();
  };

  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && rows > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((at) => (at + 1) % rows);
    } else if (event.key === 'ArrowUp' && rows > 0) {
      event.preventDefault();
      setActive((at) => (at - 1 + rows) % rows);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active < offered.length) add(offered[active]!.tag);
      else if (fresh) add(word);
    } else if (event.key === ',') {
      event.preventDefault();
      add(word);
    } else if (event.key === 'Backspace' && typed === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if (event.key === 'Escape' && open) {
      // Closing the list, not the window around it.
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={disabled ? 'tag-pick off' : 'tag-pick'} ref={setAnchor} onClick={() => field.current?.focus()}>
      {tags.map((tag) => (
        <span key={tag} className="taken">
          {tag}
          <button
            type="button"
            aria-label={`Убрать тег ${tag}`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onChange(tags.filter((one) => one !== tag));
            }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        ref={field}
        value={typed}
        disabled={disabled || full}
        placeholder={full ? `Больше ${TAGS_MAX} нельзя` : tags.length ? 'Ещё тег' : 'Найти или создать тег'}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setTyped(event.target.value);
          setOpen(true);
        }}
        onKeyDown={key}
      />

      <Floating anchor={anchor} open={open && !full && !disabled && rows > 0} align="stretch" gap={4} prefer="under">
        <div className="drop-list tag-list" ref={list}>
          {offered.map((one, at) => (
            <button
              type="button"
              key={one.tag}
              className={at === active ? 'drop-one on' : 'drop-one'}
              onMouseEnter={() => setActive(at)}
              onClick={() => add(one.tag)}
            >
              <Tag size={13} />
              <span className="drop-label">{one.tag}</span>
              <small>{one.count}</small>
            </button>
          ))}
          {fresh && (
            <button
              type="button"
              className={active === offered.length ? 'drop-one tag-new on' : 'drop-one tag-new'}
              onMouseEnter={() => setActive(offered.length)}
              onClick={() => add(word)}
            >
              <Plus size={13} />
              <span className="drop-label">Создать тег «{word}»</span>
            </button>
          )}
        </div>
      </Floating>
    </div>
  );
}
