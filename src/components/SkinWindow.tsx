import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Download,
  EyeOff,
  Fingerprint,
  Globe,
  Heart,
  Maximize2,
  Pause,
  PersonStanding,
  Play,
  RotateCcw,
  Ruler,
  Tag,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { hideSkin, type Mine } from '../lib/api.js';
import { useArms } from '../lib/arms.js';
import { HD_FROM, type Skin } from '../lib/catalogue.js';
import { ANGLED, type Look } from '../lib/figure.js';
import { ago } from '../lib/when.js';
import { Byline } from './Byline.js';
import { FaceMarks } from './FaceMarks.js';
import { Hint } from './Hint.js';
import { Fact, Panel } from './Pane.js';
import { Publish } from './Publish.js';
import { SkinStage } from './SkinStage.js';

/**
 * One skin, opened.
 *
 * <h2>Why a window over the grid rather than a page of its own</h2>
 *
 * Because of what people do here: they look at eleven skins to choose one. A page
 * means a load, a scroll position lost and a press of Back for each of those
 * eleven; a window keeps the grid exactly where it was and closes in one key. The
 * reference uses a page and arrows to walk between skins — the arrows are the good
 * part and they are kept, but here they walk the list you have already filtered,
 * which is the list you actually meant.
 *
 * It still has an address of its own, so a link can be sent to somebody, and Back
 * still closes it. Those two are what people actually lose with windows, and both
 * are one line each.
 *
 * <h2>What is here that a skin site does not have</h2>
 *
 * The face, close up, with the marking on it. Everything else on this panel — name,
 * author, tags, size, stars — every catalogue has. The marking is the thing this
 * one is for.
 */
export function SkinWindow({
  skin,
  onClose,
  onWalk,
  where,
  onChanged,
  onOpenOther,
}: {
  skin: Mine | Skin;
  onClose: () => void;
  /** Step through the list that is on screen. Nothing when there is nowhere to go. */
  onWalk: (by: 1 | -1) => void;
  /** Which of how many, in the list as it is filtered now. */
  where: { at: number; of: number };
  /** Something about this skin changed and the lists want asking again. */
  onChanged?: () => void;
  onOpenOther?: (id: string) => void;
}) {
  const owned = 'mine' in skin && skin.mine;
  const [asking, setAsking] = useState(false);
  const [look, setLook] = useState<Look>(ANGLED);
  const [closer, setCloser] = useState(1);
  // Which of the two models, read out of the picture. Wide until it is known.
  const arms = useArms(skin.url) ?? 'wide';
  /**
   * Walking, for this one figure and not for the grid behind it.
   *
   * Its own state on purpose: the switch here is on the skin being looked at, and
   * sharing it with the header set thirty figures walking behind a window nobody
   * could see them through.
   */
  const [moving, setMoving] = useState(false);

  // A new skin comes back to the angle it is meant to be seen at. Carrying the
  // last one's rotation over means the next skin opens showing its back.
  useEffect(() => {
    setLook(ANGLED);
    setCloser(1);
  }, [skin.id]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onWalk(1);
      if (event.key === 'ArrowLeft') onWalk(-1);
    };
    document.addEventListener('keydown', key);
    // Nothing behind scrolls while this is open: a window that scrolls the page
    // under it is one that loses the place it was opened from.
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = was;
    };
  }, [onClose, onWalk]);

  return createPortal(
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="window" role="dialog" aria-label={skin.name}>
        <header className="window-top">
          <Hint says="предыдущий  (←)">
            <button type="button" className="icon-only" aria-label="предыдущий" onClick={() => onWalk(-1)}>
              <ArrowLeft size={16} />
            </button>
          </Hint>

          <div className="window-said">
            <h2>{skin.name}</h2>
            <Byline uploader={skin.uploader} author={skin.author} />
          </div>

          <span className="window-count">
            {where.at + 1} из {where.of}
          </span>

          <Hint says="следующий  (→)">
            <button type="button" className="icon-only" aria-label="следующий" onClick={() => onWalk(1)}>
              <ArrowRight size={16} />
            </button>
          </Hint>
          <Hint says="закрыть  (Esc)">
            <button type="button" className="icon-only" aria-label="закрыть" onClick={onClose}>
              <X size={16} />
            </button>
          </Hint>
        </header>

        <div className="window-body">
          <section className="window-stage">
            <SkinStage
              url={skin.url}
              layout={skin.layout}
              moving={moving}
              look={look}
              onLook={setLook}
              closer={closer}
              onCloser={setCloser}
            />
            <div className="stage-tools">
              <Hint says={moving ? 'остановить' : 'пусть идёт'}>
                <button
                  type="button"
                  className={moving ? 'chip on' : 'chip'}
                  aria-label={moving ? 'остановить' : 'пусть идёт'}
                  onClick={() => setMoving(!moving)}
                >
                  {moving ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </Hint>
              <Hint says="как было  (или двойной щелчок)">
                <button
                  type="button"
                  className="chip"
                  aria-label="как было"
                  disabled={turned(look) < 0.001 && Math.abs(closer - 1) < 0.001}
                  onClick={() => {
                    setLook(ANGLED);
                    setCloser(1);
                  }}
                >
                  <RotateCcw size={16} />
                </button>
              </Hint>
              <Hint says="скачать картинку скина">
                <a
                  className="chip go"
                  href={skin.url}
                  download={`${skin.name}.png`}
                  aria-label="скачать"
                >
                  <Download size={16} />
                </a>
              </Hint>

              {/*
               * Only on your own, and never as a side effect of anything else.
               * Publishing is the moment a claim is made about who drew this,
               * and a claim made by accident is the whole problem.
               */}
              {owned && !(skin as Mine).published && (
                <Hint says="показать всем — спросит, откуда этот скин">
                  <button
                    type="button"
                    className="chip"
                    aria-label="опубликовать"
                    onClick={() => setAsking(true)}
                  >
                    <Globe size={16} />
                  </button>
                </Hint>
              )}
              {owned && (skin as Mine).published && (
                <Hint says="убрать с витрины — можно в любой момент">
                  <button
                    type="button"
                    className="chip on"
                    aria-label="убрать с витрины"
                    onClick={async () => {
                      await hideSkin(skin.id);
                      onChanged?.();
                    }}
                  >
                    <EyeOff size={16} />
                  </button>
                </Hint>
              )}
            </div>
            <p className="stage-hint">тяни, чтобы повернуть; колесо — ближе и дальше</p>
          </section>

          <section className="window-side">
            <Panel title="лицо">
              <FaceMarks
                url={skin.url}
                layout={skin.layout}
                mask={skin.mask}
                hasOverlay={skin.hasOverlay}
              />
            </Panel>

            <Panel title="метки">
              {skin.tags.length === 0 && <p className="empty">меток пока нет</p>}
              <div className="tag-row">
                {skin.tags.map((tag) => (
                  <span key={tag} className="tag">
                    <Tag size={11} />
                    {tag}
                  </span>
                ))}
              </div>
            </Panel>

            <Panel title="о скине">
              <dl className="facts">
                <Fact icon={<Ruler size={13} />} says="ширина картинки в пикселях">
                  {skin.width}
                  {skin.width >= HD_FROM && <span className="fact-tail">HD</span>}
                  {skin.layout === 32 && <span className="old">32</span>}
                </Fact>
                <Fact
                  icon={<PersonStanding size={13} />}
                  says={
                    arms === 'slim'
                      ? 'Модель Alex: руки в три пикселя. Определено по самой картинке — у широкой модели эти столбцы заняты, у тонкой их нет.'
                      : 'Модель Steve: руки в четыре пикселя, как в игре с самого начала.'
                  }
                >
                  {arms === 'slim' ? 'Alex' : 'Steve'}
                  <span className="fact-tail">{arms === 'slim' ? '3 пикселя' : '4 пикселя'}</span>
                </Fact>
                <Fact icon={<Heart size={13} />} says="скольким людям он нравится">
                  {skin.stars.toLocaleString('ru')}
                </Fact>
                <Fact icon={<CalendarClock size={13} />} says="когда появился в каталоге">
                  {ago(skin.uploaded)}
                </Fact>
                <Fact
                  icon={<Fingerprint size={13} />}
                  says="отпечаток файла — по нему мод узнаёт этот же скин у себя"
                >
                  <code>{skin.fingerprint.slice(0, 12)}</code>
                </Fact>
                {skin.layout === 32 && (
                  <Fact icon={<Maximize2 size={13} />} says="раскладка до версии 1.8: без второй руки, ноги и куртки">
                    старая раскладка
                  </Fact>
                )}
              </dl>
            </Panel>
          </section>
        </div>
      </article>

      {asking && (
        <Publish
          skin={skin}
          onClose={() => setAsking(false)}
          onDone={() => onChanged?.()}
          onOpenOther={(id) => onOpenOther?.(id)}
        />
      )}
    </div>,
    document.body,
  );
}

/** How far from where it started, so the button that puts it back can go grey. */
function turned(look: Look): number {
  return Math.abs(look.spin - ANGLED.spin) + Math.abs(look.tilt - ANGLED.tilt);
}
