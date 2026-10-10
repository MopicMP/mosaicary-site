import {
  Boxes,
  CalendarClock,
  Download,
  EyeOff,
  Flag,
  Globe,
  Heart,
  Lock,
  MessageCircle,
  Scale,
  Send,
  ShieldAlert,
  Trash2,
  Upload as UploadMark,
  User,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import type { AdultView } from '../../shared/adult.js';
import { REPORT_SAID_MAX, isReportKind } from '../../shared/modelRules.js';
import { TAKE_WHY_MIN, isCommentReportKind } from '../../shared/talkRules.js';
import type { ModelSummary, QueueItem } from '../../shared/modelWire.js';
import type { Me } from '../lib/me.js';
import { adminQueue, sayWhy, tellPolicy } from '../lib/modelApi.js';
import { commentReportName, reportName } from '../lib/names.js';
import { dropComment, talkQueue, type TalkQueueItem } from '../lib/talkApi.js';
import { ago } from '../lib/when.js';
import { ApiKeys } from './ApiKeys.js';
import { Hint } from './Hint.js';
import { ModelCard } from './ModelCard.js';
import { RulePick } from './RulePick.js';
import { SignInWays } from './SignIn.js';

/**
 * Your own corner: who you are, what you have put here, and how it is doing.
 *
 * <h2>Three shelves, not one grid</h2>
 *
 * A model here is in one of three states and nothing on a card said which: a draft
 * nobody else can see, a model in the catalogue, and one the site has taken down.
 * One grid of everything made the three look like one pile of work with no order to
 * it — and the question somebody actually comes here with is "what have I not
 * published yet", which a heading answers and a grid does not.
 *
 * The numbers across the top are the other half of that question. Downloads, hearts
 * and comments across everything of yours: they come with each model already, so this
 * is a sum and not a request, and they are the one thing on the page that says
 * whether any of it was any use to anybody.
 *
 * What the site has to tell you is <em>not</em> here. It is under the bell in the
 * header, where it does not stand between you and your own models — see `Notices`.
 *
 * Whoever runs the site also finds the queue here, since it is their own work.
 */
export function MyModels({
  me,
  view,
  models,
  loved,
  loading,
  fresh,
  onOpen,
  onUpload,
  onChanged,
}: {
  me: Me;
  /** How models for adults are shown to them, their own included. */
  view: AdultView;
  models: ModelSummary[];
  /** Other people's, the ones they put a heart on, as the catalogue has them. */
  loved: ModelSummary[];
  loading: boolean;
  /** Changes when something was changed and the page should ask again. */
  fresh: number;
  onOpen: (id: string) => void;
  onUpload: () => void;
  /** Something was said to everybody and the page should ask again. */
  onChanged: () => void;
}) {
  if (!me.signedIn) {
    return (
      <div className="alone">
        <User size={28} />
        <h2>Здесь будут твои модели</h2>
        <p>Войди через Discord или GitHub: заведётся аккаунт, и всё, что загрузишь, останется за тобой.</p>
        <SignInWays me={me} back="/me" />
      </div>
    );
  }

  const drafts = models.filter((model) => model.visibility === 'private');
  const inCatalogue = models.filter((model) => model.visibility === 'public' && !model.hidden);
  const takenDown = models.filter((model) => model.hidden);
  const sum = (of: (model: ModelSummary) => number) => models.reduce((all, model) => all + of(model), 0);
  const downloads = sum((model) => model.downloads);
  const hearts = sum((model) => model.likes);
  const talked = sum((model) => model.comments);

  return (
    <div className="mine">
      <header className="mine-top">
        {me.face ? (
          <img src={me.face} alt="" width={56} height={56} />
        ) : (
          <span className="mine-none">
            <User size={24} />
          </span>
        )}
        <div className="mine-said">
          <h2>{me.handle}</h2>
          <div className="mine-facts">
            <Hint says="Сколько здесь твоих моделей">
              <span className="fact">
                <Boxes size={13} />
                {models.length}
              </span>
            </Hint>
            <Hint says="Сколько из них в каталоге">
              <span className="fact">
                <Globe size={13} />
                {inCatalogue.length}
              </span>
            </Hint>
            {me.since && (
              <Hint says="Когда здесь появился твой аккаунт">
                <span className="fact">
                  <CalendarClock size={13} />
                  {ago(me.since)}
                </span>
              </Hint>
            )}
            {/* Only once there is something for them to be about. Three zeroes under
                the name of somebody who has not uploaded anything yet are three ways
                of saying the shelf is empty, which the shelf says itself. */}
            {models.length > 0 && (
              <span className="mine-sums">
                <Hint says="Сколько раз скачали твои модели">
                  <span className="fact">
                    <Download size={13} />
                    {downloads}
                  </span>
                </Hint>
                <Hint says="Сколько сердечек на них поставили">
                  <span className="fact">
                    <Heart size={13} />
                    {hearts}
                  </span>
                </Hint>
                <Hint says="Сколько комментариев под ними">
                  <span className="fact">
                    <MessageCircle size={13} />
                    {talked}
                  </span>
                </Hint>
              </span>
            )}
          </div>
        </div>
        <button type="button" className="chip go mine-put" onClick={onUpload}>
          <UploadMark size={15} />
          Загрузить
        </button>
      </header>

      {me.barredUntil && Date.parse(me.barredUntil) > Date.now() && (
        <p className="note bad">
          <ShieldAlert size={15} />
          Загружать и публиковать модели можно будет {new Date(me.barredUntil).toLocaleDateString('ru')}.
        </p>
      )}

      {loading && <p className="note">Смотрю, что у тебя есть…</p>}

      {!loading && models.length === 0 && (
        <div className="alone">
          <Boxes size={28} />
          <h2>Пока пусто</h2>
          <p>Загрузи модели Blockbench, свои или собранные. Они будут видны только тебе, пока ты не решишь иначе.</p>
          <button type="button" className="chip go alone-go" onClick={onUpload}>
            <UploadMark size={15} />
            Загрузить
          </button>
        </div>
      )}

      {/* Drafts first: they are the ones with something left to decide about. */}
      <Shelf
        title="Черновики"
        icon={<Lock size={14} />}
        says="Видны только тебе, пока ты не опубликуешь"
        models={drafts}
        view={view}
        onOpen={onOpen}
      />
      <Shelf
        title="В каталоге"
        icon={<Globe size={14} />}
        says="Их видят все"
        models={inCatalogue}
        view={view}
        onOpen={onOpen}
      />
      <Shelf
        title="Сняты с каталога"
        icon={<EyeOff size={14} />}
        says="Файл остался у тебя, в каталоге их больше нет"
        models={takenDown}
        view={view}
        onOpen={onOpen}
      />
      <Shelf
        title="Любимое"
        icon={<Heart size={14} />}
        says="Чужие модели с твоим сердечком"
        models={loved}
        view={view}
        liked
        onOpen={onOpen}
      />

      <ApiKeys />

      {me.admin && <Queue fresh={fresh} onOpen={onOpen} />}
      {me.admin && <TalkQueue fresh={fresh} onOpen={onOpen} />}
      {me.admin && <PolicyWord onSent={onChanged} />}
    </div>
  );
}

/**
 * One shelf of cards under a heading that counts them.
 *
 * Nothing at all where there is nothing on it. A heading over an empty space is a
 * statement that something is missing, and "no models taken down" is not news
 * anybody needs told.
 */
function Shelf({
  title,
  icon,
  says,
  models,
  view,
  liked = false,
  onOpen,
}: {
  title: string;
  icon: ReactNode;
  says: string;
  models: ModelSummary[];
  view: AdultView;
  liked?: boolean;
  onOpen: (id: string) => void;
}) {
  if (models.length === 0) return null;
  return (
    <section className="mine-part">
      <Hint says={says}>
        <h3 className="mine-head">
          {icon}
          {title}
          <span className="mine-count">{models.length}</span>
        </h3>
      </Hint>
      <div className="grid">
        {models.map((model) => (
          <ModelCard key={model.id} model={model} view={view} liked={liked} onOpen={() => onOpen(model.id)} />
        ))}
      </div>
    </section>
  );
}

/**
 * Saying that the rules changed, to every account at once.
 *
 * Beside the queue because it is the same person's work, and on the site rather than in
 * a mailing because no address of anybody is stored — see the page about data. The press
 * is asked about twice: it reaches everybody and cannot be taken back.
 */
function PolicyWord({ onSent }: { onSent: () => void }) {
  const [said, setSaid] = useState('');
  const [sure, setSure] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  const send = () => {
    setSending(true);
    setTrouble(null);
    tellPolicy(said)
      .then(
        (done) => {
          setSent(done.sent);
          setSaid('');
          setSure(false);
          onSent();
        },
        (why) => setTrouble(sayWhy(why)),
      )
      .finally(() => setSending(false));
  };

  return (
    <section className="mine-part">
      <h3 className="mine-head">
        <Scale size={14} />
        Изменение правил
      </h3>
      <div className="policy-word">
        <p>
          Уведомление уйдёт всем, у кого есть аккаунт, и появится у них в этом же списке. Писем мы не рассылаем:
          адресов почты сайт не хранит.
        </p>
        <label>
          Что изменилось
          <textarea
            value={said}
            maxLength={1000}
            rows={3}
            placeholder="В правилах уточнён раздел о моделях для взрослых. Полный текст — на странице «Правила»."
            onChange={(event) => {
              setSaid(event.target.value);
              setSure(false);
              setSent(null);
            }}
          />
        </label>
        {trouble && <p className="note bad">{trouble}</p>}
        {sent !== null && <p className="note">Уведомление получили аккаунтов: {sent}.</p>}
        <div className="policy-go">
          {sure && (
            <button type="button" className="chip" onClick={() => setSure(false)}>
              Отмена
            </button>
          )}
          <button
            type="button"
            className="chip go"
            disabled={said.trim().length < 10 || sending}
            onClick={() => (sure ? send() : setSure(true))}
          >
            <Send size={15} />
            {sending ? 'Рассылаю…' : sure ? 'Точно разослать' : 'Разослать всем'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Models waiting for whoever runs the site: reported, or not what their uploader said. */
function Queue({ fresh, onOpen }: { fresh: number; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    adminQueue().then(
      (got) => alive && setItems(got),
      (why) => alive && setTrouble(sayWhy(why)),
    );
    return () => {
      alive = false;
    };
  }, [fresh]);

  return (
    <section className="mine-part">
      <h3 className="mine-head">
        <ShieldAlert size={14} />
        Ждут проверки
      </h3>
      {trouble && <p className="note bad">{trouble}</p>}
      {items && items.length === 0 && <p className="empty">Никто ничего не ждёт</p>}
      {items && items.length > 0 && (
        <ul className="queue">
          {items.map((item) => (
            <li key={item.id} className="queue-row">
              <button type="button" className="queue-name" onClick={() => onOpen(item.id)}>
                {item.name}
                <small>{item.by.handle}</small>
              </button>
              <div className="queue-said">
                {item.adult && (
                  <span className="queue-one warn">
                    <EyeOff size={12} />
                    Помечена 18+
                  </span>
                )}
                {item.doubted && (
                  <span className="queue-one warn">
                    <ShieldAlert size={12} />
                    Файл не сходится с заявленным
                  </span>
                )}
                {item.reports.map((one, at) => (
                  <span key={at} className="queue-one">
                    <Flag size={12} />
                    {isReportKind(one.kind) ? reportName(one.kind) : one.kind}
                    {one.said && <q>{one.said}</q>}
                    <small>
                      {one.by ?? 'аккаунт удалён'}, {ago(one.made)}
                    </small>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Comments somebody reported, and the one act that answers them.
 *
 * Its own list beside the models', because a reported comment is answered by taking
 * the comment off and a reported model by taking the model down: one list with both
 * would be a list where half the buttons do nothing. The clause and the reason are
 * given before the button works — the author is told both, word for word, which is
 * what article 17 of Regulation (EU) 2022/2065 asks of a decision about somebody's
 * words.
 */
function TalkQueue({ fresh, onOpen }: { fresh: number; onOpen: (id: string) => void }) {
  const [items, setItems] = useState<TalkQueueItem[] | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    talkQueue().then(
      (got) => alive && setItems(got),
      (bad) => alive && setTrouble(sayWhy(bad)),
    );
    return () => {
      alive = false;
    };
  }, [fresh]);

  const take = (cid: string) => {
    setBusy(cid);
    setTrouble(null);
    dropComment(cid, why[cid] ?? '', rules[cid] ?? null)
      .then(
        () => setItems((was) => (was ?? []).filter((one) => one.comment.id !== cid)),
        (bad) => setTrouble(sayWhy(bad)),
      )
      .finally(() => setBusy(null));
  };

  if (items && items.length === 0) return null;
  return (
    <section className="mine-part">
      <h3 className="mine-head">
        <MessageCircle size={14} />
        Жалобы на комментарии и отзывы
      </h3>
      {trouble && <p className="note bad">{trouble}</p>}
      {items && (
        <ul className="queue">
          {items.map((item) => (
            <li key={item.comment.id} className="queue-row">
              <QueueName item={item} onOpen={onOpen} />
              <div className="queue-said">
                <q className="queue-text">{item.comment.said}</q>
                {item.reports.map((one, at) => (
                  <span key={at} className="queue-one">
                    <Flag size={12} />
                    {isCommentReportKind(one.kind) ? commentReportName(one.kind) : one.kind}
                    {one.said && <q>{one.said}</q>}
                    <small>
                      {one.by ?? 'аккаунт удалён'}, {ago(one.made)}
                    </small>
                  </span>
                ))}
                <div className="queue-act">
                  <div className="queue-rule">
                    <RulePick
                      rule={rules[item.comment.id] ?? null}
                      onPick={(rule) => setRules((was) => ({ ...was, [item.comment.id]: rule }))}
                      needed
                    />
                  </div>
                  <input
                    type="text"
                    value={why[item.comment.id] ?? ''}
                    maxLength={REPORT_SAID_MAX}
                    placeholder="За что снимается: автор увидит эти слова"
                    onChange={(event) =>
                      setWhy((was) => ({ ...was, [item.comment.id]: event.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="chip bad"
                    disabled={
                      (why[item.comment.id] ?? '').trim().length < TAKE_WHY_MIN ||
                      !rules[item.comment.id] ||
                      busy === item.comment.id
                    }
                    onClick={() => take(item.comment.id)}
                  >
                    <Trash2 size={14} />
                    {busy === item.comment.id ? 'Снимаю…' : 'Снять'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * What the reported words hang under: a model to open, or the thing a review is about.
 *
 * A review of the plugin or of the site has no model, and the queue is one list for
 * both — the act that answers a report is the same one either way. Said as words
 * rather than as a button, because there is one wall and a button that merely leaves
 * this list for it is not worth the hand.
 */
function QueueName({ item, onOpen }: { item: TalkQueueItem; onOpen: (id: string) => void }) {
  const model = item.model;
  if (!model) {
    return (
      <span className="queue-name queue-about">
        {aboutName(item.about)}
        <small>{item.comment.by.handle}</small>
      </span>
    );
  }
  return (
    <button type="button" className="queue-name" onClick={() => onOpen(model.id)}>
      {model.name}
      <small>{item.comment.by.handle}</small>
    </button>
  );
}

function aboutName(about: string): string {
  if (about === 'plugin') return 'Отзыв о плагине';
  if (about === 'site') return 'Отзыв о сайте';
  return 'Комментарий';
}
