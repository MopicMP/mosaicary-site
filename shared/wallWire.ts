import type { Comment } from './talkWire.js';
import type { About, Subject } from './wallRules.js';

/**
 * What the Worker sends about the wall of reviews, in one place for both ends.
 *
 * Plain data, like `talkWire.ts`, and built on it: a review is a comment with two
 * things more — what it is about, and whether its author has rewritten it since.
 */

export interface Review extends Comment {
  about: About;
  /** When the author last rewrote it, or null. Only a review can be rewritten. */
  edited: string | null;
}

export interface Wall {
  /** Reviews and the answers to them, newest review first. */
  reviews: Review[];
  /** How many reviews each thing has, the answers and the ones taken off not counted. */
  counts: Record<Subject, number>;
  /**
   * This person's own reviews, at most one per thing.
   *
   * Sent rather than found in the list, because the list stops at two hundred and
   * somebody's own review has to be in front of them whatever else is on the wall.
   */
  mine: Review[];
  /** Whether this person may write at all: signed in, and not barred. */
  mayWrite: boolean;
}
