import {
  ArrowLeft,
  ArrowRight,
  Bone,
  Boxes,
  CalendarClock,
  Camera,
  CircleHelp,
  Clapperboard,
  Download,
  EyeOff,
  Fingerprint,
  Flag,
  Globe,
  HardDrive,
  Heart,
  Image,
  ImageOff,
  Maximize2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Scale,
  Shapes,
  ShieldAlert,
  Tag,
  Trash2,
  VenetianMask,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { covered } from '../../shared/adult.js';
import { NotAModel, factsOf, parseProject, type Facts } from '../../shared/bbmodel.js';
import { LICENSE_LINKS, isLicense } from '../../shared/modelRules.js';
import type { ModelDetail, ModelSummary } from '../../shared/modelWire.js';
import { backdropOf, backed, useBackdrop } from '../lib/backdrop.js';
import { motionOf, type Motion } from '../lib/bbanim.js';
import { buildFigure, type Figure } from '../lib/bbmodel3d.js';
import { viewOfMe, type Me } from '../lib/me.js';
import { useMovable } from '../lib/movable.js';
import {
  changeModel,
  doubtModel,
  fileOf,
  hideModel,
  likeModel,
  markAdult,
  modelDetail,
  putPreview,
  sayWhy,
  settle,
} from '../lib/modelApi.js';
import { sizeOfFile } from '../lib/models.js';
import { formatName, licenseName } from '../lib/names.js';
import { fine, num } from '../lib/numbers.js';
import { renderPreview } from '../lib/preview.js';
import { ANGLED, type Look } from '../lib/view3d.js';
import { ago } from '../lib/when.js';
import { words } from '../lib/words.js';
import { ClipList, StageTabs, type StageTab } from './Clips.js';
import { Hint } from './Hint.js';
import { ModelDrop, ModelEdit, ModelPublish, ModelReport, ModelTakedown } from './ModelAsks.js';
import { ModelByline, pixels } from './ModelCard.js';
import { ModelStage } from './ModelStage.js';
import { Fact, Panel } from './Pane.js';
import { Talk, TalkHead } from './Talk.js';

/**
 * One model, opened.
 *
 * The skin window's frame, for the same reason: people look at a dozen models to
 * choose one, and a window keeps the grid where it was and closes in one key. It has
 * an address, so a link can be sent, and Back closes it.
 *
 * <h2>The file, not a picture of it</h2>
 *
 * What turns on the stage is the .bbmodel itself, read and drawn by this page with
 * Blockbench's own rules, so what is seen here is what Blockbench will show after
 * the download. Its animations play from the same file.
 *
 * <h2>Every page that opens a model checks it</h2>
 *
 * The uploader's page said what was inside and the server cannot open the file to
 * see. So each page that opens it counts again and says what it found, once, after
 * the model is on screen and the browser is idle. A file that does not match what was
 * claimed for it is put in front of whoever runs the site.
 */

/** Models this page has already counted, so walking back and forth checks each once. */
const doubted = new Set<string>();

/**
 * Models somebody has pressed "Показать" on, for as long as the page is open.
 *
 * Kept here rather than with the model, so that walking back to one already looked at
 * does not cover it again — and forgotten on reload, because the point of the cover is
 * the moment a window opens with somebody else watching.
 */
const revealed = new Set<string>();

type Asking = 'publish' | 'edit' | 'drop' | 'report' | 'takedown' | 'restore' | null;

interface Opened {
  figure: Figure;
  motion: Motion;
  facts: Facts;
}

export function ModelWindow({
  id,
  summary,
  me,
  onClose,
  onWalk,
  where,
  onChanged,
  onOpenOther,
  onHelp,
  top,
  layer,
  slot,
  onRaise,
}: {
  id: string;
  /** What the list already knows, so the window has a name before the server answers. */
  summary: ModelSummary | null;
  me: Me;
  onClose: () => void;
  /** Step through the list that is on screen. */
  onWalk: (by: 1 | -1) => void;
  /** Which of how many, in the list as it is filtered now. `at` below zero when it is not in it. */
  where: { at: number; of: number };
  /** Something about this model changed and the lists want asking again. */
  onChanged: () => void;
  onOpenOther: (id: string) => void;
  /** Goes to the answer about opening a model, on the page of questions. */
  onHelp: () => void;
  /** Whether this is the window in front, the one the keys belong to. */
  top: boolean;
  /** Its place in the stack of open windows, bottom first. */
  layer: number;
  /** How many windows were open when this one opened, for where it first stands. */
  slot: number;
  /** Bring it to the front. */
  onRaise: () => void;
}) {
  const { box, style: placed, grab } = useMovable(slot);
  const [detail, setDetail] = useState<ModelDetail | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  // Not readable as a model by the rules every upload passes, which is a different
  // thing from the 3D view failing on a model that is fine: only the first is reported.
  const [unreadable, setUnreadable] = useState(false);
  const [look, setLook] = useState<Look>(summary?.look ?? ANGLED);
  const [closer, setCloser] = useState(1);
  // Whether the person looking has turned the model themselves. The author's angle
  // arrives with the model, a moment after the window opens, and must not take the
  // view away from under somebody who has already started turning it.
  const byHand = useRef(false);
  const [clipAt, setClipAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [bare, setBare] = useState(() => revealed.has(id));
  // Counted by the talk panel itself, so writing one shows up in the heading over it
  // without asking the server for the whole model again.
  const [talked, setTalked] = useState<number | null>(null);

  useEffect(() => setBare(revealed.has(id)), [id]);

  // A new model comes back to the angle its card shows it at.
  useEffect(() => {
    byHand.current = false;
    setCloser(1);
    setSaid(null);
    setAsking(null);
    setTalked(null);
  }, [id]);

  useEffect(() => {
    let alive = true;
    setMissing(null);
    modelDetail(id).then(
      (got) => alive && setDetail(got),
      (why) => alive && setMissing(sayWhy(why)),
    );
    return () => {
      alive = false;
    };
  }, [id, fresh]);

  // A different id clears what was shown, but asking the server again after a change
  // must not blank the window while it answers.
  useEffect(() => setDetail(null), [id]);

  // Every model opens on itself; the list of what it can do is one press away.
  const [tab, setTab] = useState<StageTab>('look');
  useEffect(() => setTab('look'), [id]);

  useEffect(() => {
    let alive = true;
    let made: Figure | null = null;
    setOpened(null);
    setBroken(null);
    setUnreadable(false);
    (async () => {
      try {
        const answer = await fetch(fileOf(id, true), { credentials: 'same-origin' });
        if (!answer.ok) throw new Error(words().win.file_missing);
        const project = parseProject(await answer.text());
        const figure = await buildFigure(project);
        if (!alive) {
          figure.dispose();
          return;
        }
        made = figure;
        const motion = motionOf(project, figure);
        setOpened({ figure, motion, facts: factsOf(project) });
        setClipAt(motion.clips.length > 0 ? 0 : -1);
        setPlaying(motion.clips.length > 0);
      } catch (why) {
        if (!alive) return;
        setBroken(why instanceof Error ? why.message : sayWhy(why));
        if (why instanceof NotAModel) setUnreadable(true);
      }
    })();
    return () => {
      alive = false;
      made?.dispose();
    };
  }, [id]);

  // Counted once the model is up and the page has nothing better to do. Only when
  // signed in: the server takes this from nobody else.
  useEffect(() => {
    if (!me.signedIn || (!opened && !unreadable) || !detail || detail.mine || doubted.has(id)) return;
    doubted.add(id);
    const said = opened ? opened.facts : 'unreadable';
    const send = () => void doubtModel(id, said).catch(() => undefined);
    // Safari had no idle callback until recently; a timer does the same job less politely.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(send, { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(send, 1500);
    return () => window.clearTimeout(handle);
  }, [id, opened, unreadable, detail, me.signedIn]);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    // Several windows can be open; Escape and the arrows are the front one's.
    if (!top) return;
    const key = (event: KeyboardEvent) => {
      // A question open over the window has the keys to itself.
      if (asking) return;
      if (event.key === 'Escape') close();
      if (where.at >= 0 && where.of > 1) {
        if (event.key === 'ArrowRight') onWalk(1);
        if (event.key === 'ArrowLeft') onWalk(-1);
      }
    };
    // The page is not locked under the windows any more: they stand over it, and
    // the page is where the next model to open is found.
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [top, asking, close, onWalk, where.at, where.of]);

  const changed = () => {
    setFresh((n) => n + 1);
    onChanged();
  };

  const shown: ModelSummary | null = detail ?? summary;
  // The angle to show it from and to come back to: its author's, or the one every
  // model used before authors could choose.
  const home = shown?.look ?? ANGLED;
  useEffect(() => {
    if (!byHand.current) setLook(home);
  }, [home.spin, home.tilt]);
  const looking = useBackdrop();
  const behind = shown ? backdropOf(shown.background, looking) : looking.colour;
  const clips = opened?.motion.clips ?? [];
  const clip = clipAt >= 0 ? (clips[clipAt] ?? null) : null;
  const walkable = where.at >= 0 && where.of > 1;
  const signedIn = me.signedIn;
  const owned = detail?.mine ?? false;
  // Covered rather than withheld: at the blurred level the window is meant to open,
  // just not to put what is in it on a stream before its owner has said so.
  const veiled = !!shown && covered(shown, viewOfMe(me)) && !bare;

  async function act(what: string, run: () => Promise<unknown>) {
    setBusy(what);
    setSaid(null);
    try {
      await run();
    } catch (why) {
      setSaid(sayWhy(why));
    } finally {
      setBusy(null);
    }
  }

  return createPortal(
    // A layer the whole size of the screen that lets every press through except on
    // the window itself, so the catalogue behind stays usable.
    <div className="window-layer" style={{ zIndex: 70 + layer }}>
      <article
        ref={box}
        className={top ? 'window floating front' : 'window floating'}
        style={placed}
        role="dialog"
        aria-label={shown?.name ?? words().win.a_model}
        onMouseDown={onRaise}
      >
        <header className="window-top" onPointerDown={grab}>
          <Hint says={words().win.prev_hint}>
            <button
              type="button"
              className="icon-only"
              aria-label={words().win.prev}
              disabled={!walkable}
              onClick={() => onWalk(-1)}
            >
              <ArrowLeft size={16} />
            </button>
          </Hint>

          <div className="window-said">
            <h2>{shown?.name ?? (missing ? words().win.not_opened : words().win.opening)}</h2>
            {shown && <ModelByline model={shown} />}
          </div>

          {walkable && (
            <span className="window-count">
              {words().win.at_of(where.at + 1, where.of)}
            </span>
          )}

          <Hint says={words().win.next_hint}>
            <button
              type="button"
              className="icon-only"
              aria-label={words().win.next}
              disabled={!walkable}
              onClick={() => onWalk(1)}
            >
              <ArrowRight size={16} />
            </button>
          </Hint>
          {/* Where "Как открыть" went: the answer is on the page of questions, not
              repeated under every model. */}
          <Hint says={words().win.help_hint}>
            <button type="button" className="icon-only" aria-label={words().papers.faq_title} onClick={onHelp}>
              <CircleHelp size={16} />
            </button>
          </Hint>
          <Hint says={words().win.close_hint}>
            <button type="button" className="icon-only" aria-label={words().win.close} onClick={close}>
              <X size={16} />
            </button>
          </Hint>
        </header>

        {missing && !shown ? (
          <p className="window-missing">{missing}</p>
        ) : (
          <div className="window-body">
            <section className="window-stage">
              <StageTabs
                tab={tab}
                onTab={setTab}
                count={opened ? clips.length : (shown?.animations ?? 0)}
                reading={!opened}
              />
              <div className="stage-wrap">
                {opened ? (
                  <ModelStage
                    figure={opened.figure}
                    motion={opened.motion}
                    clip={clip}
                    playing={playing}
                    look={look}
                    onLook={(next) => {
                      byHand.current = true;
                      setLook(next);
                    }}
                    closer={closer}
                    onCloser={setCloser}
                    home={home}
                    backdrop={behind}
                  />
                ) : (
                  <div className={`stage-box model-box${backed(behind).className}`} style={backed(behind).style}>
                    <p className="stage-wait">{broken ? words().win.not_opened_why(broken) : words().win.opening_file}</p>
                  </div>
                )}
                {veiled && (
                  <div className="stage-cover">
                    <p>{words().win.adult_cover}</p>
                    <button
                      type="button"
                      className="chip go"
                      onClick={() => {
                        revealed.add(id);
                        setBare(true);
                      }}
                    >
                      {words().win.show}
                    </button>
                  </div>
                )}
              </div>

              <div className="stage-tools">
                {clips.length > 0 && (
                  <>
                    <Hint says={playing ? words().win.stop : words().win.play}>
                      <button
                        type="button"
                        className={playing ? 'chip on' : 'chip'}
                        aria-label={playing ? words().win.stop : words().win.play}
                        disabled={!clip}
                        onClick={() => setPlaying(!playing)}
                      >
                        {playing ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                    </Hint>
                    {/* Which one is playing, said beside the button that stops it; the
                        choosing is done in the tab, where all of them can be seen. */}
                    <button type="button" className="chip clip-now" onClick={() => setTab('clips')}>
                      {clip ? clip.name : words().win.no_clip}
                    </button>
                  </>
                )}
                <Hint says={words().win.reset_hint}>
                  <button
                    type="button"
                    className="chip"
                    aria-label={words().win.reset}
                    disabled={turned(look, home) < 0.001 && Math.abs(closer - 1) < 0.001}
                    onClick={() => {
                      setLook(home);
                      setCloser(1);
                    }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </Hint>
                <Hint says={words().win.download_hint}>
                  <a className="chip go" href={fileOf(id)} download aria-label={words().win.download}>
                    <Download size={16} />
                  </a>
                </Hint>

                {signedIn && detail && detail.published && (
                  <Hint says={detail.liked ? words().win.unlike : words().win.like_hint}>
                    <button
                      type="button"
                      className={detail.liked ? 'chip on' : 'chip'}
                      aria-label={detail.liked ? words().win.unlike : words().win.like}
                      disabled={busy === 'like'}
                      onClick={() =>
                        act('like', async () => {
                          const answer = await likeModel(id, !detail.liked);
                          setDetail({ ...detail, likes: answer.likes, liked: answer.liked });
                          onChanged();
                        })
                      }
                    >
                      <Heart size={16} />
                    </button>
                  </Hint>
                )}

                {/*
                 * Only on your own, and never as a side effect of anything else:
                 * publishing is the moment a claim is made about whose model this is.
                 */}
                {/*
                 * Taken down is not a switch the owner holds. Offering to publish or to
                 * withdraw it again would promise what the Worker then refuses.
                 */}
                {owned && detail?.hidden && (
                  <Hint says={words().win.taken_down_hint}>
                    <button type="button" className="chip bad" aria-disabled="true" aria-label={words().win.taken_down}>
                      <EyeOff size={16} />
                    </button>
                  </Hint>
                )}
                {owned && detail && !detail.hidden && detail.visibility === 'private' && (
                  <Hint says={words().win.publish_hint}>
                    <button
                      type="button"
                      className="chip"
                      aria-label={words().win.publish}
                      onClick={() => setAsking('publish')}
                    >
                      <Globe size={16} />
                    </button>
                  </Hint>
                )}
                {owned && detail && !detail.hidden && detail.visibility === 'public' && (
                  <Hint says={words().win.hide_hint}>
                    <button
                      type="button"
                      className="chip on"
                      aria-label={words().win.hide}
                      disabled={busy === 'hide'}
                      onClick={() => act('hide', async () => {
                        await hideModel(id);
                        changed();
                      })}
                    >
                      <EyeOff size={16} />
                    </button>
                  </Hint>
                )}
                {owned && (
                  <Hint says={words().win.edit_hint}>
                    <button type="button" className="chip" aria-label={words().win.edit} onClick={() => setAsking('edit')}>
                      <Pencil size={16} />
                    </button>
                  </Hint>
                )}
                {/*
                 * One press for both, because they are one thing: the angle a model is
                 * shown from and the picture on its card are the same choice, and a
                 * card drawn from one side with the window opening on another is the
                 * fault this button exists to fix.
                 */}
                {owned && opened && (
                  <Hint says={words().win.look_hint}>
                    <button
                      type="button"
                      className="chip"
                      aria-label={words().win.look}
                      disabled={busy === 'picture'}
                      onClick={() =>
                        act('picture', async () => {
                          const picture = await renderPreview(opened.figure, look);
                          if (!picture) throw new Error(words().win.picture_failed);
                          await putPreview(id, picture);
                          // Null for the angle everything used before, so a model shown
                          // from the usual side is not carrying a copy of it.
                          await changeModel(id, { look: turned(look, ANGLED) < 0.001 ? null : look });
                          changed();
                        })
                      }
                    >
                      <Camera size={16} />
                    </button>
                  </Hint>
                )}
                {owned && (
                  <Hint says={words().win.drop_hint}>
                    <button type="button" className="chip" aria-label={words().win.drop} onClick={() => setAsking('drop')}>
                      <Trash2 size={16} />
                    </button>
                  </Hint>
                )}
                {signedIn && detail && !owned && (
                  <Hint says={words().win.report}>
                    <button type="button" className="chip" aria-label={words().win.report} onClick={() => setAsking('report')}>
                      <Flag size={16} />
                    </button>
                  </Hint>
                )}
              </div>
              {tab === 'clips' && clips.length > 0 && (
                <ClipList clips={clips} at={clipAt} playing={playing} onPick={setClipAt} onPlay={setPlaying} />
              )}
              {said ? (
                <p className="stage-hint bad">{said}</p>
              ) : (
                <p className="stage-hint">{words().win.drag_hint}</p>
              )}
            </section>

            <section className="window-side">
              {detail?.description && (
                <Panel title={words().win.description}>
                  <p className="model-said">{detail.description}</p>
                </Panel>
              )}

              <Panel title={words().win.tags}>
                {(shown?.tags.length ?? 0) === 0 && <p className="empty">{words().win.no_tags}</p>}
                <div className="tag-row">
                  {shown?.tags.map((tag) => (
                    <span key={tag} className="tag">
                      <Tag size={11} />
                      {tag}
                    </span>
                  ))}
                </div>
              </Panel>

              {shown && (
                <Panel title={words().win.about}>
                  <dl className="facts">
                    <Fact icon={<Shapes size={13} />} says={words().win.fact_format}>
                      {formatName(shown.format)}
                    </Fact>
                    <Fact
                      icon={<Boxes size={13} />}
                      says={shown.boxUv ? words().win.fact_box_uv : words().win.fact_face_uv}
                    >
                      {words().win.cubes(shown.cubes)}
                      {shown.meshes > 0 && <span className="fact-tail">{words().win.meshes(shown.meshes)}</span>}
                    </Fact>
                    {shown.bones > 0 && (
                      <Fact icon={<Bone size={13} />} says={words().win.fact_bones}>
                        {words().win.bones(shown.bones)}
                      </Fact>
                    )}
                    {shown.animations > 0 && (
                      <Fact icon={<Clapperboard size={13} />} says={words().win.fact_clips}>
                        {words().win.clips(shown.animations)}
                      </Fact>
                    )}
                    <Fact
                      icon={<Image size={13} />}
                      says={
                        shown.textureWidth
                          ? words().win.fact_texture(shown.textureWidth, shown.textureHeight)
                          : words().win.fact_no_textures
                      }
                    >
                      {shown.textures > 0 ? words().win.textures(shown.textures) : words().win.no_textures}
                      {shown.textureWidth > 0 && (
                        <span className="fact-tail">
                          {shown.textureWidth}×{shown.textureHeight}
                        </span>
                      )}
                    </Fact>
                    {opened && opened.facts.embedded < opened.facts.textures && (
                      <Fact
                        icon={<ImageOff size={13} />}
                        says={words().win.fact_not_embedded}
                      >
                        <span className="warn">
                          {words().win.not_embedded(opened.facts.textures - opened.facts.embedded)}
                        </span>
                      </Fact>
                    )}
                    {shown.density > 1 && (
                      <Fact
                        icon={<Maximize2 size={13} />}
                        says={words().win.fact_hd(pixels(shown.density))}
                      >
                        HD<span className="fact-tail">×{fine(shown.density)}</span>
                      </Fact>
                    )}
                    {/*
                     * A mask rather than a crossed-out eye: in this same window the
                     * crossed-out eye is "taken off the catalogue", and one drawing
                     * cannot mean two things a screen apart.
                     */}
                    {shown.adult && (
                      <Fact
                        icon={<VenetianMask size={13} />}
                        says={words().win.fact_adult}
                      >
                        <span className="warn">18+</span>
                      </Fact>
                    )}
                    <Fact icon={<Download size={13} />} says={words().win.fact_downloads}>
                      {num(shown.downloads)}
                    </Fact>
                    <Fact icon={<Heart size={13} />} says={words().win.fact_likes}>
                      {num(shown.likes)}
                    </Fact>
                    <Fact
                      icon={<CalendarClock size={13} />}
                      says={shown.published ? words().win.fact_published : words().win.fact_created}
                    >
                      {ago(shown.published ?? shown.created)}
                    </Fact>
                    <Fact icon={<HardDrive size={13} />} says={words().win.fact_bytes}>
                      {sizeOfFile(shown.bytes)}
                    </Fact>
                    {shown.license && isLicense(shown.license) && (
                      <Fact icon={<Scale size={13} />} says={words().win.fact_license}>
                        {LICENSE_LINKS[shown.license] ? (
                          <a href={LICENSE_LINKS[shown.license]} target="_blank" rel="noreferrer noopener">
                            {licenseName(shown.license)}
                          </a>
                        ) : (
                          licenseName(shown.license)
                        )}
                      </Fact>
                    )}
                    {detail && (
                      <Fact
                        icon={<Fingerprint size={13} />}
                        says={words().win.fact_print}
                      >
                        <code>{detail.print.slice(0, 12)}</code>
                        <span className="fact-tail">{shown.version}</span>
                      </Fact>
                    )}
                  </dl>
                </Panel>
              )}

              {/*
               * Only under a model the catalogue has: a model nobody but its owner can
               * see has nobody to talk to, and an empty comment field under one reads
               * as an invitation to talk to oneself.
               */}
              {detail?.published && (
                <Panel title={words().win.talk} aside={<TalkHead count={talked ?? shown?.comments ?? 0} />}>
                  <Talk id={id} me={me} onChanged={onChanged} onCount={setTalked} />
                </Panel>
              )}

              {detail?.admin && (
                <Panel title={words().win.check}>
                  <dl className="facts">
                    {detail.doubted && (
                      <Fact
                        icon={<ShieldAlert size={13} />}
                        says={words().win.doubt_hint}
                      >
                        <span className="warn">{words().win.doubted}</span>
                      </Fact>
                    )}
                    <Fact icon={<Flag size={13} />} says={words().win.reports_hint}>
                      {words().win.reports(detail.reports ?? 0)}
                    </Fact>
                  </dl>
                  <div className="check-tools">
                    {(detail.doubted || (detail.reports ?? 0) > 0) && (
                      <Hint says={words().win.settle_hint}>
                        <button
                          type="button"
                          className="chip"
                          disabled={busy === 'settle'}
                          onClick={() =>
                            act('settle', async () => {
                              await settle(id);
                              changed();
                            })
                          }
                        >
                          {words().win.settle}
                        </button>
                      </Hint>
                    )}
                    <Hint
                      says={
                        detail.adult
                          ? words().win.unmark_hint
                          : words().win.mark_hint
                      }
                    >
                      <button
                        type="button"
                        className={detail.adult ? 'chip on' : 'chip'}
                        disabled={busy === 'adult'}
                        onClick={() =>
                          act('adult', async () => {
                            await markAdult(id, !detail.adult);
                            changed();
                          })
                        }
                      >
                        {detail.adult ? words().win.unmark : words().win.mark}
                      </button>
                    </Hint>
                    <button
                      type="button"
                      className={detail.hidden ? 'chip go' : 'chip bad'}
                      onClick={() => setAsking(detail.hidden ? 'restore' : 'takedown')}
                    >
                      {detail.hidden ? words().win.restore : words().win.takedown}
                    </button>
                  </div>
                </Panel>
              )}
            </section>
          </div>
        )}
      </article>

      {detail && asking === 'publish' && (
        <ModelPublish
          model={detail}
          me={me}
          onClose={() => setAsking(null)}
          onDone={changed}
          onOpenOther={onOpenOther}
        />
      )}
      {detail && asking === 'edit' && (
        <ModelEdit model={detail} me={me} onClose={() => setAsking(null)} onDone={changed} />
      )}
      {detail && asking === 'drop' && (
        <ModelDrop
          model={detail}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            onChanged();
            close();
          }}
        />
      )}
      {detail && asking === 'report' && <ModelReport model={detail} onClose={() => setAsking(null)} />}
      {detail && (asking === 'takedown' || asking === 'restore') && (
        <ModelTakedown model={detail} down={asking === 'takedown'} onClose={() => setAsking(null)} onDone={changed} />
      )}
    </div>,
    document.body,
  );
}

/** How far from where it started, so the button that puts it back can go grey. */
function turned(look: Look, home: Look): number {
  return Math.abs(look.spin - home.spin) + Math.abs(look.tilt - home.tilt);
}
