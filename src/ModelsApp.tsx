import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import type { ModelSummary } from '../shared/modelWire.js';
import type { SiteCounts } from '../shared/siteWire.js';
import { BackdropPick } from './components/Backdrop.js';
import { Header, ROWS } from './components/Header.js';
import { Later } from './components/Later.js';
import { Papers } from './components/Papers.js';
import { ModelCard } from './components/ModelCard.js';
import { ModelFilterPanel } from './components/ModelFilterPanel.js';
import { ModelUpload } from './components/ModelUpload.js';
import { ModelWindow } from './components/ModelWindow.js';
import { MyModels } from './components/MyModels.js';
import { NoticeBell } from './components/Notices.js';
import {
  here,
  modelInPath,
  modelPageOf,
  pathOfModel,
  pathOfModelPage,
  sectionOf,
  type ModelPage,
} from './lib/address.js';
import { BackdropContext, NO_BACKDROP, isBackdrop } from './lib/backdrop.js';
import { useKept } from './lib/kept.js';
import { KnownTagsContext } from './lib/knownTags.js';
import { ALL_PAPERS, paperInPath, pathOfPaper, titleOfPaper, type Paper } from './lib/papers.js';
import { NOBODY, askWhoIAm, loginTrouble, viewOfMe, type Me } from './lib/me.js';
import { modelsFromApi, myLikes, myModels, sayWhy } from './lib/modelApi.js';
import { NO_MODEL_FILTERS, modelTagsOf, modelsNarrowed, siftModels, type ModelFilters } from './lib/models.js';
import { SECTIONS, coming, type Section } from './lib/site.js';
import { siteFacts } from './lib/siteApi.js';
import { words } from './lib/words.js';

/** One model window, of the several that can be open at once. */
interface Pane {
  key: number;
  id: string;
  /** The list it walks along: the catalogue as filtered, or one's own shelf. */
  from: ModelPage;
  /** How many were open when it opened, for where it first stands. */
  slot: number;
}

/**
 * How many windows at once.
 *
 * Each one draws with WebGL, and a browser gives a page about sixteen such contexts
 * before it starts taking the oldest away — the cards' pictures need some too. The
 * seventh window closes the first, which is the one least likely still being read.
 */
const MOST_PANES = 6;

let paneKey = 0;

/**
 * The site in its first version: models for Blockbench.
 *
 * Laid out as the skins were, on purpose. The same header, the same grid of cards
 * with a size chosen by the person looking, the same column of filters all visible
 * at once. Skins and animations keep their places in the header and answer with a
 * page saying when they come, rather than disappearing: nothing was taken away, it
 * is not open yet.
 *
 * Models open in windows over the grid, several at once, each moved and sized by
 * hand, so two models can be looked at side by side. The address is the model in
 * front, so a link somebody was sent opens the same thing as a press on a card, and
 * the browser's Back closes the windows instead of leaving the site.
 */
export function ModelsApp() {
  const [section, setSection] = useState<Section>(() => sectionOf(location.pathname));
  const [page, setPage] = useState<ModelPage>(() => modelPageOf(location.pathname));
  const [panes, setPanes] = useState<Pane[]>(() => {
    const id = modelInPath(location.pathname);
    return id ? [{ key: ++paneKey, id, from: 'catalogue', slot: 0 }] : [];
  });
  const [paper, setPaper] = useState<Paper | null>(() => paperInPath(location.pathname));
  const [me, setMe] = useState<Me>(NOBODY);
  const [trouble, setTrouble] = useState(() => loginTrouble(location.search));
  const [filters, setFilters] = useState<ModelFilters>(NO_MODEL_FILTERS);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 960);
  const [perRow, setPerRow] = useKept<number>(
    'modelsPerRow',
    5,
    (value): value is number => typeof value === 'number' && ROWS.includes(value),
  );
  // What to put behind the models, kept in this browser like the number to a row.
  const [backdrop, setBackdrop] = useKept('modelsBackdrop', NO_BACKDROP, isBackdrop);
  const [models, setModels] = useState<ModelSummary[] | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const [mine, setMine] = useState<ModelSummary[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState(0);
  const [putting, setPutting] = useState(false);
  // Whether this page put the first window in the history itself, which decides
  // whether closing the last one can step back or has to rewrite the address.
  const pushed = useRef(false);

  useEffect(() => {
    void askWhoIAm().then(setMe);
    if (loginTrouble(location.search)) history.replaceState(null, '', location.pathname);
    const stepped = () => {
      pushed.current = false;
      const path = location.pathname;
      setSection(sectionOf(path));
      setPaper(paperInPath(path));
      // Back out of the windows closes them, all at once: one step went into them,
      // one step comes out. Forward onto a model's address opens that one.
      const id = modelInPath(path);
      setPanes(id ? [{ key: ++paneKey, id, from: 'catalogue', slot: 0 }] : []);
      // A model's own address says nothing about the page under it; that stays.
      if (!id) setPage(modelPageOf(path));
    };
    window.addEventListener('popstate', stepped);
    return () => window.removeEventListener('popstate', stepped);
  }, []);

  useEffect(() => {
    modelsFromApi().then(
      (got) => {
        setModels(got);
        setBroken(null);
      },
      (why) => setBroken(sayWhy(why)),
    );
  }, [fresh]);

  useEffect(() => {
    if (!me.signedIn) {
      setMine([]);
      setLikes(new Set());
      return;
    }
    setLoadingMine(true);
    myModels()
      .then(setMine, () => setMine([]))
      .finally(() => setLoadingMine(false));
    void myLikes().then((ids) => setLikes(new Set(ids)));
  }, [me.signedIn, fresh]);

  const all = useMemo(() => models ?? [], [models]);
  const shown = useMemo(() => siftModels(all, filters), [all, filters]);
  const loved = useMemo(() => all.filter((model) => likes.has(model.id)), [all, likes]);
  // What the tag field offers: the catalogue and one's own drafts, each model once.
  const knownTags = useMemo(() => {
    const seen = new Map(all.map((model) => [model.id, model]));
    for (const model of mine) seen.set(model.id, model);
    return modelTagsOf([...seen.values()]);
  }, [all, mine]);

  // A window walks along the list it was opened from, as that list stands now.
  const listOf = (from: ModelPage) => (from === 'mine' ? mine : shown);

  /**
   * A model in a window: a new one, or the one already showing it brought forward.
   *
   * Only the first window is a step in the history. The ones after it rewrite the
   * address to the model in front, so a link copied from the bar is always the
   * model being looked at — and Back does not walk through every model seen.
   */
  function show(id: string) {
    const there = panes.find((pane) => pane.id === id);
    if (there) {
      raise(there.key);
      return;
    }
    const kept = panes.length >= MOST_PANES ? panes.slice(1) : panes;
    setPanes([...kept, { key: ++paneKey, id, from: page, slot: panes.length }]);
    if (panes.length === 0) {
      history.pushState(null, '', pathOfModel(id));
      pushed.current = true;
    } else {
      history.replaceState(null, '', pathOfModel(id));
    }
  }

  function raise(key: number) {
    const pane = panes.find((one) => one.key === key);
    if (!pane || panes[panes.length - 1] === pane) return;
    setPanes([...panes.filter((one) => one !== pane), pane]);
    history.replaceState(null, '', pathOfModel(pane.id));
  }

  function close(key: number) {
    const left = panes.filter((pane) => pane.key !== key);
    setPanes(left);
    const front = left[left.length - 1];
    if (front) {
      history.replaceState(null, '', pathOfModel(front.id));
      return;
    }
    // The last one: stepping back where this page took the step, so the windows
    // leave no trail of entries. Rewriting where it did not: a link opened straight
    // onto a model has nothing of ours to step back to.
    if (pushed.current) {
      pushed.current = false;
      history.back();
      return;
    }
    history.replaceState(null, '', pathOfModelPage(page));
  }

  /** Another model in the same window: walked to, or opened from inside it. */
  function swap(key: number, id: string) {
    setPanes(panes.map((pane) => (pane.key === key ? { ...pane, id } : pane)));
    if (panes[panes.length - 1]?.key === key) history.replaceState(null, '', pathOfModel(id));
  }

  /**
   * To another page of the site, by its address.
   *
   * The address is put through `here` first, so that everything inside this page may
   * pass a plain `/me` and still never drop the language. `here` leaves an address
   * that already carries one alone, so the links in the header arrive unchanged.
   */
  function go(path: string) {
    const href = here(path);
    const where = sectionOf(href);
    history.pushState(null, '', href);
    pushed.current = false;
    setSection(where);
    setPanes([]);
    setPaper(paperInPath(href));
    // A page of rules is read from the top, wherever the press came from.
    if (paperInPath(href)) window.scrollTo(0, 0);
    if (where === 'models') setPage(modelPageOf(href));
  }

  /**
   * The next or the previous one in the list as it stands, wrapping at the ends:
   * at either end the alternative is a button that looks the same and does nothing.
   */
  function walk(key: number, by: 1 | -1) {
    const pane = panes.find((one) => one.key === key);
    if (!pane) return;
    const list = listOf(pane.from);
    const at = list.findIndex((model) => model.id === pane.id);
    if (list.length < 2 || at < 0) return;
    swap(key, list[(at + by + list.length) % list.length]!.id);
  }

  /**
   * Something was published, changed or taken down: everything is asked again.
   *
   * Including who this is, because publishing a model for adults is the moment
   * somebody says their age, and from then on the page has one less thing to ask.
   */
  const changed = () => {
    setFresh((was) => was + 1);
    void askWhoIAm().then(setMe);
  };

  /**
   * They changed how models for adults are shown to them.
   *
   * The catalogue is asked for again rather than filtered here, because with them
   * hidden the far side does not send them at all — the page cannot show what it was
   * never given, and cannot hide what it has just been given either.
   */
  const viewChanged = () => {
    void askWhoIAm().then((who) => {
      setMe(who);
      setFresh((was) => was + 1);
    });
  };

  const upload = () => (me.signedIn ? setPutting(true) : go('/me'));

  /**
   * A model opened from a notice, from wherever the bell was pressed.
   *
   * The window is only drawn over the catalogue and the shelf, so a press on a page
   * of rules lands on the catalogue first — otherwise the address would change to a
   * model and the page would go on showing the rules.
   */
  const openNoticed = (id: string) => {
    if (paper || section !== 'models') go('/');
    show(id);
  };

  /**
   * A place on one of the papers: a clause a notice cites, or the answer the question
   * mark in a model window is about.
   *
   * The page goes first and the place is put in the address after, so the page finds
   * it there when it comes up — or, already up, hears it changed.
   */
  const openAt = (href: string) => {
    const where = here(href);
    go(where.split('#')[0]!);
    history.replaceState(null, '', where);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const bell = <NoticeBell fresh={fresh} onOpen={openNoticed} onRule={openAt} />;

  // Real addresses, language and all: these are links, and a middle click on one has
  // to open the page in the language the person is reading.
  const nav = [
    { label: words().nav.models, href: here('/'), on: section === 'models' && page === 'catalogue' && !paper },
    {
      label: words().nav.skins,
      href: here('/skins'),
      on: section === 'skins',
      closed: SECTIONS.skins ? undefined : coming('skins'),
    },
    {
      label: words().nav.animations,
      href: here('/animations'),
      on: section === 'animations',
      closed: SECTIONS.animations ? undefined : coming('animations'),
    },
    { label: words().head.mine, href: here('/me'), on: section === 'models' && page === 'mine' },
  ];

  // Rules, data and contacts, which are read rather than looked through: the header
  // without its search row, and no filters beside them.
  if (paper) {
    return (
      <div className="page">
        <Header nav={nav} onNav={go} me={me} onLeave={() => setMe(NOBODY)} onMe={viewChanged} notices={bell} />
        <Papers paper={paper} onNav={go} />
        <Foot onNav={go} />
      </div>
    );
  }

  if (section !== 'models') {
    return (
      <div className="page">
        <Header nav={nav} onNav={go} me={me} onLeave={() => setMe(NOBODY)} onMe={viewChanged} notices={bell} />
        <Later section={section} onBack={() => go('/')} />
        <Foot onNav={go} />
      </div>
    );
  }

  return (
    <BackdropContext.Provider value={backdrop}>
    <KnownTagsContext.Provider value={knownTags}>
    <div className="page">
      <Header
        nav={nav}
        onNav={go}
        tools={<BackdropPick backdrop={backdrop} onChange={setBackdrop} />}
        panelOpen={panelOpen}
        narrowed={modelsNarrowed(filters)}
        // Only where there is a panel to open. On your own shelf the button opened
        // nothing, and the search it now holds would have had nothing to search.
        onFilters={page === 'catalogue' ? () => setPanelOpen(!panelOpen) : undefined}
        me={me}
        onLeave={() => setMe(NOBODY)}
        onMe={viewChanged}
        notices={bell}
        perRow={perRow}
        onPerRow={setPerRow}
        onUpload={upload}
        uploadSays={words().models.upload}
      />

      <div className={panelOpen && page === 'catalogue' ? 'body panel-open' : 'body'}>
        <main className="grid-side" style={{ '--per-row': perRow } as CSSProperties}>
          {trouble && (
            <p className="note bad">
              {trouble}
              <button
                type="button"
                className="icon-only"
                title={words().models.understood}
                onClick={() => setTrouble(null)}
              >
                <X size={14} />
              </button>
            </p>
          )}

          {page === 'mine' && (
            <MyModels
              me={me}
              view={viewOfMe(me)}
              models={mine}
              loved={loved}
              loading={loadingMine}
              fresh={fresh}
              onOpen={show}
              onUpload={upload}
              onChanged={changed}
            />
          )}

          {page === 'catalogue' && broken && <p className="note bad">{words().models.broken(broken)}</p>}
          {page === 'catalogue' && !broken && !models && <p className="note">{words().models.loading}</p>}
          {page === 'catalogue' && models && models.length === 0 && (
            <div className="alone">
              <h2>{words().models.empty_title}</h2>
              <p>{words().models.empty_text}</p>
              <button type="button" className="chip go alone-go" onClick={upload}>
                {words().models.upload}
              </button>
            </div>
          )}

          <Settling on={page === 'catalogue' ? shown.map((model) => model.id).join() : 'mine'}>
            {page === 'catalogue' && shown.length > 0 && (
              <div className="grid">
                {shown.map((model, place) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    view={viewOfMe(me)}
                    liked={likes.has(model.id)}
                    rank={filters.sort === 'new' || filters.sort === 'name' ? undefined : place + 1}
                    onOpen={() => show(model.id)}
                  />
                ))}
              </div>
            )}
            {page === 'catalogue' && all.length > 0 && shown.length === 0 && (
              <p className="note">{words().models.nothing_found}</p>
            )}
          </Settling>

          {/* Under the cards and not under the whole width, so that the column the
              filters stand beside is as tall as everything there is to scroll past.
              A sticky panel can only hold while its own column has room left; with
              the footer outside, the column ended with the last card and the panel
              was carried off the top of the window by the last few hundred pixels. */}
          <Foot onNav={go} />
        </main>

        {page === 'catalogue' && (
          <ModelFilterPanel
            filters={filters}
            onChange={setFilters}
            models={all}
            found={shown.length}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>

      {panes.map((pane, layer) => {
        const list = listOf(pane.from);
        const at = list.findIndex((model) => model.id === pane.id);
        const summary =
          list[at] ?? all.find((model) => model.id === pane.id) ?? mine.find((model) => model.id === pane.id) ?? null;
        return (
          <ModelWindow
            key={pane.key}
            id={pane.id}
            summary={summary}
            me={me}
            top={layer === panes.length - 1}
            layer={layer}
            slot={pane.slot}
            onRaise={() => raise(pane.key)}
            onClose={() => close(pane.key)}
            onWalk={(by) => walk(pane.key, by)}
            where={{ at, of: list.length }}
            onChanged={changed}
            onOpenOther={(id) => swap(pane.key, id)}
            onHelp={() => openAt('/faq#open')}
          />
        );
      })}

      {putting && <ModelUpload onClose={() => setPutting(false)} onPut={changed} />}
    </div>
    </KnownTagsContext.Provider>
    </BackdropContext.Provider>
  );
}

/**
 * What the site is not, said where every page ends.
 *
 * Mojang's own wording in English, since the usage guidelines ask for that sentence
 * as it stands, and the same thing said again in the language on screen — the first
 * is there to satisfy the guidelines, the second to be understood.
 *
 * The rules, the data notice and the contacts hang here as well, because the foot of
 * the page is where a hand goes looking for them — and because two of the three have
 * to be reachable from everywhere on the site rather than from one page of their own.
 *
 * <h2>Why the counts are here and not over the catalogue</h2>
 *
 * How many models and how many people there are is a fact about the site, not a filter
 * on the grid: over the catalogue it would read as "this is what you are looking at",
 * which it is not — it counts the public models whatever each person has chosen to see.
 * In the foot it reads as what it is, next to who runs the place. It is also the one
 * spot that is already asking the server this question, so the line costs no request.
 */
function Foot({ onNav }: { onNav: (href: string) => void }) {
  const [counts, setCounts] = useState<SiteCounts | null>(null);

  useEffect(() => {
    void siteFacts().then((facts) => setCounts(facts?.counts ?? null));
  }, []);

  return (
    <footer className="site-foot">
      <nav className="foot-papers">
        {ALL_PAPERS.map((paper) => (
          <a
            key={paper}
            href={pathOfPaper(paper)}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.button !== 0) return;
              event.preventDefault();
              onNav(pathOfPaper(paper));
            }}
          >
            {titleOfPaper(paper)}
          </a>
        ))}
      </nav>
      {counts && (
        <p className="foot-counts">
          {words().foot.models(counts.models)} · {words().foot.authors(counts.authors)} ·{' '}
          {words().foot.people(counts.people)} · {words().foot.downloads(counts.downloads)}
        </p>
      )}
      <p>{words().foot.unofficial}</p>
      <p lang="en">NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.</p>
    </footer>
  );
}

/** Fades the grid out and back when the list under it changes, as on the skins page. */
function Settling({ on, children }: { on: string; children: ReactNode }) {
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
