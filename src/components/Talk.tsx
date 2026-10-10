import { Flag, Heart, Loader2, MessageCircle, Reply, Send, Trash2, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { COMMENT_MAX, goneWords, threadsOf } from '../../shared/talkRules.js';
import type { Comment, Talk as TalkSaid } from '../../shared/talkWire.js';
import type { Me } from '../lib/me.js';
import { likeComment, sayUnder, talkOf } from '../lib/talkApi.js';
import { sayWhy } from '../lib/ask.js';
import { ago } from '../lib/when.js';
import { Hint } from './Hint.js';
import { CommentReport, CommentTake } from './ModelAsks.js';

/**
 * What people say under one model.
 *
 * <h2>Why it is here and not on a page of its own</h2>
 *
 * A comment under a model is about that model — which version its rig is for, what the
 * missing texture was called, whether it works in Bedrock. Read anywhere else it is a
 * remark about nothing, so it lives in the same window as the figure it is about.
 *
 * <h2>One level of answers</h2>
 *
 * A reply hangs under the comment it answers and nothing hangs under the reply.
 * Pressing "ответить" under an answer answers the same thread, which is what the
 * server does with it too — the person pressed it under the words they were reading,
 * and a staircase of indents is unreadable in a column this wide anyway.
 *
 * <h2>What appears at once and what is asked twice</h2>
 *
 * Writing appears at once: the comment comes back from the server and goes straight
 * into the list. Everything that takes something away — removing, reporting — is asked
 * in the same little window as every other decision on the site, because those cannot
 * be undone by pressing again.
 */
export function Talk({
  id,
  me,
  onChanged,
  onCount,
}: {
  id: string;
  me: Me;
  /** Something was said or taken off, and the lists outside want asking again. */
  onChanged: () => void;
  /** How many there are now, for the heading over this panel to show. */
  onCount?: (count: number) => void;
}) {
  const [talk, setTalk] = useState<TalkSaid | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState<{ how: 'report' | 'take'; comment: Comment } | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  /** Just written, and worth scrolling to once. */
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setTalk(null);
    setSaid('');
    setReplyTo(null);
    setTrouble(null);
    talkOf(id).then(
      (got) => alive && setTalk(got),
      (why) => alive && setTrouble(sayWhy(why)),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (talk) onCount?.(talk.count);
  }, [talk, onCount]);

  // A comment written at the bottom of a panel this short lands below the edge of it,
  // and the panel not moving reads as the comment not having been written. So the new
  // one is brought into view once, as gently as this person's settings allow.
  useEffect(() => {
    if (!fresh) return;
    const made = list.current?.querySelector(`[data-cid="${fresh}"]`);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    made?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    setFresh(null);
  }, [fresh]);

  const again = () => {
    talkOf(id).then(setTalk, (why) => setTrouble(sayWhy(why)));
    onChanged();
  };

  const send = () => {
    setSending(true);
    setTrouble(null);
    sayUnder(id, said, replyTo?.id ?? null)
      .then(
        (made) => {
          setTalk((was) =>
            was ? { ...was, comments: [...was.comments, made], count: was.count + 1 } : was,
          );
          setSaid('');
          setReplyTo(null);
          setFresh(made.id);
          onChanged();
        },
        (why) => setTrouble(sayWhy(why)),
      )
      .finally(() => setSending(false));
  };

  const answer = (comment: Comment) => {
    setReplyTo(comment);
    field.current?.focus();
  };

  /** One comment, replaced in the list by whatever is made of it. */
  const over = (cid: string, made: (one: Comment) => Comment) =>
    setTalk((was) => was && { ...was, comments: was.comments.map((one) => (one.id === cid ? made(one) : one)) });

  const heart = (comment: Comment, on: boolean) => {
    // Shown before the server answers and put back if it refuses: a heart that waits
    // for a round trip feels broken, and nothing depends on the number being exact.
    over(comment.id, (one) => liked(one, on));
    likeComment(comment.id, on).then(
      (answered) => over(comment.id, (one) => ({ ...one, likes: answered.likes, liked: answered.liked })),
      (why) => {
        setTrouble(sayWhy(why));
        over(comment.id, (one) => liked(one, !on));
      },
    );
  };

  const threads = threadsOf(talk?.comments ?? []);

  return (
    <>
      <div className="talk" ref={list}>
        {me.signedIn && talk?.mayWrite && (
          <div className="talk-write">
            {replyTo && (
              <p className="talk-to">
                <Reply size={12} />
                Ответ: {replyTo.by.handle}
                <button
                  type="button"
                  className="icon-only"
                  aria-label="Не отвечать"
                  onClick={() => setReplyTo(null)}
                >
                  <X size={12} />
                </button>
              </p>
            )}
            <textarea
              ref={field}
              value={said}
              rows={3}
              maxLength={COMMENT_MAX}
              placeholder={replyTo ? 'Что ответить' : 'Что сказать об этой модели'}
              disabled={sending}
              onChange={(event) => setSaid(event.target.value)}
            />
            <div className="talk-go">
              <span className="talk-left">
                {said.length > COMMENT_MAX - 200 && `${COMMENT_MAX - said.length} знаков осталось`}
              </span>
              <button
                type="button"
                className="chip go"
                disabled={said.trim().length === 0 || sending}
                onClick={send}
              >
                {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                {replyTo ? 'Ответить' : 'Написать'}
              </button>
            </div>
          </div>
        )}
        {!me.signedIn && <p className="empty">Комментарии пишут те, кто вошёл</p>}
        {me.signedIn && talk && !talk.mayWrite && <p className="empty">Писать комментарии пока нельзя</p>}

        {trouble && <p className="note bad">{trouble}</p>}
        {!talk && !trouble && <p className="empty">Читаю комментарии…</p>}
        {talk && threads.length === 0 && <p className="empty">Пока ничего не сказано</p>}

        {threads.map((thread) => (
          <div key={thread.head.id} className="talk-thread">
            <Line
              comment={thread.head}
              me={me}
              onReply={talk?.mayWrite ? answer : undefined}
              onHeart={heart}
              onTake={(comment) => setAsking({ how: 'take', comment })}
              onReport={(comment) => setAsking({ how: 'report', comment })}
            />
            {thread.replies.length > 0 && (
              <div className="talk-replies">
                {thread.replies.map((one) => (
                  <Line
                    key={one.id}
                    comment={one}
                    me={me}
                    onReply={talk?.mayWrite ? answer : undefined}
                    onHeart={heart}
                    onTake={(comment) => setAsking({ how: 'take', comment })}
                    onReport={(comment) => setAsking({ how: 'report', comment })}
                  />
                ))}
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
    </>
  );
}

function liked(comment: Comment, on: boolean): Comment {
  return { ...comment, liked: on, likes: Math.max(0, comment.likes + (on ? 1 : -1)) };
}

/** One comment: who, when, what, and the three things that can be done about it. */
function Line({
  comment,
  me,
  onReply,
  onHeart,
  onTake,
  onReport,
}: {
  comment: Comment;
  me: Me;
  /** Absent when this person cannot write at all, so no button promises what is refused. */
  onReply?: (comment: Comment) => void;
  onHeart: (comment: Comment, on: boolean) => void;
  onTake: (comment: Comment) => void;
  onReport: (comment: Comment) => void;
}) {
  if (comment.gone) {
    return (
      <div className="talk-line gone">
        <p className="talk-said">{goneWords(comment.gone)}</p>
      </div>
    );
  }
  const mine = comment.by.id === me.id;
  return (
    <div className="talk-line" data-cid={comment.id}>
      <div className="talk-who">
        {comment.by.face ? (
          <img src={comment.by.face} alt="" width={22} height={22} />
        ) : (
          <span className="talk-none">
            <User size={12} />
          </span>
        )}
        <span className="talk-name">{comment.by.handle}</span>
        <span className="talk-when">{ago(comment.made)}</span>
      </div>
      <p className="talk-said">{comment.said}</p>
      <div className="talk-acts">
        <Hint says={comment.liked ? 'Больше не нравится' : 'Нравится'} under>
          <button
            type="button"
            className={comment.liked ? 'talk-act on' : 'talk-act'}
            aria-label={comment.liked ? 'Больше не нравится' : 'Нравится'}
            disabled={!me.signedIn}
            onClick={() => onHeart(comment, !comment.liked)}
          >
            <Heart size={13} />
            {comment.likes > 0 && comment.likes.toLocaleString('ru')}
          </button>
        </Hint>
        {onReply && (
          <Hint says="Ответить" under>
            <button
              type="button"
              className="talk-act"
              aria-label="Ответить"
              onClick={() => onReply(comment)}
            >
              <Reply size={13} />
            </button>
          </Hint>
        )}
        {comment.mayRemove && (
          <Hint says={mine ? 'Удалить свой комментарий' : 'Снять комментарий'} under>
            <button
              type="button"
              className="talk-act"
              aria-label={mine ? 'Удалить' : 'Снять'}
              onClick={() => onTake(comment)}
            >
              <Trash2 size={13} />
            </button>
          </Hint>
        )}
        {me.signedIn && !mine && (
          <Hint says="Пожаловаться на комментарий" under>
            <button
              type="button"
              className="talk-act"
              aria-label="Пожаловаться"
              onClick={() => onReport(comment)}
            >
              <Flag size={13} />
            </button>
          </Hint>
        )}
      </div>
    </div>
  );
}

/** The heading over the panel, with how many there are. */
export function TalkHead({ count }: { count: number }) {
  return (
    <span className="talk-head">
      <MessageCircle size={13} />
      {count > 0 ? count.toLocaleString('ru') : ''}
    </span>
  );
}
