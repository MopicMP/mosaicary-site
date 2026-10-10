import { Flag, Heart, Loader2, Pencil, Reply, Send, Trash2, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { threadsOf } from '../../shared/talkRules.js';
import { REPLY_MAX, REVIEW_MAX, SUBJECTS, type Subject } from '../../shared/wallRules.js';
import { NOBODY, askWhoIAm, type Me } from '../lib/me.js';
import { num } from '../lib/numbers.js';
import { likeComment } from '../lib/talkApi.js';
import { answerOn, rewriteMine, sayNo, sayOn, wallOf, type Review, type Wall } from '../lib/wallApi.js';
import { ago } from '../lib/when.js';
import { words } from '../lib/words.js';
import { Hint } from './Hint.js';
import { CommentReport, CommentTake } from './ModelAsks.js';
import { SignInWays } from './SignIn.js';

/**
 * The wall: what people say about the plugin and about the site.
 *
 * <h2>Two subjects on one wall</h2>
 *
 * Her decision of 9 October: the plugin and the site are reviewed apart, each review
 * marked with its own subject, and one wall that can be narrowed to either. Narrowing
 * is three words at the top and not two pages, because the question people arrive with
 * is "what do people think of this" and not "which of your two things is this".
 *
 * <h2>Why the box at the top shows what you already wrote</h2>
 *
 * One review per person per subject is the rule, and a rule is better seen than
 * learned from a refusal. So the box is your review of whichever subject is chosen: if
 * you have one it is in there, and the button says "Переписать" rather than
 * "Написать". Nobody meets `wall_already` by pressing a button the page offered them.
 *
 * <h2>No stars</h2>
 *
 * Her decision: words, and a heart on a review meaning "this is useful". A number out
 * of five on work this young says nothing and invites being gamed; the heart is about
 * the review, not about us, and it is what sorts the useful ones upward when there are
 * enough of them to sort.
 *
 * <h2>Why this is not inside Talk.tsx</h2>
 *
 * Because a review is a comment with a subject everywhere else — one table, one set of
 * routes, one moderation queue — and here, in the drawing of it, it is not: the wall
 * has its own narrowing, its own one-per-subject box, its own badge and its own line
 * saying a review was rewritten. Sharing one component would mean half of it being
 * switched off by a flag. The two do share the lines that matter — `threadsOf`, the
 * two little windows for removing and reporting, the `talk-*` styles. The one real
 * copy is the row of four buttons under a comment, and it is written down as a debt in
 * `docs/feedback.md`: when the translation of `Talk.tsx` settles, that row becomes one
 * component for both.
 */
export function Feedback() {
  const w = words().wall;
  const [me, setMe] = useState<Me>(NOBODY);
  const [wall, setWall] = useState<Wall | null>(null);
  /** Which subject the wall is narrowed to, or null for both. */
  const [only, setOnly] = useState<Subject | null>(null);
  /** Which subject the box at the top is about. */
  const [about, setAbout] = useState<Subject>('plugin');
  /** What is typed for each subject; null while nothing has been typed for it. */
  const [typed, setTyped] = useState<Record<Subject, string | null>>({ plugin: null, site: null });
  const [answering, setAnswering] = useState<{ to: Review; said: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ how: 'report' | 'take'; comment: Review } | null>(null);

  // Asked here rather than handed down, because this page is reached by its own
  // address like the rules and the contacts are, and nothing above it knows or cares
  // who is reading it.
  useEffect(() => {
    void askWhoIAm().then(setMe);
  }, []);

  useEffect(() => {
    let alive = true;
    setWall(null);
    setTrouble(null);
    wallOf(only).then(
      (got) => alive && setWall(got),
      (why) => alive && setTrouble(sayNo(why)),
    );
    return () => {
      alive = false;
    };
  }, [only]);

  const again = () => {
    wallOf(only).then(setWall, (why) => setTrouble(sayNo(why)));
  };

  /**
   * Your own review of the subject chosen, and what the box shows.
   *
   * What you have typed wins, your own review stands in while you have typed nothing,
   * and an empty box is what is left. Kept as a value worked out while drawing rather
   * than copied into the box when the subject changes: a heart pressed anywhere on the
   * wall redraws this page, and a box filled by an effect would lose the half-written
   * review every time somebody did that.
   */
  const mine = wall?.mine.find((one) => one.about === about) ?? null;
  const shown = typed[about] ?? mine?.said ?? '';
  const nothing = shown.trim().length === 0;
  const same = !!mine && shown.trim() === mine.said;

  const counts = wall?.counts ?? { plugin: 0, site: 0 };
  const both = counts.plugin + counts.site;

  // Narrowing the wall points the box at the same subject: somebody reading the
  // reviews of the plugin who starts writing is writing about the plugin.
  const narrow = (to: Subject | null) => {
    setOnly(to);
    if (to) setAbout(to);
  };

  const send = () => {
    setBusy(true);
    setTrouble(null);
    const said = shown.trim();
    const kept = () => {
      // Back to standing in for the server's copy, which `again` is about to bring.
      setTyped((was) => ({ ...was, [about]: null }));
      again();
    };
    const going = mine ? rewriteMine(mine.id, said).then(kept) : sayOn(about, said).then(kept);
    going.catch((why: unknown) => setTrouble(sayNo(why))).finally(() => setBusy(false));
  };

  const answer = () => {
    if (!answering) return;
    setBusy(true);
    setTrouble(null);
    answerOn(answering.to.id, answering.said.trim())
      .then(
        () => {
          setAnswering(null);
          again();
        },
        (why: unknown) => setTrouble(sayNo(why)),
      )
      .finally(() => setBusy(false));
  };

  /** One review, replaced wherever it is held, by whatever is made of it. */
  const swap = (id: string, made: (one: Review) => Review) =>
    setWall((was) => {
      if (!was) return was;
      const one = (list: Review[]) => list.map((had) => (had.id === id ? made(had) : had));
      return { ...was, reviews: one(was.reviews), mine: one(was.mine) };
    });

  const heart = (one: Review, on: boolean) => {
    // Shown before the server answers and put back if it refuses, as under a model: a
    // heart that waits for a round trip reads as a broken button.
    swap(one.id, (had) => liked(had, on));
    likeComment(one.id, on).then(
      (answered) => swap(one.id, (had) => ({ ...had, likes: answered.likes, liked: answered.liked })),
      (why) => {
        setTrouble(sayNo(why));
        swap(one.id, (had) => liked(had, !on));
      },
    );
  };

  // Newest review first, each thread's answers under it in the order they were
  // written. `threadsOf` gives the oldest first, which is right under a model — there
  // a conversation is read downward — and wrong on a wall, where the last thing said
  // is what somebody came to read.
  const threads = threadsOf(wall?.reviews ?? []).reverse();
  const noneYet = only === 'plugin' ? w.none_plugin : only === 'site' ? w.none_site : w.none;

  const acts = (one: Review) => ({
    one,
    me,
    onReply: wall?.mayWrite ? (to: Review) => setAnswering({ to, said: '' }) : undefined,
    onHeart: heart,
    onTake: (comment: Review) => setAsking({ how: 'take', comment }),
    onReport: (comment: Review) => setAsking({ how: 'report', comment }),
  });

  return (
    <section className="wall">
      <p className="wall-lead">{w.lead}</p>

      <nav className="wall-pick">
        <button
          type="button"
          className={only === null ? 'chip on' : 'chip'}
          onClick={() => narrow(null)}
        >
          {w.all}
          <span className="wall-n">{num(both)}</span>
        </button>
        {SUBJECTS.map((subject) => (
          <button
            key={subject}
            type="button"
            className={only === subject ? 'chip on' : 'chip'}
            onClick={() => narrow(subject)}
          >
            {subject === 'plugin' ? w.of_plugin : w.of_site}
            <span className="wall-n">{num(counts[subject])}</span>
          </button>
        ))}
      </nav>

      {!me.signedIn && (
        <div className="wall-out">
          <p className="empty">{w.sign_in}</p>
          <SignInWays me={me} back={location.pathname} />
        </div>
      )}
      {me.signedIn && wall && !wall.mayWrite && <p className="empty">{w.barred}</p>}
      {me.signedIn && wall?.mayWrite && (
        <div className="talk-write wall-write">
          <div className="wall-of">
            <span className="wall-of-head">{w.mine}</span>
            {SUBJECTS.map((subject) => (
              <button
                key={subject}
                type="button"
                className={about === subject ? 'chip on' : 'chip'}
                onClick={() => setAbout(subject)}
              >
                {subject === 'plugin' ? w.of_plugin : w.of_site}
              </button>
            ))}
          </div>
          <textarea
            value={shown}
            rows={4}
            maxLength={REVIEW_MAX}
            placeholder={about === 'plugin' ? w.say_plugin : w.say_site}
            disabled={busy}
            onChange={(event) => setTyped((was) => ({ ...was, [about]: event.target.value }))}
          />
          <div className="talk-go">
            <span className="talk-left">
              {shown.length > REVIEW_MAX - 200 && w.left(REVIEW_MAX - shown.length)}
            </span>
            <button
              type="button"
              className="chip go"
              disabled={busy || nothing || same}
              onClick={send}
            >
              {busy ? (
                <Loader2 size={14} className="spin" />
              ) : mine ? (
                <Pencil size={14} />
              ) : (
                <Send size={14} />
              )}
              {mine ? w.again : w.send}
            </button>
          </div>
        </div>
      )}

      {trouble && <p className="note bad">{trouble}</p>}
      {!wall && !trouble && <p className="empty">{w.reading}</p>}
      {wall && threads.length === 0 && <p className="empty">{noneYet}</p>}

      <div className="talk wall-list">
        {threads.map((thread) => (
          <div key={thread.head.id} className="talk-thread">
            <Said {...acts(thread.head)} />
            {thread.replies.length > 0 && (
              <div className="talk-replies">
                {thread.replies.map((one) => (
                  <Said key={one.id} {...acts(one)} />
                ))}
              </div>
            )}
            {/*
             * The box for an answer stands under the thread it answers, and not at the
             * top of the page: the box at the top is your own review, and sharing it
             * would mean an answer overwriting what you yourself said.
             */}
            {answering && (answering.to.replyTo ?? answering.to.id) === thread.head.id && (
              <div className="talk-write wall-answer">
                <p className="talk-to">
                  <Reply size={12} />
                  {w.reply_to(answering.to.by.handle)}
                  <button
                    type="button"
                    className="icon-only"
                    aria-label={w.not_reply}
                    onClick={() => setAnswering(null)}
                  >
                    <X size={12} />
                  </button>
                </p>
                <textarea
                  value={answering.said}
                  rows={2}
                  maxLength={REPLY_MAX}
                  placeholder={w.answer}
                  disabled={busy}
                  onChange={(event) =>
                    setAnswering((was) => was && { ...was, said: event.target.value })
                  }
                />
                <div className="talk-go">
                  <span className="talk-left" />
                  <button
                    type="button"
                    className="chip go"
                    disabled={busy || answering.said.trim().length === 0}
                    onClick={answer}
                  >
                    {busy ? <Loader2 size={14} className="spin" /> : <Reply size={14} />}
                    {w.reply}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {asking?.how === 'report' && (
        <CommentReport comment={asking.comment} onClose={() => setAsking(null)} />
      )}
      {asking?.how === 'take' && (
        <CommentTake
          comment={asking.comment}
          mine={asking.comment.by.id === me.id}
          site={!!me.admin}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            again();
          }}
        />
      )}
    </section>
  );
}

function liked(one: Review, on: boolean): Review {
  return { ...one, liked: on, likes: Math.max(0, one.likes + (on ? 1 : -1)) };
}

/** One review or one answer: who, when, what, and what can be done about it. */
function Said({
  one,
  me,
  onReply,
  onHeart,
  onTake,
  onReport,
}: {
  one: Review;
  me: Me;
  /** Absent when this person cannot write at all, so no button promises what is refused. */
  onReply?: (one: Review) => void;
  onHeart: (one: Review, on: boolean) => void;
  onTake: (one: Review) => void;
  onReport: (one: Review) => void;
}) {
  const w = words().wall;
  if (one.gone) {
    // Two hands and not three: a review comes off by its author's or by the site's.
    // The hand of whoever is being reviewed is deliberately not on this wall.
    return (
      <div className="talk-line gone">
        <p className="talk-said">{one.gone === 'author' ? w.gone_author : w.gone_site}</p>
      </div>
    );
  }
  const mine = one.by.id === me.id;
  return (
    <div className="talk-line" data-cid={one.id}>
      <div className="talk-who">
        {one.by.face ? (
          <img src={one.by.face} alt="" width={22} height={22} />
        ) : (
          <span className="talk-none">
            <User size={12} />
          </span>
        )}
        <span className="talk-name">{one.by.handle}</span>
        {/*
         * On the review, not on the answers under it: they are about whatever it is
         * about. Beside the name rather than after the time, because the time is
         * pushed to the far edge and the badge belongs to the words, not to the edge.
         */}
        {!one.replyTo && (
          <span className="wall-is">{one.about === 'plugin' ? w.is_plugin : w.is_site}</span>
        )}
        <span className="talk-when">{ago(one.made)}</span>
      </div>
      <p className="talk-said">{one.said}</p>
      {one.edited && (
        <p className="wall-edited">
          {w.edited} · {ago(one.edited)}
        </p>
      )}
      <div className="talk-acts">
        <Hint says={one.liked ? w.not_useful : w.useful} under>
          <button
            type="button"
            className={one.liked ? 'talk-act on' : 'talk-act'}
            aria-label={one.liked ? w.not_useful : w.useful}
            disabled={!me.signedIn}
            onClick={() => onHeart(one, !one.liked)}
          >
            <Heart size={13} />
            {one.likes > 0 && num(one.likes)}
          </button>
        </Hint>
        {onReply && (
          <Hint says={w.reply} under>
            <button type="button" className="talk-act" aria-label={w.reply} onClick={() => onReply(one)}>
              <Reply size={13} />
            </button>
          </Hint>
        )}
        {one.mayRemove && (
          <Hint says={mine ? w.take_mine : w.take} under>
            <button
              type="button"
              className="talk-act"
              aria-label={mine ? w.take_mine : w.take}
              onClick={() => onTake(one)}
            >
              <Trash2 size={13} />
            </button>
          </Hint>
        )}
        {me.signedIn && !mine && (
          <Hint says={w.report} under>
            <button type="button" className="talk-act" aria-label={w.report} onClick={() => onReport(one)}>
              <Flag size={13} />
            </button>
          </Hint>
        )}
      </div>
    </div>
  );
}
