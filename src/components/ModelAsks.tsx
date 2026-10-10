import { Check, EyeOff, Flag, Globe, Loader2, MessageCircleOff, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  DESCRIPTION_MAX,
  LICENSES,
  LICENSE_LINKS,
  NAME_MAX,
  REPORT_KINDS,
  REPORT_SAID_MAX,
  TAGS_MAX,
  type License,
  type ReportKind,
} from '../../shared/modelRules.js';
import { COMMENT_REPORT_KINDS, TAKE_WHY_MIN, type CommentReportKind } from '../../shared/talkRules.js';
import type { ModelDetail, Refused } from '../../shared/modelWire.js';
import type { Comment } from '../../shared/talkWire.js';
import type { Me } from '../lib/me.js';
import {
  changeModel,
  dropModel,
  isRefused,
  publishModel,
  reportModel,
  restore,
  sayWhy,
  takeDown,
} from '../lib/modelApi.js';
import { useMovable } from '../lib/movable.js';
import { commentReportName, licenseName, reportName } from '../lib/names.js';
import { useSaidAge } from '../lib/saidAge.js';
import { dropComment, reportComment } from '../lib/talkApi.js';
import { words } from '../lib/words.js';
import { Dropdown } from './Dropdown.js';
import { Hint } from './Hint.js';
import { ColourRow } from './Backdrop.js';
import { RulePick } from './RulePick.js';
import { TagPick } from './TagPick.js';
import { Switch } from './filters/Kit.js';

/**
 * The small windows a model's window opens over itself: publishing, changing,
 * deleting, reporting, and taking down.
 *
 * Each one is a question with one answer, asked in the same frame as the skins'
 * publishing window, so every decision on the site looks like every other one.
 */

function AskWindow({
  title,
  busy,
  onClose,
  children,
  foot,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  foot: ReactNode;
}) {
  // Moved and sized like every other window, over its own veil: a question is answered
  // before anything else is done, so it stays one at a time.
  const { box, style: placed, grab } = useMovable(0);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [busy, onClose]);

  return createPortal(
    <div className="veil" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <article ref={box} style={placed} className="window ask floating" role="dialog" aria-label={title}>
        <header className="window-top" onPointerDown={grab}>
          <div className="window-said">
            <h2>{title}</h2>
          </div>
          <Hint says={words().win.close_hint}>
            <button type="button" className="icon-only" aria-label={words().win.close} disabled={busy} onClick={onClose}>
              <X size={16} />
            </button>
          </Hint>
        </header>
        <div className="ask-body">{children}</div>
        <footer className="put-foot">{foot}</footer>
      </article>
    </div>,
    document.body,
  );
}

function Refusal({ refused, onOpenOther }: { refused: Refused; onOpenOther?: (id: string) => void }) {
  return (
    <div className="ask-no">
      <p>{refused.error}</p>
      {refused.against && onOpenOther && (
        <button type="button" className="chip" onClick={() => onOpenOther(refused.against!)}>
          {words().ask.open_existing}
        </button>
      )}
      {refused.again === false && (
        <p className="ask-warn">{words().ask.second_try}</p>
      )}
    </div>
  );
}

function refusalOf(why: unknown): Refused {
  return isRefused(why) ? why : { error: sayWhy(why) };
}

/**
 * Who a model is for, asked of its owner.
 *
 * Nothing is chosen beforehand, so that publishing cannot mark a model for everybody
 * by being left alone. Saying it is for adults needs the person to say they are
 * eighteen, once; after that they are not asked again.
 *
 * A mark set by whoever runs the site is a line of words rather than a choice, since
 * the owner cannot take it off: a control that refuses when pressed is worse than no
 * control.
 */
function AdultChoice({
  model,
  me,
  adult,
  onAdult,
  said18,
  onSaid18,
  busy,
}: {
  model: ModelDetail;
  me: Me;
  adult: boolean | null;
  onAdult: (adult: boolean) => void;
  said18: boolean;
  onSaid18: (said: boolean) => void;
  busy: boolean;
}) {
  const closed = me.adult?.closed ?? false;
  const confirmed = me.adult?.confirmed ?? false;
  // Where the site closes them, somebody who has never said their age cannot say it
  // now either, so this is not theirs to choose.
  const barred = closed && !confirmed;

  if (model.adultFixed) {
    return <p className="ask-warn">{words().ask.adult_fixed}</p>;
  }

  return (
    <>
      <label>
        <span>{words().ask.for_whom}</span>
        <Dropdown
          choices={[
            { value: 'all', label: words().ask.for_all },
            { value: 'adult', label: words().ask.for_adult },
          ]}
          chosen={adult === null ? [] : [adult ? 'adult' : 'all']}
          onChange={([pick]) => pick && onAdult(pick === 'adult')}
          placeholder={words().ask.choose}
          most={1}
        />
      </label>
      {adult === true && barred && (
        <p className="ask-no">{words().ask.adult_closed}</p>
      )}
      {adult === true && !barred && !confirmed && (
        <Switch
          on={said18}
          icon={<Check size={12} />}
          label={words().ask.am_18}
          says={words().ask.am_18_hint}
          onToggle={() => !busy && onSaid18(!said18)}
        />
      )}
    </>
  );
}

/**
 * Putting a model in front of everybody.
 *
 * The rule is said in one place and in one sentence, because it is the whole of what
 * publishing means here: first to publish a model is its author, and the same model
 * cannot be published twice. A licence is asked for every time, with no default, so
 * that what others may do with the model is something its author chose.
 */
export function ModelPublish({
  model,
  me,
  onClose,
  onDone,
  onOpenOther,
}: {
  model: ModelDetail;
  me: Me;
  onClose: () => void;
  onDone: () => void;
  onOpenOther: (id: string) => void;
}) {
  const [license, setLicense] = useState<License | null>(isLicenseOf(model.license));
  const [author, setAuthor] = useState(model.author?.name ?? '');
  const [url, setUrl] = useState(model.author?.url ?? '');
  // Nothing chosen on a model nobody has marked yet: a mark left alone would be the
  // site's choice, and this one is the owner's to make.
  const [adult, setAdult] = useState<boolean | null>(model.adultFixed || model.adult ? true : null);
  // The same tick as in the account menu, kept for the visit: closing this window to
  // check something used to throw the answer away.
  const [said18, setSaid18] = useSaidAge();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);
  const [near, setNear] = useState<string | null | undefined>(undefined);

  async function send() {
    if (!license || adult === null) return;
    setBusy(true);
    setRefused(null);
    try {
      const answer = await publishModel(model.id, {
        license,
        author: author.trim(),
        url: url.trim(),
        adult,
        over18: said18,
      });
      // Said to the far side with an 18+ model, it is remembered there from now on.
      if (adult) setSaid18(false);
      onDone();
      if (answer.near) setNear(answer.near);
      else onClose();
    } catch (why) {
      setRefused(refusalOf(why));
    } finally {
      setBusy(false);
    }
  }

  // Published, and the server found the same shape painted differently by somebody
  // else. Not a refusal: a retexture is often the point. Said once, with the way to
  // look at the other one.
  if (near) {
    return (
      <AskWindow
        title={words().ask.published_title}
        busy={false}
        onClose={onClose}
        foot={
          <>
            <span className="ask-note">{words().ask.remake_note}</span>
            <button type="button" className="chip go put-send" onClick={onClose}>
              <Check size={15} />
              {words().models.understood}
            </button>
          </>
        }
      >
        <p className="ask-why">{words().ask.near_text}</p>
        <button
          type="button"
          className="chip ask-wide"
          onClick={() => {
            onClose();
            onOpenOther(near);
          }}
        >
          {words().ask.open_near}
        </button>
      </AskWindow>
    );
  }

  const link = license ? LICENSE_LINKS[license] : undefined;

  return (
    <AskWindow
      title={words().ask.publish_title(model.name)}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">{words().ask.publish_note}</span>
          <button
            type="button"
            className="chip go put-send"
            disabled={busy || !license || adult === null}
            onClick={send}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Globe size={15} />}
            {words().ask.publish}
          </button>
        </>
      }
    >
      <p className="ask-why">{words().ask.publish_why}</p>
      <p className="ask-warn">{words().ask.publish_warn}</p>

      <div className="ask-fields wide">
        <AdultChoice
          model={model}
          me={me}
          adult={adult}
          onAdult={setAdult}
          said18={said18}
          onSaid18={setSaid18}
          busy={busy}
        />
        <label>
          <span>{words().ask.license}</span>
          <Dropdown
            choices={LICENSES.map((one) => ({ value: one, label: licenseName(one) }))}
            chosen={license ? [license] : []}
            onChange={([pick]) => setLicense(pick ?? null)}
            placeholder={words().ask.choose_license}
            most={1}
          />
        </label>
        {link && (
          <a className="ask-link" href={link} target="_blank" rel="noreferrer noopener">
            {words().ask.license_link}
          </a>
        )}
        <label>
          <span>{words().ask.author}</span>
          <input
            value={author}
            maxLength={NAME_MAX}
            placeholder={words().ask.optional}
            disabled={busy}
            onChange={(event) => setAuthor(event.target.value)}
          />
        </label>
        {author.trim() && (
          <label>
            <span>{words().ask.author_url}</span>
            <input
              value={url}
              placeholder={words().ask.url_optional}
              disabled={busy}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
        )}
      </div>

      {refused && (
        <Refusal
          refused={refused}
          onOpenOther={(id) => {
            onClose();
            onOpenOther(id);
          }}
        />
      )}
    </AskWindow>
  );
}

function isLicenseOf(value: string | null): License | null {
  return value && (LICENSES as readonly string[]).includes(value) ? (value as License) : null;
}

/** The name, the description and the tags: everything about a model that is words. */
export function ModelEdit({
  model,
  me,
  onClose,
  onDone,
}: {
  model: ModelDetail;
  me: Me;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description);
  const [tags, setTags] = useState<string[]>(model.tags);
  const [adult, setAdult] = useState<boolean | null>(model.adult);
  const [background, setBackground] = useState<string | null>(model.background);
  // The same tick as in the account menu and the publishing window, kept for the visit.
  const [said18, setSaid18] = useSaidAge();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);

  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      // The mark goes only when it is the thing being changed, so that saving a name
      // is not refused over a mark its owner never touched.
      const marking = !model.adultFixed && adult !== null && adult !== model.adult;
      await changeModel(model.id, {
        name,
        description,
        tags,
        background,
        ...(marking ? { adult, over18: said18 } : {}),
      });
      if (marking && adult) setSaid18(false);
      onDone();
      onClose();
    } catch (why) {
      setRefused(refusalOf(why));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AskWindow
      title={words().ask.edit_title}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">{words().ask.edit_note}</span>
          <button type="button" className="chip go put-send" disabled={busy || !name.trim()} onClick={send}>
            {busy ? <Loader2 size={15} className="spin" /> : <Pencil size={15} />}
            {words().ask.save}
          </button>
        </>
      }
    >
      <div className="ask-fields wide">
        <label>
          <span>{words().ask.name}</span>
          <input value={name} maxLength={NAME_MAX} disabled={busy} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>{words().ask.description}</span>
          <textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={6}
            placeholder={words().ask.description_hint}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {/* A group: the field holds the tags as buttons, and a label would hand a
            click on its words to the first of them. */}
        <div className="ask-group">
          <span>{words().ask.tags_upto(TAGS_MAX)}</span>
          <TagPick tags={tags} onChange={setTags} disabled={busy} />
        </div>
        {/* A group and not a label: it holds ten buttons, and a label hands a click on
            its words to the first of them. */}
        <div className="ask-group">
          <span>{words().ask.background}</span>
          <ColourRow colour={background} onPick={setBackground} />
        </div>
        <AdultChoice
          model={model}
          me={me}
          adult={adult}
          onAdult={setAdult}
          said18={said18}
          onSaid18={setSaid18}
          busy={busy}
        />
      </div>
      {refused && <Refusal refused={refused} />}
    </AskWindow>
  );
}

export function ModelDrop({
  model,
  onClose,
  onDone,
}: {
  model: ModelDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);

  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      await dropModel(model.id);
      onDone();
    } catch (why) {
      setRefused(refusalOf(why));
      setBusy(false);
    }
  }

  return (
    <AskWindow
      title={words().ask.drop_title(model.name)}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">{words().ask.drop_note}</span>
          <button type="button" className="chip bad put-send" disabled={busy} onClick={send}>
            {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
            {words().ask.drop}
          </button>
        </>
      }
    >
      <p className="ask-why">
        {model.visibility === 'public' ? words().ask.drop_why_public : words().ask.drop_why}
      </p>
      {refused && <Refusal refused={refused} />}
    </AskWindow>
  );
}

export function ModelReport({ model, onClose }: { model: ModelDetail; onClose: () => void }) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);
  // Plain tables, so a kind with no question of its own falls back to the general one
  // rather than asking the dictionary for all seven.
  const heads: Record<string, string> = words().ask.report_heads;
  const hints: Record<string, string> = words().ask.report_hints;

  async function send() {
    if (!kind) return;
    setBusy(true);
    setRefused(null);
    try {
      await reportModel(model.id, kind, said);
      setSent(true);
    } catch (why) {
      setRefused(refusalOf(why));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AskWindow
        title={words().ask.sent_title}
        busy={false}
        onClose={onClose}
        foot={
          <button type="button" className="chip go put-send" onClick={onClose}>
            <Check size={15} />
            {words().models.understood}
          </button>
        }
      >
        <p className="ask-why">{words().ask.sent_model}</p>
      </AskWindow>
    );
  }

  return (
    <AskWindow
      title={words().ask.report_title(model.name)}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">{words().ask.report_note}</span>
          <button type="button" className="chip go put-send" disabled={busy || !kind} onClick={send}>
            {busy ? <Loader2 size={15} className="spin" /> : <Flag size={15} />}
            {words().ask.send}
          </button>
        </>
      }
    >
      <div className="ask-fields wide">
        <label>
          <span>{words().ask.what_wrong}</span>
          <Dropdown
            choices={REPORT_KINDS.map((one) => ({ value: one, label: reportName(one) }))}
            chosen={kind ? [kind] : []}
            onChange={([pick]) => setKind(pick ?? null)}
            placeholder={words().ask.choose}
            most={1}
          />
        </label>
        <label>
          <span>{heads[kind ?? ''] ?? words().ask.details}</span>
          <textarea
            value={said}
            maxLength={REPORT_SAID_MAX}
            rows={4}
            placeholder={hints[kind ?? ''] ?? words().ask.optional}
            disabled={busy}
            onChange={(event) => setSaid(event.target.value)}
          />
        </label>
      </div>
      {refused && <Refusal refused={refused} />}
    </AskWindow>
  );
}

/**
 * Reporting a comment.
 *
 * The model's own report window, with the shorter list of kinds: a comment can be
 * unlawful, aimed at a person, spam or somebody's private data, and nothing here is
 * reportable for being disagreed with.
 */
export function CommentReport({ comment, onClose }: { comment: Comment; onClose: () => void }) {
  const [kind, setKind] = useState<CommentReportKind | null>(null);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);

  async function send() {
    if (!kind) return;
    setBusy(true);
    setRefused(null);
    try {
      await reportComment(comment.id, kind, said);
      setSent(true);
    } catch (why) {
      setRefused(refusalOf(why));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AskWindow
        title={words().ask.sent_title}
        busy={false}
        onClose={onClose}
        foot={
          <button type="button" className="chip go put-send" onClick={onClose}>
            <Check size={15} />
            {words().models.understood}
          </button>
        }
      >
        <p className="ask-why">{words().ask.sent_comment}</p>
      </AskWindow>
    );
  }

  return (
    <AskWindow
      title={words().ask.comment_report_title(comment.by.handle)}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">{words().ask.comment_report_note}</span>
          <button type="button" className="chip go put-send" disabled={busy || !kind} onClick={send}>
            {busy ? <Loader2 size={15} className="spin" /> : <Flag size={15} />}
            {words().ask.send}
          </button>
        </>
      }
    >
      <q className="ask-quote">{comment.said}</q>
      <div className="ask-fields wide">
        <label>
          <span>{words().ask.what_wrong}</span>
          <Dropdown
            choices={COMMENT_REPORT_KINDS.map((one) => ({ value: one, label: commentReportName(one) }))}
            chosen={kind ? [kind] : []}
            onChange={([pick]) => setKind(pick ?? null)}
            placeholder={words().ask.choose}
            most={1}
          />
        </label>
        <label>
          <span>{words().ask.details}</span>
          <textarea
            value={said}
            maxLength={REPORT_SAID_MAX}
            rows={3}
            placeholder={words().ask.optional}
            disabled={busy}
            onChange={(event) => setSaid(event.target.value)}
          />
        </label>
      </div>
      {refused && <Refusal refused={refused} />}
    </AskWindow>
  );
}

/**
 * Taking a comment off: one's own, or somebody else's.
 *
 * Two questions in one window, because the act is the same and only the reason
 * differs. Deleting one's own words needs no reason from anybody. Taking off
 * somebody else's — by the model's owner, or by whoever runs the site — needs words
 * that go to its author as they are typed, so a decision about what a person said is
 * never delivered without one.
 *
 * The site also names the clause that was broken, as it does for a model. The owner
 * of the model may: their page is theirs, and not everything they take off under it
 * broke a rule of the site's.
 */
export function CommentTake({
  comment,
  mine,
  site,
  onClose,
  onDone,
}: {
  comment: Comment;
  /** Whether these are the words of the person pressing the button. */
  mine: boolean;
  /** Whether the person pressing runs the site, which the far side treats first. */
  site: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [said, setSaid] = useState('');
  const [rule, setRule] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);
  const short = !mine && (said.trim().length < TAKE_WHY_MIN || (site && !rule));

  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      await dropComment(comment.id, said, mine ? null : rule);
      onDone();
    } catch (why) {
      setRefused(refusalOf(why));
      setBusy(false);
    }
  }

  return (
    <AskWindow
      title={mine ? words().ask.take_mine_title : words().ask.take_title(comment.by.handle)}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">
            {mine ? words().ask.take_mine_note : words().ask.take_note}
          </span>
          <button type="button" className="chip bad put-send" disabled={busy || short} onClick={send}>
            {busy ? (
              <Loader2 size={15} className="spin" />
            ) : mine ? (
              <Trash2 size={15} />
            ) : (
              <MessageCircleOff size={15} />
            )}
            {mine ? words().ask.drop : words().ask.take}
          </button>
        </>
      }
    >
      <q className="ask-quote">{comment.said}</q>
      {mine ? (
        <p className="ask-why">{words().ask.take_mine_why}</p>
      ) : (
        <div className="ask-fields wide">
          <label>
            <span>{words().ask.which_rule}</span>
            <RulePick rule={rule} onPick={setRule} needed={site} />
          </label>
          <label>
            <span>{words().ask.take_why}</span>
            <textarea
              value={said}
              maxLength={REPORT_SAID_MAX}
              rows={3}
              placeholder={words().ask.take_why_hint}
              disabled={busy}
              onChange={(event) => setSaid(event.target.value)}
            />
          </label>
        </div>
      )}
      {refused && <Refusal refused={refused} />}
    </AskWindow>
  );
}

/** For whoever runs the site: taking a model out of the catalogue, or putting it back. */
export function ModelTakedown({
  model,
  down,
  onClose,
  onDone,
}: {
  model: ModelDetail;
  down: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [said, setSaid] = useState('');
  const [rule, setRule] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refused | null>(null);

  async function send() {
    if (down && !rule) return;
    setBusy(true);
    setRefused(null);
    try {
      await (down ? takeDown(model.id, said, rule as string) : restore(model.id, said));
      onDone();
      onClose();
    } catch (why) {
      setRefused(refusalOf(why));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AskWindow
      title={down ? words().ask.takedown_title(model.name) : words().ask.restore_title(model.name)}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <span className="ask-note">{words().ask.owner_told}</span>
          <button
            type="button"
            className={down ? 'chip bad put-send' : 'chip go put-send'}
            disabled={busy || (down && !rule)}
            onClick={send}
          >
            {busy ? <Loader2 size={15} className="spin" /> : down ? <EyeOff size={15} /> : <RotateCcw size={15} />}
            {down ? words().ask.take : words().ask.restore}
          </button>
        </>
      }
    >
      {down && (
        <div className="ask-fields wide">
          <label>
            <span>{words().ask.which_rule}</span>
            <RulePick rule={rule} onPick={setRule} needed />
          </label>
          <label>
            <span>{words().ask.takedown_why}</span>
            <textarea
              value={said}
              maxLength={REPORT_SAID_MAX}
              rows={4}
              placeholder={words().ask.optional}
              disabled={busy}
              onChange={(event) => setSaid(event.target.value)}
            />
          </label>
        </div>
      )}
      {!down && <p className="ask-why">{words().ask.restore_why}</p>}
      {refused && <Refusal refused={refused} />}
    </AskWindow>
  );
}
