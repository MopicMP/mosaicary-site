import { Check, FileWarning, Loader2, Plus, Upload as UploadMark, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { nameFromFile, sendSkin, wrongWith } from '../lib/api.js';
import type { Gender } from '../lib/catalogue.js';
import { Hint } from './Hint.js';
import { SkinFigure } from './SkinFigure.js';

/**
 * Putting skins in, several at a time.
 *
 * <h2>Why the whole folder at once</h2>
 *
 * Because that is what anybody has: a folder of skins collected over years, not
 * one file they are about to draw. A window that takes one and asks four questions
 * about it is a window somebody uses twice and then gives up on.
 *
 * So each file becomes a row that is already filled in — the name from the file
 * name, which is what people actually call them — and everything sends at once.
 * Anything to be corrected is corrected before or after; nothing has to be.
 *
 * <h2>Why every row keeps its own state</h2>
 *
 * Thirty files will not all work. One is a JPEG somebody renamed, one is the same
 * skin as another, one is a picture of a cat. A single "failed" for the batch tells
 * nobody which, and asking again means sending the twenty-nine that were fine a
 * second time.
 */

type State = 'waiting' | 'sending' | 'done' | 'same' | 'refused';

interface Row {
  file: File;
  name: string;
  state: State;
  said?: string;
}

export function Upload({ onClose, onPut }: { onClose: () => void; onPut: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [gender, setGender] = useState<Gender>('neutral');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

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

  function take(files: FileList | null) {
    if (!files) return;
    const fresh: Row[] = [];
    for (const file of Array.from(files)) {
      const wrong = wrongWith(file);
      fresh.push({
        file,
        name: nameFromFile(file.name),
        state: wrong ? 'refused' : 'waiting',
        said: wrong ?? undefined,
      });
    }
    // Added to what is already there rather than replacing it: choosing twice is
    // how anybody assembles a batch out of two folders.
    setRows((was) => [...was, ...fresh]);
  }

  async function send() {
    setBusy(true);
    const wanted = tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    for (let at = 0; at < rows.length; at++) {
      const row = rows[at]!;
      if (row.state !== 'waiting') continue;
      setRows((was) => was.map((one, i) => (i === at ? { ...one, state: 'sending' } : one)));
      try {
        const answer = await sendSkin(row.file, { name: row.name, gender, tags: wanted });
        setRows((was) =>
          was.map((one, i) =>
            i === at ? { ...one, state: answer.already ? 'same' : 'done' } : one,
          ),
        );
      } catch (why) {
        const said = why instanceof Error ? why.message : 'не получилось';
        setRows((was) => was.map((one, i) => (i === at ? { ...one, state: 'refused', said } : one)));
      }
    }
    setBusy(false);
    onPut();
  }

  const waiting = rows.filter((row) => row.state === 'waiting').length;
  const done = rows.filter((row) => row.state === 'done' || row.state === 'same').length;

  return createPortal(
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <article className="window put" role="dialog" aria-label="Загрузить скины">
        <header className="window-top">
          <div className="window-said">
            <h2>Загрузить скины</h2>
          </div>
          <Hint says="закрыть  (Esc)">
            <button type="button" className="icon-only" aria-label="закрыть" disabled={busy} onClick={onClose}>
              <X size={16} />
            </button>
          </Hint>
        </header>

        <div className="put-body">
          <div
            className={dragging ? 'drop-here over' : 'drop-here'}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              take(event.dataTransfer.files);
            }}
            onClick={() => picker.current?.click()}
          >
            <UploadMark size={20} />
            <span>Перетащи сюда файлы или нажми, чтобы выбрать</span>
            <small>PNG, 64 пикселя в ширину и больше, до 4 МБ</small>
            <input
              ref={picker}
              type="file"
              accept="image/png"
              multiple
              hidden
              onChange={(event) => {
                take(event.target.files);
                // Emptied, or choosing the same file twice does nothing at all.
                event.target.value = '';
              }}
            />
          </div>

          {rows.length > 0 && (
            <div className="put-rows">
              {rows.map((row, at) => (
                <div key={`${row.file.name}-${at}`} className={`put-row ${row.state}`}>
                  <div className="put-face">
                    {row.state === 'refused' ? (
                      <FileWarning size={18} />
                    ) : (
                      <Peek file={row.file} />
                    )}
                  </div>
                  <input
                    className="put-name"
                    value={row.name}
                    disabled={row.state !== 'waiting'}
                    onChange={(event) =>
                      setRows((was) =>
                        was.map((one, i) => (i === at ? { ...one, name: event.target.value } : one)),
                      )
                    }
                  />
                  <span className="put-state">
                    {row.state === 'sending' && <Loader2 size={14} className="spin" />}
                    {row.state === 'done' && <Check size={14} />}
                    {row.state === 'same' && <span className="put-said">уже был</span>}
                    {row.state === 'refused' && <span className="put-said bad">{row.said}</span>}
                  </span>
                  {row.state === 'waiting' && (
                    <button
                      type="button"
                      className="icon-only"
                      title="убрать"
                      onClick={() => setRows((was) => was.filter((_, i) => i !== at))}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="put-foot">
          {/*
           * Asked once for the whole batch rather than per file. A folder is
           * almost always one person's collection of one kind of thing, and
           * anything that is not can be corrected on the skin afterwards.
           */}
          <label className="put-tags">
            <Plus size={13} />
            <input
              value={tags}
              placeholder="метки через запятую — на все сразу"
              disabled={busy}
              onChange={(event) => setTags(event.target.value)}
            />
          </label>

          <div className="put-genders">
            {(['girl', 'boy', 'neutral'] as Gender[]).map((one) => (
              <Hint key={one} says={{ girl: 'девушка', boy: 'парень', neutral: 'нейтральный' }[one]}>
                <button
                  type="button"
                  className={gender === one ? 'chip on' : 'chip'}
                  disabled={busy}
                  onClick={() => setGender(one)}
                >
                  {{ girl: 'Ж', boy: 'М', neutral: '—' }[one]}
                </button>
              </Hint>
            ))}
          </div>

          <button type="button" className="chip go put-send" disabled={busy || !waiting} onClick={send}>
            {busy ? <Loader2 size={15} className="spin" /> : <UploadMark size={15} />}
            {busy ? 'загружаю…' : waiting ? `Загрузить (${waiting})` : done ? 'Готово' : 'Загрузить'}
          </button>
        </footer>
      </article>
    </div>,
    document.body,
  );
}

/**
 * The file as a figure, before it has been anywhere.
 *
 * Read straight off the disk, which is the whole point: seeing that it is the right
 * skin is what somebody actually wants from a list of thirty file names, and
 * waiting for a round trip to find out is waiting for the wrong thing.
 */
function Peek({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  // Read out of the file's own header rather than assumed. Half of everything
  // that has gone wrong with these has been a skin in the layout from before 1.8
  // drawn as though it were a modern one, and it always looks like a broken file.
  const [layout, setLayout] = useState<32 | 64>(64);

  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    void file
      .slice(0, 24)
      .arrayBuffer()
      .then((head) => {
        const view = new DataView(head);
        if (view.byteLength < 24) return;
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        setLayout(height * 2 <= width ? 32 : 64);
      })
      .catch(() => setLayout(64));
    // Let go of it, or a batch of thirty holds thirty pictures in memory for as
    // long as the tab is open.
    return () => URL.revokeObjectURL(made);
  }, [file]);

  if (!url) return null;
  return (
    <SkinFigure url={url} layout={layout} view="flat" moving={false} height={34} className="figure" />
  );
}
