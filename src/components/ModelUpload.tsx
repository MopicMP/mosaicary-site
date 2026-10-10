import {
  Box,
  Check,
  CopyCheck,
  FileWarning,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Upload as UploadMark,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { NotAModel, prepare, type Prepared } from '../../shared/bbmodel.js';
import {
  DESCRIPTION_MAX,
  LICENSES,
  MODEL_MAX_BYTES,
  NAME_MAX,
  cleanName,
  type License,
} from '../../shared/modelRules.js';
import { motionOf, type Motion } from '../lib/bbanim.js';
import { buildFigure, type Figure } from '../lib/bbmodel3d.js';
import { sayWhy, sendModel } from '../lib/modelApi.js';
import { useMovable } from '../lib/movable.js';
import { licenseName } from '../lib/names.js';
import { renderPreview } from '../lib/preview.js';
import { ANGLED, type Look } from '../lib/view3d.js';
import { plural } from '../lib/when.js';
import { ColourRow } from './Backdrop.js';
import { ClipList, StageTabs, type StageTab } from './Clips.js';
import { Dropdown } from './Dropdown.js';
import { Hint } from './Hint.js';
import { ModelStage } from './ModelStage.js';
import { TagPick } from './TagPick.js';

/**
 * Putting models in, several at a time, each one said about properly.
 *
 * <h2>A list, a look, and the fields</h2>
 *
 * What anybody has is a folder of models made over months, so the window still takes
 * thirty files at once. But a batch with one line of tags for all of it said nothing
 * about any one model: no description, no licence, no way to see the thing before it
 * went up. Now the files are a list on the left; the one chosen is shown in the middle,
 * turned and played, with its animations a tab away; its fields are on the right.
 * Anything said about one model can be given to all of them with the button beside it,
 * which is what the single line of tags was good for.
 *
 * <h2>Where it is left turned is where it will be shown from</h2>
 *
 * Every card used to be drawn from one angle, which is the front of an entity in the
 * editor and the back of plenty of models made in it. So the angle the author leaves
 * the model at here is the model's own: the card picture is taken again from it a
 * moment after the turning stops, and whoever opens the model later opens it there.
 *
 * <h2>Read here, before anything is sent</h2>
 *
 * The server never opens a .bbmodel. This page reads each file, takes out the paths
 * to the uploader's own disk, counts what is inside, draws the picture for its card,
 * and only then sends it. So a file that is not a model is turned away on the spot,
 * with the reason, and nothing about it leaves the computer.
 *
 * Files are read one after another, not all together: each picture needs a WebGL
 * context of its own for a moment, and a browser asked for thirty at once starts
 * throwing the oldest away. Only the chosen model is kept drawn; the rest are rows.
 */

type State = 'reading' | 'waiting' | 'sending' | 'done' | 'same' | 'refused';

/** What is said about a model before it goes up, and what "Ко всем" copies. */
interface About {
  description: string;
  tags: string[];
  license: License | null;
  background: string | null;
  /** The angle the author left it at, or null for the one every model used before. */
  look: Look | null;
}

type Field = keyof About;

interface Row extends About {
  key: number;
  file: File;
  name: string;
  state: State;
  said?: string;
  ready?: Prepared;
  preview?: Blob | null;
  /** The card picture, for this list only. */
  picture?: string;
  /**
   * The angle the picture it has was taken from, which is how the list knows a
   * picture has fallen behind the model it belongs to.
   */
  shotAt?: Look | null;
}

let rowKey = 0;

const BLANK: About = { description: '', tags: [], license: null, background: null, look: null };

export function ModelUpload({ onClose, onPut }: { onClose: () => void; onPut: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // Files waiting to be read, in the order they were given.
  const queue = useRef<Row[]>([]);
  const reading = useRef(false);
  const shooting = useRef(false);
  const alive = useRef(true);
  const pictures = useRef(new Set<string>());
  // The list as it is now, for the picture-taking loop: it waits on a browser between
  // models, and by then whatever it closed over has moved on.
  const rowsNow = useRef<Row[]>(rows);
  rowsNow.current = rows;
  // Moved and sized like every other window; still one at a time, over a veil,
  // because an upload is a task to finish rather than a thing to look at beside others.
  const { box, style: placed, grab } = useMovable(0);

  useEffect(() => {
    alive.current = true;
    const kept = pictures.current;
    return () => {
      alive.current = false;
      // Let go of them, or a batch of thirty holds thirty pictures for as long as
      // the tab is open.
      for (const url of kept) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', key);
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = was;
    };
  }, [onClose, busy]);

  const change = (key: number, to: Partial<Row>) =>
    setRows((was) => was.map((one) => (one.key === key ? { ...one, ...to } : one)));

  /** One field, given to every model still in the list and not yet sent. */
  const toAll = <F extends Field>(field: F, value: About[F]) =>
    setRows((was) =>
      was.map((one) => (one.state === 'waiting' || one.state === 'reading' ? { ...one, [field]: value } : one)),
    );

  async function readAll() {
    if (reading.current) return;
    reading.current = true;
    while (queue.current.length > 0 && alive.current) {
      const row = queue.current.shift()!;
      const done = await readOne(row.file);
      if (!alive.current) {
        if (done.picture) URL.revokeObjectURL(done.picture);
        break;
      }
      if (done.picture) pictures.current.add(done.picture);
      change(row.key, done);
    }
    reading.current = false;
  }

  /** Models whose picture is from an angle they are no longer turned to. */
  const behind = rows.filter((one) => one.ready && one.state === 'waiting' && !sameLook(one.shotAt, one.look));

  // Taken a moment after the turning stops rather than during it: a picture needs a
  // WebGL context of its own, and a drag would ask for one sixty times a second.
  useEffect(() => {
    if (behind.length === 0) return;
    const keys = behind.map((one) => one.key);
    const wait = window.setTimeout(() => void shootAll(keys), 400);
    return () => window.clearTimeout(wait);
  }, [rows]);

  async function shootAll(keys: number[]) {
    if (shooting.current) return;
    shooting.current = true;
    for (const key of keys) {
      if (!alive.current) break;
      const row = rowsNow.current.find((one) => one.key === key);
      if (!row?.ready || row.state !== 'waiting') continue;
      const look = row.look;
      const taken = await shoot(row.ready, look ?? ANGLED);
      if (!alive.current) {
        if (taken) URL.revokeObjectURL(taken.picture);
        break;
      }
      // A model the browser cannot draw keeps the picture it has: a card with an old
      // angle on it is better than a card with nothing.
      if (!taken) {
        change(key, { shotAt: look });
        continue;
      }
      const was = rowsNow.current.find((one) => one.key === key)?.picture;
      if (was) {
        URL.revokeObjectURL(was);
        pictures.current.delete(was);
      }
      pictures.current.add(taken.picture);
      change(key, { shotAt: look, preview: taken.preview, picture: taken.picture });
    }
    shooting.current = false;
  }

  function take(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fresh: Row[] = Array.from(files).map((file) => ({
      key: ++rowKey,
      file,
      name: nameFromFile(file.name),
      state: 'reading',
      ...BLANK,
    }));
    // Added to what is already there: choosing twice is how anybody assembles a
    // batch out of two folders.
    setRows((was) => [...was, ...fresh]);
    setChosen((was) => was ?? fresh[0]!.key);
    queue.current.push(...fresh);
    void readAll();
  }

  function drop(row: Row) {
    queue.current = queue.current.filter((one) => one.key !== row.key);
    if (row.picture) {
      URL.revokeObjectURL(row.picture);
      pictures.current.delete(row.picture);
    }
    // The next one along takes its place, so the right side never goes blank while
    // there is still something to look at.
    if (chosen === row.key) {
      const at = rows.findIndex((one) => one.key === row.key);
      const left = rows.filter((one) => one.key !== row.key);
      setChosen((left[at] ?? left[at - 1])?.key ?? null);
    }
    setRows((was) => was.filter((one) => one.key !== row.key));
  }

  async function send() {
    setBusy(true);
    for (const row of rows) {
      if (row.state !== 'waiting' || !row.ready) continue;
      change(row.key, { state: 'sending' });
      try {
        const answer = await sendModel(
          row.ready,
          {
            name: cleanName(row.name) || nameFromFile(row.file.name),
            description: row.description,
            tags: row.tags,
            license: row.license,
            background: row.background,
            // Turned back to where it started counts as no angle at all, so a model
            // shown from the usual side is not carrying a copy of it.
            look: sameLook(row.look, null) ? null : row.look,
          },
          row.preview ?? null,
        );
        // The parsed project is let go once it is up: thirty of them is a lot of memory.
        change(row.key, { state: answer.already ? 'same' : 'done', ready: undefined });
      } catch (why) {
        change(row.key, { state: 'refused', said: sayWhy(why) });
      }
    }
    setBusy(false);
    onPut();
  }

  const stillReading = rows.some((row) => row.state === 'reading');
  const waiting = rows.filter((row) => row.state === 'waiting').length;
  const done = rows.filter((row) => row.state === 'done' || row.state === 'same').length;
  const row = rows.find((one) => one.key === chosen) ?? null;

  const dropping = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: (event: DragEvent) => {
      // Only when leaving the window, not when crossing from one child to another.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      take(event.dataTransfer.files);
    },
  };

  const choose = (
    <input
      ref={picker}
      type="file"
      accept=".bbmodel"
      multiple
      hidden
      onChange={(event) => {
        take(event.target.files);
        // Emptied, or choosing the same file twice does nothing at all.
        event.target.value = '';
      }}
    />
  );

  return createPortal(
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <article
        ref={box}
        style={placed}
        className={rows.length > 0 ? 'window put wide floating' : 'window put floating'}
        role="dialog"
        aria-label="Загрузить модели"
        {...dropping}
      >
        <header className="window-top" onPointerDown={grab}>
          <div className="window-said">
            <h2>Загрузить модели</h2>
          </div>
          <Hint says="Закрыть (Esc)">
            <button type="button" className="icon-only" aria-label="Закрыть" disabled={busy} onClick={onClose}>
              <X size={16} />
            </button>
          </Hint>
        </header>

        {rows.length === 0 ? (
          <div className="put-body">
            <div className={dragging ? 'drop-here over' : 'drop-here'} onClick={() => picker.current?.click()}>
              <UploadMark size={20} />
              <span>Перетащи сюда файлы или нажми, чтобы выбрать</span>
              <small>Проекты Blockbench .bbmodel, до {Math.round(MODEL_MAX_BYTES / 1024 / 1024)} МБ</small>
              <small>Модели видны только тебе, пока ты их не опубликуешь</small>
              {choose}
            </div>
          </div>
        ) : (
          <div className={dragging ? 'put-grid over' : 'put-grid'}>
            <aside className="put-list">
              <button type="button" className="chip put-more" disabled={busy} onClick={() => picker.current?.click()}>
                <Plus size={14} />
                Добавить файлы
              </button>
              {choose}
              <div className="put-rows">
                {rows.map((one) => (
                  <div
                    key={one.key}
                    className={`put-row ${one.state}${one.key === chosen ? ' chosen' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setChosen(one.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setChosen(one.key);
                      }
                    }}
                  >
                    <div className="put-face">
                      {one.state === 'refused' && !one.picture ? (
                        <FileWarning size={18} />
                      ) : one.picture ? (
                        <img src={one.picture} alt="" />
                      ) : one.state === 'reading' ? (
                        <Loader2 size={16} className="spin" />
                      ) : (
                        <Box size={18} />
                      )}
                    </div>
                    <span className="put-name">{one.name}</span>
                    <span className="put-state">
                      {one.state === 'waiting' && one.ready && <Warnings ready={one.ready} />}
                      {one.state === 'sending' && <Loader2 size={14} className="spin" />}
                      {one.state === 'done' && <Check size={14} />}
                      {one.state === 'same' && (
                        <Hint says="Уже загружена">
                          <span className="put-said">
                            <Check size={14} />
                          </span>
                        </Hint>
                      )}
                      {one.state === 'refused' && (
                        <Hint says={one.said ?? 'Не загрузилась'}>
                          <span className="put-said bad">
                            <FileWarning size={14} />
                          </span>
                        </Hint>
                      )}
                    </span>
                    {(one.state === 'waiting' || one.state === 'reading' || one.state === 'refused') && !busy && (
                      <Hint says="Убрать из списка">
                        <button
                          type="button"
                          className="icon-only"
                          aria-label="Убрать"
                          onClick={(event) => {
                            event.stopPropagation();
                            drop(one);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </Hint>
                    )}
                  </div>
                ))}
              </div>
            </aside>

            {row && (
              <>
                <section className="put-look">
                  {row.ready ? (
                    <UploadStage
                      key={row.key}
                      ready={row.ready}
                      background={row.background}
                      look={row.look ?? ANGLED}
                      onLook={(look) => change(row.key, { look })}
                    />
                  ) : (
                    <div className="put-look-none">
                      {row.state === 'reading' ? (
                        <>
                          <Loader2 size={18} className="spin" />
                          <span>Читаю файл…</span>
                        </>
                      ) : row.state === 'refused' ? (
                        <>
                          <FileWarning size={18} />
                          <span>{row.said}</span>
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          <span>{row.state === 'same' ? 'Уже загружена' : 'Загружена'}</span>
                        </>
                      )}
                    </div>
                  )}
                </section>

                <RowFields
                  row={row}
                  many={rows.filter((one) => one.state === 'waiting' || one.state === 'reading').length > 1}
                  disabled={busy || (row.state !== 'waiting' && row.state !== 'reading')}
                  onChange={(to) => change(row.key, to)}
                  onToAll={toAll}
                />
              </>
            )}
          </div>
        )}

        <footer className="put-foot">
          <span className="ask-note">
            {rows.length === 0
              ? 'Можно сразу несколько файлов.'
              : `${rows.length} ${plural(rows.length, 'модель', 'модели', 'моделей')} в списке. Видны только тебе, пока ты их не опубликуешь.`}
          </span>
          <button
            type="button"
            className="chip go put-send"
            // Once everything is up, the same button closes the window: a "done"
            // that cannot be pressed is a label pretending to be a button.
            // Not while a picture is still being taken, or the card would go up with
            // the model seen from where it was before the author turned it.
            disabled={busy || stillReading || behind.length > 0 || (!waiting && !done)}
            onClick={waiting ? send : onClose}
          >
            {busy || stillReading || behind.length > 0 ? (
              <Loader2 size={15} className="spin" />
            ) : !waiting && done ? (
              <Check size={15} />
            ) : (
              <UploadMark size={15} />
            )}
            {busy
              ? 'Загружаю…'
              : stillReading
                ? 'Читаю файлы…'
                : behind.length > 0
                  ? 'Рисую картинку…'
                  : waiting
                    ? `Загрузить (${waiting})`
                    : done
                      ? 'Готово'
                      : 'Загрузить'}
          </button>
        </footer>
      </article>
    </div>,
    document.body,
  );
}

/**
 * The chosen model, turned and played before it goes up.
 *
 * Built from the project already read, not from a file sent anywhere: this is the
 * same figure the site will draw, seen while there is still time to fix the file. One
 * at a time — a key on the row throws the last one's figure away when another is
 * chosen.
 *
 * Where it is turned belongs to the row and not to this stage, because it is sent with
 * the model and because the picture taken for its card is taken from it.
 */
function UploadStage({
  ready,
  background,
  look,
  onLook,
}: {
  ready: Prepared;
  background: string | null;
  look: Look;
  onLook: (look: Look) => void;
}) {
  const [opened, setOpened] = useState<{ figure: Figure; motion: Motion } | null>(null);
  const [broken, setBroken] = useState(false);
  const [tab, setTab] = useState<StageTab>('look');
  const [clipAt, setClipAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [closer, setCloser] = useState(1);

  useEffect(() => {
    let alive = true;
    let made: Figure | null = null;
    (async () => {
      try {
        const figure = await buildFigure(ready.project);
        if (!alive) {
          figure.dispose();
          return;
        }
        made = figure;
        setOpened({ figure, motion: motionOf(ready.project, figure) });
      } catch {
        if (alive) setBroken(true);
      }
    })();
    return () => {
      alive = false;
      made?.dispose();
    };
  }, [ready]);

  const clips = opened?.motion.clips ?? [];
  const clip = clipAt >= 0 ? (clips[clipAt] ?? null) : null;

  return (
    <>
      <StageTabs
        tab={tab}
        onTab={(next) => {
          setTab(next);
          // Back to the model itself, the model stands still: the preview is the
          // picture its card will have, and that one does not move.
          if (next === 'look') setPlaying(false);
        }}
        count={opened ? clips.length : ready.facts.animations}
        reading={!opened && !broken}
      />
      <div className="stage-wrap">
        {opened ? (
          <ModelStage
            figure={opened.figure}
            motion={opened.motion}
            clip={tab === 'clips' ? clip : null}
            playing={tab === 'clips' && playing}
            look={look}
            onLook={onLook}
            closer={closer}
            onCloser={setCloser}
            backdrop={background}
          />
        ) : (
          <div className="stage-box model-box">
            <p className="stage-wait">{broken ? 'Модель не нарисовалась, но загрузить её можно.' : 'Рисую…'}</p>
          </div>
        )}
      </div>
      {tab === 'clips' && (
        <ClipList clips={clips} at={clipAt} playing={playing} onPick={setClipAt} onPlay={setPlaying} />
      )}
    </>
  );
}

/** What is said about the chosen model, each field with a way to give it to all of them. */
function RowFields({
  row,
  many,
  disabled,
  onChange,
  onToAll,
}: {
  row: Row;
  /** Whether there is anybody else to give a field to. */
  many: boolean;
  disabled: boolean;
  onChange: (to: Partial<Row>) => void;
  onToAll: <F extends Field>(field: F, value: About[F]) => void;
}) {
  const head = (title: string, field: Field | null): ReactNode => (
    <span className="put-field-head">
      {title}
      {field && many && (
        <Hint says="Поставить это же всем моделям в списке">
          <button
            type="button"
            className="tiny to-all"
            disabled={disabled}
            onClick={() => onToAll(field, row[field])}
          >
            <CopyCheck size={11} />
            Ко всем
          </button>
        </Hint>
      )}
    </span>
  );

  // Groups and not labels: a label hands a click on its words to the first control
  // inside it, and here that would be "Ко всем" — one stray click on a title would
  // give the field to every model in the list.
  return (
    <section className="put-fields ask-fields">
      <div className="ask-group">
        {head('Название', null)}
        <input
          aria-label="Название"
          value={row.name}
          maxLength={NAME_MAX}
          disabled={disabled}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="ask-group">
        {head('Описание', 'description')}
        <textarea
          aria-label="Описание"
          value={row.description}
          maxLength={DESCRIPTION_MAX}
          rows={4}
          placeholder="Что это, для чего, что внутри"
          disabled={disabled}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
      <div className="ask-group">
        {head('Теги', 'tags')}
        <TagPick tags={row.tags} onChange={(tags) => onChange({ tags })} disabled={disabled} />
      </div>
      <div className="ask-group">
        {head('Лицензия', 'license')}
        <Dropdown
          choices={LICENSES.map((one) => ({ value: one, label: licenseName(one) }))}
          chosen={row.license ? [row.license] : []}
          onChange={([pick]) => onChange({ license: pick ?? null })}
          placeholder="Выбрать лицензию"
          most={1}
        />
      </div>
      <div className="ask-group">
        {head('Фон за моделью', 'background')}
        <ColourRow colour={row.background} onPick={(background) => onChange({ background })} />
      </div>
      {/* The angle has no control of its own: the model beside these fields is the
          control, and this is what it is for and how to undo it. */}
      <div className="ask-group">
        {head('Ракурс', 'look')}
        <div className="put-angle">
          <span className="ask-note">
            Поверни модель мышью: с этого угла будет её картинка в каталоге и с него её откроют другие.
          </span>
          <Hint says="Вернуть обычный ракурс">
            <button
              type="button"
              className="chip"
              aria-label="Вернуть обычный ракурс"
              disabled={disabled || !row.look}
              onClick={() => onChange({ look: null })}
            >
              <RotateCcw size={14} />
            </button>
          </Hint>
        </div>
      </div>
    </section>
  );
}

/**
 * What the page found in the file that the uploader should know before it goes up.
 *
 * Marked red only for what changes the result. Paths taken out of the file are
 * said in grey: they are in almost every file Blockbench saves, and taking them out
 * is the page looking after the uploader, not something wrong with the model.
 */
function Warnings({ ready }: { ready: Prepared }) {
  const said: string[] = [];
  for (const warning of ready.warnings) {
    if (warning.kind === 'not-embedded') {
      const n = warning.count ?? 0;
      said.push(
        `${n} ${plural(n, 'текстура лежит', 'текстуры лежат', 'текстур лежат')} не внутри файла, а у тебя на диске. ` +
          'У тех, кто скачает модель, их не будет.',
      );
    }
    if (warning.kind === 'newer') {
      said.push('Файл сохранён в более новой версии Blockbench, чем знает сайт. На сайте модель может выглядеть иначе.');
    }
  }
  const serious = said.length > 0;
  if (ready.stripped > 0) {
    said.push(
      `Из файла убраны пути к папкам на твоём диске: ${ready.stripped}. В них бывает имя пользователя компьютера.`,
    );
  }
  if (said.length === 0) return null;
  return (
    <Hint says={said.join(' ')}>
      <span className={serious ? 'put-said warn' : 'put-said'}>
        {serious ? <TriangleAlert size={14} /> : <ShieldCheck size={14} />}
      </span>
    </Hint>
  );
}

/** From a chosen file to a row that can be sent, or the reason it cannot. */
async function readOne(file: File): Promise<Partial<Row>> {
  if (!file.name.toLowerCase().endsWith('.bbmodel')) {
    return { state: 'refused', said: 'это не файл .bbmodel' };
  }
  if (file.size > MODEL_MAX_BYTES) {
    return { state: 'refused', said: `больше ${Math.round(MODEL_MAX_BYTES / 1024 / 1024)} МБ` };
  }
  let ready: Prepared;
  try {
    ready = await prepare(new Uint8Array(await file.arrayBuffer()));
  } catch (why) {
    return { state: 'refused', said: why instanceof NotAModel ? why.message : 'файл не читается как модель' };
  }
  // A model the page cannot draw can still go up; its card waits for a picture.
  const taken = await shoot(ready, ANGLED);
  const named = spoken(ready.project.name);
  return {
    state: 'waiting',
    ready,
    preview: taken?.preview ?? null,
    picture: taken?.picture,
    shotAt: null,
    ...(named ? { name: named } : {}),
  };
}

/**
 * The card picture of a model already read, from the angle given, with a link to it
 * for the list beside it. Null when the browser could not draw one.
 */
async function shoot(ready: Prepared, look: Look): Promise<{ preview: Blob; picture: string } | null> {
  try {
    const figure = await buildFigure(ready.project);
    try {
      const preview = await renderPreview(figure, look);
      return preview ? { preview, picture: URL.createObjectURL(preview) } : null;
    } finally {
      figure.dispose();
    }
  } catch {
    return null;
  }
}

/** Whether two angles are the same one, counting "none" as the angle it stands for. */
function sameLook(one: Look | null | undefined, two: Look | null | undefined): boolean {
  const a = one ?? ANGLED;
  const b = two ?? ANGLED;
  return Math.abs(a.spin - b.spin) < 1e-6 && Math.abs(a.tilt - b.tilt) < 1e-6;
}

/** "cow_v2.bbmodel" to "cow v2": what people actually call their models. */
function nameFromFile(file: string): string {
  return spoken(file.replace(/\.bbmodel$/i, '')) || 'Модель';
}

/**
 * A name with its underscores read as spaces. Blockbench names a project after its
 * file unless told otherwise, so the project's own name is as often "cart_coupling"
 * as the file is.
 */
function spoken(name: string): string {
  return cleanName(name.replace(/_+/g, ' '));
}
