import { Boxes, Pause, Play, Rows3, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FilterPanel } from './components/FilterPanel.js';
import { Header, ROWS } from './components/Header.js';
import { Hint } from './components/Hint.js';
import { Animations } from './components/Animations.js';
import { Profile } from './components/Profile.js';
import { SkinCard } from './components/SkinCard.js';
import { SkinWindow } from './components/SkinWindow.js';
import { Upload } from './components/Upload.js';
import type { View } from './components/SkinFigure.js';
import { skinsFromApi, type Mine } from './lib/api.js';
import { pageOf, pathOfPage, pathOfSkin, skinInPath, type Page } from './lib/address.js';
import { NO_FILTERS, narrowed, sift, tagsOf, type Filters, type Skin } from './lib/catalogue.js';
import { isBoolean, useKept } from './lib/kept.js';
import { NOBODY, askWhoIAm, loginTrouble, type Me } from './lib/me.js';

/**
 * The skins, as the whole site was before models came first.
 *
 * Kept whole and working rather than taken apart, because skins are the second
 * version of the site and not a thing that was dropped. Until then this runs only
 * with `npm run dev:skins`, against the old local server; the site that is put up
 * shows a page saying when skins come instead.
 *
 * Two things at once, and they are the two the references got right. The grid is
 * laid out the way a skin site lays one out, because that is what a hand expects.
 * The filters are a column of controls all visible at the same time, because a
 * panel that folds its controls into menus makes you open three of them to find
 * out why a search returned nothing.
 *
 * The skins here are samples off the disk until uploads exist. They are real files
 * at real sizes, including two in the layout from before 1.8 — on purpose: that
 * layout is what made seven of fifty real skins look broken, and a demo that only
 * shows the easy case proves nothing.
 */
export function SkinsApp() {
  const [skins, setSkins] = useState<Skin[]>([]);
  const [broken, setBroken] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // Open on a screen with room for it and shut on one without, and closable
  // either way — the cross in its corner used to do nothing at all on a wide
  // screen, because the panel was shown by the layout rather than by this.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 960);
  const [view, setView] = useKept<View>(
    'view',
    'angled',
    (value): value is View => value === 'angled' || value === 'flat',
  );
  // Still by default: what a skin site shows is a stopped step, not a walk. The
  // walk is one press away for anybody who wants it.
  const [moving, setMoving] = useKept('moving', false, isBoolean);
  /**
   * How many skins to a row.
   *
   * Was as many as fit, which at this card size is nine or ten across a wide
   * screen — and a row of ten is a row the eye reads as texture rather than as ten
   * things. Five is close to what the references settle on, and it is the choice
   * of the person looking rather than of the window they happen to have open.
   */
  const [perRow, setPerRow] = useKept<number>(
    'perRow',
    5,
    (value): value is number => typeof value === 'number' && ROWS.includes(value),
  );
  const [me, setMe] = useState<Me>(NOBODY);
  // Whatever the trip through Discord had to say, said once. Kept out of the
  // address afterwards so that a reload does not repeat a complaint about
  // something that happened a minute ago.
  const [trouble, setTrouble] = useState(() => loginTrouble(location.search));
  /**
   * Which skin is open, taken from the address.
   *
   * The address is what decides, rather than a flag with the address kept in step
   * afterwards. That way a link somebody was sent opens the same thing as a press
   * on a card, and the browser's own Back closes the window instead of leaving the
   * site — the two things people actually lose when a window has no address.
   */
  const [openId, setOpenId] = useState<string | null>(() => skinInPath(location.pathname));
  const [page, setPage] = useState<Page>(() => pageOf(location.pathname));
  const [putting, setPutting] = useState(false);
  // Whether this page put the open skin in the history itself, which decides
  // whether closing can step back or has to rewrite the address in place.
  const pushed = useRef(false);
  // Where the window was opened from, so closing it goes back to that page and
  // not to the front — a skin opened from your own shelf belongs to your shelf.
  const cameFrom = useRef<Page>(page);

  useEffect(() => {
    void askWhoIAm().then(setMe);
    if (loginTrouble(location.search)) {
      history.replaceState(null, '', location.pathname);
    }
    const stepped = () => {
      pushed.current = false;
      setOpenId(skinInPath(location.pathname));
      setPage(pageOf(location.pathname));
    };
    window.addEventListener('popstate', stepped);
    return () => window.removeEventListener('popstate', stepped);
  }, []);

  /**
   * The catalogue, from the one place it comes from.
   *
   * Everything is a row now — the shipped samples went into the database the
   * first time it came up empty. One kind of skin, one address, one path through
   * every list and filter and window: the second path is where the bugs live,
   * because it is exercised constantly while there is nothing real and never
   * again afterwards.
   */
  const [mine, setMine] = useState<Mine[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    skinsFromApi()
      .then(setSkins)
      .catch((why: Error) => setBroken(why.message));
  }, [fresh]);

  useEffect(() => {
    if (!me.signedIn) {
      setMine([]);
      return;
    }
    setLoadingMine(true);
    skinsFromApi(true)
      .then(setMine)
      .catch(() => setMine([]))
      .finally(() => setLoadingMine(false));
  }, [me.signedIn, fresh]);

  const tags = useMemo(() => tagsOf(skins), [skins]);
  const shown = useMemo(() => sift(skins, filters), [skins, filters]);

  // A window opens over whichever list it was opened from, and walks along that
  // list — the arrows on your own shelf should not wander into the catalogue.
  const list = cameFrom.current === 'mine' ? mine : shown;
  const at = list.findIndex((skin) => skin.id === openId);
  const open = at >= 0 ? list[at]! : null;

  function show(id: string) {
    cameFrom.current = page;
    history.pushState(null, '', pathOfSkin(id));
    pushed.current = true;
    setOpenId(id);
  }

  function hide() {
    // Stepping back where this page took the step, so the window does not leave a
    // trail of entries behind it. Rewriting where it did not, because a link
    // opened straight onto a skin has nothing of ours to step back to.
    if (pushed.current) {
      history.back();
      return;
    }
    history.replaceState(null, '', pathOfPage(cameFrom.current));
    setOpenId(null);
  }

  function go(where: Page) {
    cameFrom.current = where;
    history.pushState(null, '', pathOfPage(where));
    setPage(where);
    setOpenId(null);
  }

  /**
   * The next or the previous one in the list as it stands.
   *
   * Along the list on screen rather than along the whole catalogue: somebody who
   * has filtered down to twelve blue-eyed skins and presses the arrow means the
   * next of those twelve. It wraps, because at either end the alternative is a
   * button that looks the same and does nothing.
   */
  function walk(by: 1 | -1) {
    if (!list.length || at < 0) return;
    const next = list[(at + by + list.length) % list.length]!;
    history.replaceState(null, '', pathOfSkin(next.id));
    setOpenId(next.id);
  }

  return (
    <div className="page">
      <Header
        nav={[
          { label: 'Каталог', href: '/', on: page === 'catalogue' },
          { label: 'Анимации', href: '/animations', on: page === 'animations' },
          { label: 'Мои скины', href: '/me', on: page === 'mine' },
        ]}
        onNav={(href) => go(pageOf(href))}
        tools={
          <>
            <Hint says="Показывать под углом">
              <button
                type="button"
                className={view === 'angled' ? 'chip on' : 'chip'}
                aria-label="Под углом"
                onClick={() => setView('angled')}
              >
                <Boxes size={16} />
              </button>
            </Hint>
            <Hint says="Показывать прямо">
              <button
                type="button"
                className={view === 'flat' ? 'chip on' : 'chip'}
                aria-label="Прямо"
                onClick={() => setView('flat')}
              >
                <Rows3 size={16} />
              </button>
            </Hint>
            <Hint says={moving ? 'Остановить' : 'Пусть идут'}>
              <button
                type="button"
                className={moving ? 'chip on' : 'chip'}
                aria-label={moving ? 'Остановить' : 'Пусть идут'}
                onClick={() => setMoving(!moving)}
              >
                {moving ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </Hint>
          </>
        }
        panelOpen={panelOpen}
        narrowed={narrowed(filters)}
        // Only where there is a panel to open, as the search now lives inside it.
        onFilters={page === 'catalogue' ? () => setPanelOpen(!panelOpen) : undefined}
        me={me}
        onLeave={() => setMe(NOBODY)}
        onMe={() => void askWhoIAm().then(setMe)}
        perRow={perRow}
        onPerRow={setPerRow}
        onUpload={() => setPutting(true)}
        uploadSays="Загрузить скины"
      />

      {page === 'animations' && <Animations skins={skins} />}

      {page !== 'animations' && (
      <div className={panelOpen && page === 'catalogue' ? 'body panel-open' : 'body'}>
        <main className="grid-side" style={{ '--per-row': perRow } as React.CSSProperties}>
          {page === 'mine' && (
            <Profile
              me={me}
              skins={mine}
              loading={loadingMine}
              view={view}
              moving={moving}
              onOpen={show}
              onUpload={() => setPutting(true)}
            />
          )}

          {page === 'catalogue' && trouble && (
            <p className="note bad">
              {trouble}
              <button type="button" className="icon-only" title="Понятно" onClick={() => setTrouble(null)}>
                <X size={14} />
              </button>
            </p>
          )}
          {page === 'catalogue' && broken && (
            <p className="note bad">Каталог не загрузился: {broken}</p>
          )}
          {page === 'catalogue' && !broken && !skins.length && (
            <p className="note">Загружаю каталог…</p>
          )}

          <Settling on={page === 'catalogue' ? shown.map((skin) => skin.id).join() : 'mine'}>
            {page === 'catalogue' && shown.length > 0 && (
              // The count is a variable rather than a class, so adding a seventh
              // choice is one entry in a list instead of a rule in a stylesheet.
              <div className="grid">
                {shown.map((skin, place) => (
                  <SkinCard
                    key={skin.id}
                    skin={skin}
                    view={view}
                    moving={moving}
                    rank={filters.sort === 'popular' ? place + 1 : undefined}
                    onOpen={() => show(skin.id)}
                  />
                ))}
              </div>
            )}

            {page === 'catalogue' && skins.length > 0 && shown.length === 0 && (
              <p className="note">
                Под эти условия ничего не подошло. Сбрось что-нибудь в фильтрах.
              </p>
            )}
          </Settling>
        </main>

        {page === 'catalogue' && (
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            tags={tags}
            found={shown.length}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
      )}

      {open && (
        <SkinWindow
          skin={open}
          onClose={hide}
          onWalk={walk}
          where={{ at, of: list.length }}
          onChanged={() => setFresh((was) => was + 1)}
          onOpenOther={show}
        />
      )}

      {putting && (
        <Upload
          onClose={() => setPutting(false)}
          // Both lists again: a skin just put in belongs on your shelf and, once
          // anything is public, in the catalogue. Counting up rather than calling
          // two setters means one place decides what "again" means.
          onPut={() => setFresh((was) => was + 1)}
        />
      )}
    </div>
  );
}

/**
 * Fades what is inside out and back when it changes.
 *
 * Sorting and filtering replace the whole grid at once, and a grid that swaps in a
 * single frame reads as a glitch rather than as an answer — you cannot tell
 * whether it did something until you look for a card you remember. Half a blink of
 * fade is enough to say "this is now a different list" without making anybody
 * wait: what changes is opacity, and the new list is already there underneath.
 */
function Settling({ on, children }: { on: string; children: React.ReactNode }) {
  const [settled, setSettled] = useState(true);
  const was = useRef(on);

  useEffect(() => {
    if (was.current === on) return;
    was.current = on;
    setSettled(false);
    const soon = window.setTimeout(() => setSettled(true), 20);
    return () => window.clearTimeout(soon);
  }, [on]);

  return <div className={settled ? 'settling' : 'settling off'}>{children}</div>;
}
