import { ChevronDown, ChevronRight, Repeat, Timer, User } from 'lucide-react';
import { useState } from 'react';

import {
  SHORT,
  authorsOf,
  treeOf,
  type Kind,
  narrowedAnimations,
  type Animation,
  type AnimationFilters as Filters,
} from '../lib/animations.js';
import { FiltersTop, Found, Switch } from './filters/Kit.js';

/**
 * The filter panel for animations, built like the one for skins.
 *
 * <h2>Why the categories are a tree and not a list</h2>
 *
 * Because the pack's own labels are one: thirteen of its animations are "JoJo" and
 * every one of those is also "Мульти вселенная". Flattened into one list of
 * fifty-seven, a person looking for a dance from an anime has to know which of the
 * two words the pack happened to use — and both are there, side by side, with no
 * hint that one lives inside the other.
 *
 * Which label is a subdivision of which is not decided here or anywhere else by
 * hand. It is read out of the pack by containment, the same rule the mod uses, so
 * the tree cannot drift from what the animations actually say.
 *
 * <h2>Why the author is a filter at all, with one author in the catalogue</h2>
 *
 * Because there will not be one for long. The pack is Milyan's and the catalogue
 * says so on every card, but the schema never assumed a single author and neither
 * should the panel — a control that appears the day a second pack arrives is a
 * control nobody has ever used.
 */
export function AnimationFilters({
  all,
  said,
  filters,
  onChange,
  found,
  onClose,
}: {
  all: Animation[];
  /** The pack's own tree, when the server has one. */
  said: { tag: string; parent: string | null }[];
  filters: Filters;
  onChange: (next: Filters) => void;
  found: number;
  onClose?: () => void;
}) {
  const kinds = treeOf(all, said);
  const authors = authorsOf(all);
  const set = (over: Partial<Filters>) => onChange({ ...filters, ...over });
  const toggleTag = (tag: string) =>
    set({
      tags: filters.tags.includes(tag)
        ? filters.tags.filter((one) => one !== tag)
        : [...filters.tags, tag],
    });

  return (
    <aside className="filters">
      <FiltersTop
        narrowed={narrowedAnimations(filters)}
        onReset={() => onChange({ ...filters, tags: [], authors: [], loopOnly: false, shortOnly: false })}
        onClose={onClose}
      />

      <section className="group">
        <h3>
          <span className="group-title as-label">Вид</span>
        </h3>
        <div className="kinds">
          {kinds.map((kind) => (
            <Branch
              key={kind.tag}
              kind={kind}
              chosen={filters.tags}
              onPick={toggleTag}
            />
          ))}
        </div>
      </section>

      {authors.length > 1 && (
        <section className="group">
          <h3>
            <span className="group-title as-label">Автор</span>
          </h3>
          <div className="kinds">
            {authors.map((one) => (
              <button
                key={one.author}
                type="button"
                className={filters.authors.includes(one.author) ? 'kind on' : 'kind'}
                onClick={() =>
                  set({
                    authors: filters.authors.includes(one.author)
                      ? filters.authors.filter((each) => each !== one.author)
                      : [...filters.authors, one.author],
                  })
                }
              >
                <User size={13} />
                <span className="kind-name">{one.author}</span>
                <small>{one.count}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="group">
        <h3>
          <span className="group-title as-label">Какие</span>
        </h3>
        <div className="pane-body">
          <Switch
            on={filters.loopOnly}
            icon={<Repeat size={15} />}
            label="Повторяются"
            says="Такую анимацию можно оставить на персонаже — она идёт по кругу, а не замирает в конце."
            onToggle={() => set({ loopOnly: !filters.loopOnly })}
          />
          <Switch
            on={filters.shortOnly}
            icon={<Timer size={15} />}
            label="Короткие"
            says={`Короче ${SHORT / 20} секунд — это жест, а не выступление. Такие годятся на приветствие или реакцию.`}
            onToggle={() => set({ shortOnly: !filters.shortOnly })}
          />
        </div>
      </section>

      <Found found={found} />
    </aside>
  );
}

/** One category, with whatever the pack files under it. */
function Branch({
  kind,
  chosen,
  onPick,
}: {
  kind: Kind;
  chosen: string[];
  onPick: (tag: string) => void;
}) {
  // Open when something inside it is chosen, so a filter never hides the reason
  // the list is short.
  const [open, setOpen] = useState(() => kind.under.some((one) => chosen.includes(one.tag)));
  const has = kind.under.length > 0;

  return (
    <div className="kind-branch">
      <div className={chosen.includes(kind.tag) ? 'kind on' : 'kind'}>
        {has ? (
          <button
            type="button"
            className="kind-open"
            aria-label={open ? 'свернуть' : 'развернуть'}
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="kind-open" />
        )}
        <button type="button" className="kind-pick" onClick={() => onPick(kind.tag)}>
          <span className="kind-name">{kind.tag}</span>
          <small>{kind.count}</small>
        </button>
      </div>

      {has && open && (
        <div className="kind-under">
          {kind.under.map((one) => (
            <button
              key={one.tag}
              type="button"
              className={chosen.includes(one.tag) ? 'kind on' : 'kind'}
              onClick={() => onPick(one.tag)}
            >
              <span className="kind-name">{one.tag}</span>
              <small>{one.count}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
