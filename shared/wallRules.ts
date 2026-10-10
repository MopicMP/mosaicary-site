import { COMMENT_MAX, cleanComment } from './talkRules.js';

/**
 * The rules about reviews of the work, kept by the page, the Worker and the plugin.
 *
 * A review is a comment with a subject: the same row, the same heart, the same report,
 * the same removal with a reason its author is told. What is different is here and
 * nowhere else — which things can be reviewed, how long a review may be, and the one
 * per person.
 */

/**
 * What can be reviewed: the plugin and the site, apart.
 *
 * Her decision of 9 October. Two things and not one, because "it crashes on import"
 * and "the catalogue is hard to search" are complaints to two different places, and a
 * single wall mixing them tells neither of them anything. Two and not more, because
 * there are two things to use — a plugin and a site — and a list of subjects nobody
 * writes under is a list that reads as an empty shop.
 */
export const SUBJECTS = ['plugin', 'site'] as const;
export type Subject = (typeof SUBJECTS)[number];

/** What a comment is about: one of the subjects, or the model it hangs under. */
export type About = Subject | 'model';

export function isSubject(value: unknown): value is Subject {
  return typeof value === 'string' && (SUBJECTS as readonly string[]).includes(value);
}

/**
 * The longest a review may be, against a thousand for a comment.
 *
 * A review is about the whole of something, which is a longer thing to say than what
 * is wrong with one rig. Twice is not measured against anybody's reviews — there are
 * none yet — but it is the ceiling a model's description already has, so neither the
 * database nor the limit on a request body needs moving for it.
 */
export const REVIEW_MAX = 2000;

/** An answer to a review is as long as a comment: it answers one, it does not replace it. */
export const REPLY_MAX = COMMENT_MAX;

/**
 * Why something was refused, as a code.
 *
 * The Worker answers `{ no: 'wall_already', error: '...' }` and whoever got it says it
 * in their own language — the page from its dictionary, the plugin from its own table.
 * The English sentence travels along for two readers: somebody who came to the API
 * directly, and a version of the page that does not know this code yet.
 */
export const WALL_SAID = {
  wall_empty: 'write what you want to say',
  wall_no_thing: 'say what the review is about: the plugin or the site',
  wall_bad_reply: 'it is unclear what this answers',
  wall_already: 'you have already reviewed this, rewrite that one instead',
  wall_not_mine: 'this review is not yours',
  wall_gone: 'this review is no longer there',
  wall_often: 'wait a couple of seconds before writing again',
  wall_hour: 'that is enough for this hour, carry on later',
  wall_barred: 'writing is not allowed for now',
} as const;

export type WallNo = keyof typeof WALL_SAID;

/** A review as it will be stored. The same cleaning as a comment, with more room. */
export function cleanReview(value: unknown, reply: boolean): string {
  return cleanComment(value, reply ? REPLY_MAX : REVIEW_MAX);
}

/** What the page or the plugin sends to write a review or answer one. */
export interface Writing {
  /** Null for an answer: an answer is about whatever it answers. */
  about: Subject | null;
  said: string;
  replyTo: string | null;
}

export function readReview(body: unknown): Writing | { no: WallNo } {
  if (!body || typeof body !== 'object') return { no: 'wall_empty' };
  const given = body as Record<string, unknown>;

  const to = given.replyTo;
  const answering = to !== undefined && to !== null && to !== '';
  if (answering && (typeof to !== 'string' || !/^[0-9A-Za-z]{12}$/.test(to))) {
    return { no: 'wall_bad_reply' };
  }

  const said = cleanReview(given.said, answering);
  if (!said) return { no: 'wall_empty' };

  if (answering) return { about: null, said, replyTo: to as string };
  if (!isSubject(given.about)) return { no: 'wall_no_thing' };
  return { about: given.about, said, replyTo: null };
}
