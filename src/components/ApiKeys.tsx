import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { KEYS_MAX, KEY_NAME_MAX, type ApiKey, type MadeKey } from '../../shared/keyWire.js';
import { sayWhy } from '../lib/ask.js';
import { dropKey, listKeys, makeKey } from '../lib/keyApi.js';
import { ago } from '../lib/when.js';
import { Hint } from './Hint.js';

/**
 * Keys for the Blockbench plugin, among one's own things.
 *
 * On this page and not in the account menu, because of the one moment that matters:
 * a new key is shown once, and the menu closes the moment somebody clicks elsewhere —
 * for instance into Blockbench, to paste it. Here it stays on screen until the page
 * is left.
 *
 * Each key has a name its owner gives it and the hour it was last used, so that a
 * forgotten key still working somewhere shows up, and one can be taken away without
 * guessing which Blockbench it sits in. Taking one away asks twice: whatever was using
 * it stops at once.
 */
export function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState('');
  const [made, setMade] = useState<MadeKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [doomed, setDoomed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    listKeys().then(setKeys, (why) => setTrouble(sayWhy(why)));
  }, []);

  const create = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setTrouble(null);
    makeKey(name)
      .then(
        (key) => {
          setMade(key);
          setCopied(false);
          setName('');
          setKeys((was) => [key, ...(was ?? [])]);
        },
        (why) => setTrouble(sayWhy(why)),
      )
      .finally(() => setBusy(false));
  };

  const remove = (id: string) => {
    if (doomed !== id) {
      setDoomed(id);
      return;
    }
    setBusy(true);
    setTrouble(null);
    dropKey(id)
      .then(
        () => {
          setKeys((was) => (was ?? []).filter((one) => one.id !== id));
          if (made?.id === id) setMade(null);
          setDoomed(null);
        },
        (why) => setTrouble(sayWhy(why)),
      )
      .finally(() => setBusy(false));
  };

  const copy = () => {
    if (!made) return;
    navigator.clipboard.writeText(made.key).then(
      () => setCopied(true),
      () => setTrouble('Скопировать не вышло: выдели ключ и скопируй его сам'),
    );
  };

  const count = keys?.length ?? 0;

  return (
    <section className="mine-part">
      <h3 className="mine-head">
        <KeyRound size={14} />
        Ключи API
        {count > 0 && <span className="mine-count">{count}</span>}
      </h3>
      <div className="policy-word">
        <p>
          Ключ нужен плагину glTF to Minecraft в Blockbench: в его окне «Модели» нажми «Подключение…» и вставь ключ.
          Ключ виден один раз, сразу после создания.
        </p>

        {made && (
          <div className="key-made">
            <code className="key-code">{made.key}</code>
            <button type="button" className="chip" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Скопировано' : 'Скопировать'}
            </button>
            <p>Больше этот ключ показан не будет. Потеряется — удали его и создай новый.</p>
          </div>
        )}

        {count > 0 && (
          <ul className="key-list">
            {keys!.map((key) => (
              <li key={key.id} className="key-row">
                <span className="key-name">{key.name}</span>
                <Hint says={`Последние знаки ключа. Создан ${ago(key.created)}`}>
                  <span className="key-hint">…{key.hint}</span>
                </Hint>
                <span className="key-when">{key.used ? `Работал ${ago(key.used)}` : 'Ещё не использован'}</span>
                <Hint says={doomed === key.id ? 'Там, где он вставлен, он перестанет работать сразу' : 'Удалить ключ'}>
                  <button
                    type="button"
                    className={doomed === key.id ? 'chip bad' : 'chip'}
                    disabled={busy}
                    onClick={() => remove(key.id)}
                    onBlur={() => setDoomed((was) => (was === key.id ? null : was))}
                    aria-label="Удалить ключ"
                  >
                    <Trash2 size={14} />
                    {doomed === key.id && 'Точно удалить'}
                  </button>
                </Hint>
              </li>
            ))}
          </ul>
        )}

        {keys !== null && count < KEYS_MAX && (
          <div className="key-new">
            <input
              type="text"
              value={name}
              maxLength={KEY_NAME_MAX}
              placeholder="Имя ключа, например: Blockbench дома"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') create();
              }}
            />
            <button type="button" className="chip go" disabled={!name.trim() || busy} onClick={create}>
              <Plus size={15} />
              Создать ключ
            </button>
          </div>
        )}
        {count >= KEYS_MAX && <p>Ключей уже {KEYS_MAX}. Чтобы создать новый, удали ненужный.</p>}
        {trouble && <p className="note bad">{trouble}</p>}
      </div>
    </section>
  );
}
