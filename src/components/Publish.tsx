import { Globe, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { publishSkin, type Refused } from '../lib/api.js';
import type { Skin } from '../lib/catalogue.js';
import { Hint } from './Hint.js';

/**
 * Putting a skin in front of other people.
 *
 * <h2>One rule, said in one sentence</h2>
 *
 * First to publish a drawing is its author here. Nobody can establish who drew a
 * picture — that is not a limitation of this site, it is a property of PNG files —
 * so the site uses a convention and says so out loud rather than hedging every
 * name on every card.
 *
 * The convention is worth having because of what sits under it: the same drawing
 * cannot be published twice however it is edited, so being first happens once. A
 * person publishing somebody else's work is refused and sent to the copy that is
 * already there, its publisher is told, and a second attempt costs them the right
 * to publish for a while.
 *
 * <h2>Why there is still a field</h2>
 *
 * Because most of what people have was drawn by somebody else, and the only thing
 * worse than a catalogue that credits the wrong person is one that gives them no
 * way to credit the right one. Filled in, the byline names that person instead.
 */
export function Publish({
  skin,
  onClose,
  onDone,
  onOpenOther,
}: {
  skin: Skin;
  onClose: () => void;
  onDone: () => void;
  /** Where the copy already on the showcase lives, when there is one. */
  onOpenOther: (id: string) => void;
}) {
  const [author, setAuthor] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);

  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      await publishSkin(skin.id, { author, url });
      onDone();
      onClose();
    } catch (why) {
      setRefused(
        why && typeof why === 'object' && 'error' in why
          ? (why as Refused)
          : { error: why instanceof Error ? why.message : 'не получилось' },
      );
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="veil"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <article className="window ask" role="dialog" aria-label="Опубликовать">
        <header className="window-top">
          <div className="window-said">
            <h2>Опубликовать «{skin.name}»</h2>
          </div>
          <Hint says="закрыть  (Esc)">
            <button
              type="button"
              className="icon-only"
              aria-label="закрыть"
              disabled={busy}
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </Hint>
        </header>

        <div className="ask-body">
          <p className="ask-why">
            Витрину видят все. Кто первым выложил рисунок — тот и считается его автором:
            установить это по картинке невозможно, поэтому такое правило. Тот же рисунок
            второй раз сюда никто не выложит, как бы его ни правили.
          </p>

          <div className="ask-fields wide">
            <label>
              <span>Если рисовал не ты — укажи автора</span>
              <input
                value={author}
                placeholder="имя автора — необязательно"
                disabled={busy}
                onChange={(event) => setAuthor(event.target.value)}
              />
            </label>
            <label>
              <span>И где это лежит у него</span>
              <input
                value={url}
                placeholder="ссылка — необязательно"
                disabled={busy}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
          </div>

          {refused && (
            <div className="ask-no">
              <p>{refused.error}</p>
              {refused.against && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    onClose();
                    onOpenOther(refused.against!);
                  }}
                >
                  Открыть тот, что уже есть
                </button>
              )}
              {refused.again && (
                <p className="ask-warn">
                  Тому, кто выложил его первым, ушло уведомление. Ещё одна такая попытка —
                  и публиковать будет нельзя какое-то время.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="put-foot">
          <span className="ask-note">Снять с витрины можно в любой момент.</span>
          <button type="button" className="chip go put-send" disabled={busy} onClick={send}>
            {busy ? <Loader2 size={15} className="spin" /> : <Globe size={15} />}
            Опубликовать
          </button>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
