import type { Comment, GoneBy } from './talkWire.js';

/**
 * The rules about comments that both sides keep.
 *
 * Same split as `modelRules.ts`: the page asks first so a person is told "too long"
 * before anything is sent, and the Worker asks again because the page is the one thing
 * a stranger gets to replace.
 */

/**
 * The longest a comment may be.
 *
 * A thousand characters is some fifteen lines — room to explain what is wrong with a
 * model's rig, which is the longest useful thing anybody writes under one, and short
 * enough that no single comment can push the rest of a conversation off the screen.
 * Not measured against anything: there is nobody commenting yet.
 */
export const COMMENT_MAX = 1000;

/**
 * How long between one person's comments, and how many of them an hour.
 *
 * Both are guesses, and deliberately loose: they are here to stop a script, not to
 * pace a conversation. Somebody answering three people in a row hits neither.
 */
export const COMMENT_GAP_MS = 15_000;
export const COMMENTS_PER_HOUR = 30;

/** How many are sent at once. Beyond this a model's talk is read in the database. */
export const TALK_SHOWN = 200;

/**
 * The shortest reason for taking somebody else's comment off.
 *
 * Not a measure of a good reason — three characters is "спам" minus a letter. It is
 * there so the field cannot be walked past empty: whoever wrote the comment is told
 * these words and nothing else, and "" would be a decision with no reason given,
 * which is the one thing article 17 of Regulation (EU) 2022/2065 does not allow.
 */
export const TAKE_WHY_MIN = 3;

/**
 * What can be reported about a comment.
 *
 * Shorter than the list for models, and for the same reason: each kind is answered
 * differently, and nothing is reportable for being disagreed with. The rules forbid
 * unlawful speech, going after a person, spam and other people's private data — so
 * there are four, plus the one for whatever was not foreseen.
 */
export const COMMENT_REPORT_KINDS = ['unlawful', 'abuse', 'spam', 'private', 'other'] as const;
export type CommentReportKind = (typeof COMMENT_REPORT_KINDS)[number];

export const COMMENT_REPORT_NAMES: Record<CommentReportKind, string> = {
  unlawful: 'Нарушает закон',
  abuse: 'Оскорбления или травля',
  spam: 'Спам или реклама',
  private: 'Личные данные',
  other: 'Другое',
};

export function isCommentReportKind(value: unknown): value is CommentReportKind {
  return typeof value === 'string' && (COMMENT_REPORT_KINDS as readonly string[]).includes(value);
}

/**
 * A comment as it will be stored.
 *
 * Line breaks survive, because a person explaining two things writes two paragraphs,
 * and everything else that can be typed invisibly does not: control characters, lone
 * carriage returns, and runs of empty lines used to take up the page.
 */
export function cleanComment(value: unknown, max = COMMENT_MAX): string {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** What the page sends to write a comment, checked for shape. */
export interface Writing {
  said: string;
  /** The comment being answered, or null for a new thread. */
  replyTo: string | null;
}

export function readWriting(body: unknown): Writing | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'пустой запрос' };
  const given = body as Record<string, unknown>;
  const said = cleanComment(given.said);
  if (!said) return { error: 'напиши, что сказать' };
  const to = given.replyTo;
  if (to !== undefined && to !== null && (typeof to !== 'string' || !/^[0-9A-Za-z]{12}$/.test(to))) {
    return { error: 'непонятно, на что это ответ' };
  }
  return { said, replyTo: typeof to === 'string' ? to : null };
}

/** What a comment that was taken off says in place of what was written. */
export function goneWords(by: GoneBy): string {
  if (by === 'author') return 'Автор удалил этот комментарий.';
  if (by === 'owner') return 'Комментарий снят автором модели.';
  return 'Комментарий снят тем, кто ведёт сайт.';
}

/**
 * The flat list as threads, oldest first, with each thread's answers under it.
 *
 * A comment that was taken off is kept in place only while somebody has answered it:
 * its row is what the answers hang from, and dropping it would hide them too. With
 * nothing hanging from it there is nothing to hold the space for, and it goes.
 *
 * A reply whose parent is not in the list — taken off and swept, or past the limit —
 * is shown as a thread of its own rather than silently lost.
 *
 * Takes whatever a comment is at the time: a review is a comment with a subject and a
 * date it was rewritten on, and the wall of reviews is threaded by this same function
 * rather than by a second copy of it that would stop matching this one.
 */
export function threadsOf<T extends Comment>(comments: readonly T[]): { head: T; replies: T[] }[] {
  const heads: { head: T; replies: T[] }[] = [];
  const byId = new Map<string, { head: T; replies: T[] }>();
  for (const one of comments) {
    if (one.replyTo) continue;
    const thread: { head: T; replies: T[] } = { head: one, replies: [] };
    byId.set(one.id, thread);
    heads.push(thread);
  }
  for (const one of comments) {
    if (!one.replyTo) continue;
    const thread = byId.get(one.replyTo);
    if (thread) thread.replies.push(one);
    else heads.push({ head: one, replies: [] });
  }
  heads.sort((a, b) => (a.head.made < b.head.made ? -1 : a.head.made > b.head.made ? 1 : 0));
  for (const thread of heads) {
    thread.replies.sort((a, b) => (a.made < b.made ? -1 : a.made > b.made ? 1 : 0));
  }
  return heads.filter((thread) => !thread.head.gone || thread.replies.some((one) => !one.gone));
}
