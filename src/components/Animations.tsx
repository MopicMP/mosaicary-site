import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  Pause,
  Play,
  Repeat,
  Search,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  NO_ANIMATION_FILTERS,
  PER_PAGE,
  animationsFromApi,
  kindsFromApi,
  howLong,
  siftAnimations,
  type Animation,
} from '../lib/animations.js';
import type { Skin } from '../lib/catalogue.js';
import { AnimationFilters } from './AnimationFilters.js';
import { AnimationStage } from './AnimationStage.js';
import { Dropdown } from './Dropdown.js';
import { Hint } from './Hint.js';

/**
 * Seven hundred animations, and the two things that make them usable.
 *
 * <h2>They play, because an icon of an animation is a photograph of a dance</h2>
 *
 * Nobody picks between "Beyond the way" and "Стойка Альбедо" by name. Only what is
 * asked for plays, though — each one fetches its own keyframes, a quarter of a
 * megabyte — so the rest show the icon the pack ships them with.
 *
 * <h2>And they come a page at a time</h2>
 *
 * Seven hundred cards in one list is seven hundred images decoded, and the browser
 * spends the first few seconds of every visit on animations nobody will scroll to.
 * Sixty is enough to scan and few enough that they all draw at once.
 *
 * <h2>The credit is on the page and on every card</h2>
 *
 * Not in a credits page nobody opens. The pack is a gift — seven hundred
 * animations from one person, given away — and the least a catalogue can do is
 * carry his name and his two links wherever it carries his work.
 */
export function Animations({ skins }: { skins: Skin[] }) {
  const [all, setAll] = useState<Animation[]>([]);
  const [broken, setBroken] = useState<string | null>(null);
  const [filters, setFilters] = useState(NO_ANIMATION_FILTERS);
  const [playing, setPlaying] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 960);
  const [wearing, setWearing] = useState<Skin | null>(null);
  const [kinds, setKinds] = useState<{ tag: string; parent: string | null }[]>([]);

  useEffect(() => {
    animationsFromApi()
      .then(setAll)
      .catch((why: Error) => setBroken(why.message));
    void kindsFromApi().then(setKinds);
  }, []);

  useEffect(() => {
    if (!wearing && skins.length) setWearing(skins[0]!);
  }, [skins, wearing]);

  const shown = useMemo(() => siftAnimations(all, filters), [all, filters]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  // Narrowing the list can leave you on a page that no longer exists, which reads
  // as an empty catalogue rather than as a filter having worked.
  const at = Math.min(page, pages - 1);
  const here = shown.slice(at * PER_PAGE, (at + 1) * PER_PAGE);
  const credit = all[0];

  useEffect(() => setPage(0), [filters]);

  function turn(to: number) {
    setPage(Math.max(0, Math.min(pages - 1, to)));
    setPlaying(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className={panelOpen ? 'body panel-open emotes-body' : 'body emotes-body'}>
      <main className="grid-side">
        <header className="emotes-top">
          <label className="hunt">
            <Search size={18} />
            <input
              type="search"
              value={filters.search}
              placeholder="Что ищем"
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </label>

          {skins.length > 1 && (
            <div className="emotes-who">
              <Dropdown
                choices={skins.slice(0, 60).map((skin) => ({ value: skin.id, label: skin.name }))}
                chosen={wearing ? [wearing.id] : []}
                onChange={([pick]) => setWearing(skins.find((skin) => skin.id === pick) ?? null)}
                placeholder="на ком"
                most={1}
                searchable
                align="start"
              />
            </div>
          )}

          <Hint says={panelOpen ? 'убрать фильтры' : 'фильтры'}>
            <button
              type="button"
              className={panelOpen ? 'chip on' : 'chip'}
              aria-label="фильтры"
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <SlidersHorizontal size={16} />
            </button>
          </Hint>
        </header>

        {credit && (
          <div className="emotes-credit">
            <Heart size={14} />
            <span>
              Анимации — <strong>{credit.author}</strong>, проект #СП. Мы их не меняли и не владеем
              ими.
            </span>
            {credit.authorUrl && (
              <a href={credit.authorUrl} target="_blank" rel="noreferrer noopener">
                spemotes.com
                <ExternalLink size={11} />
              </a>
            )}
            {credit.supportUrl && (
              <a href={credit.supportUrl} target="_blank" rel="noreferrer noopener">
                поддержать автора
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}

        {broken && <p className="note bad">{broken}</p>}
        {!broken && !all.length && <p className="note">загружаю анимации…</p>}

        <div className="emotes-grid">
          {here.map((one) => (
            <article key={one.id} className={playing === one.id ? 'emote on' : 'emote'}>
              <div className="emote-view">
                {playing === one.id && wearing ? (
                  <AnimationStage
                    url={one.emote}
                    skinUrl={wearing.url}
                    layout={wearing.layout}
                    playing
                  />
                ) : one.icon ? (
                  <img src={one.icon} alt="" loading="lazy" />
                ) : (
                  <span className="emote-none">без картинки</span>
                )}

                <button
                  type="button"
                  className="emote-go"
                  aria-label={playing === one.id ? 'остановить' : 'показать'}
                  onClick={() => setPlaying(playing === one.id ? null : one.id)}
                >
                  {playing === one.id ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </div>

              <div className="emote-said">
                <span className="emote-name" title={one.description || one.name}>
                  {one.name}
                </span>
                <span className="emote-facts">
                  <Hint says={`автор — ${one.author}`}>
                    <span className="emote-by">{one.author}</span>
                  </Hint>
                  <Hint says="сколько идёт">
                    <span>
                      <Timer size={11} />
                      {howLong(one.ticks)}
                    </span>
                  </Hint>
                  {one.loop && (
                    <Hint says="повторяется — можно оставить на персонаже">
                      <span>
                        <Repeat size={11} />
                      </span>
                    </Hint>
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>

        {all.length > 0 && shown.length === 0 && (
          <p className="note">под эти условия ничего не подошло. Сбрось что-нибудь в фильтрах.</p>
        )}

        {pages > 1 && (
          <nav className="pages">
            <button
              type="button"
              className="chip"
              aria-label="назад"
              disabled={at === 0}
              onClick={() => turn(at - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="pages-said">
              {at + 1} из {pages}
            </span>
            <button
              type="button"
              className="chip"
              aria-label="вперёд"
              disabled={at >= pages - 1}
              onClick={() => turn(at + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </nav>
        )}
      </main>

      {all.length > 0 && (
        <AnimationFilters
          all={all}
          said={kinds}
          filters={filters}
          onChange={setFilters}
          found={shown.length}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
