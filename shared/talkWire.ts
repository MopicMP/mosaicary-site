import type { Person } from './modelWire.js';

/**
 * What the Worker sends about the talk under a model, in one place for both ends.
 *
 * Plain data only, like `modelWire.ts`: the page and the Worker both import this and
 * neither drags the other's runtime along.
 */

/** Who took a comment off. Words, not a flag: "deleted" alone reads as censorship. */
export type GoneBy = 'author' | 'owner' | 'site';

export interface Comment {
  id: string;
  by: Person;
  /** Empty for one that was taken off. */
  said: string;
  made: string;
  /** Null for one that starts a thread; otherwise the comment it answers. */
  replyTo: string | null;
  likes: number;
  /** Whether the person looking has their heart on it. */
  liked: boolean;
  /** Whether the person looking may take it off, which is not the same as who wrote it. */
  mayRemove: boolean;
  /** Null while it is there. */
  gone: GoneBy | null;
}

/** One comment with the answers to it. Replies are one level deep and never nest. */
export interface Thread {
  head: Comment;
  replies: Comment[];
}

/** A comment waiting for whoever runs the site to look at it. */
export interface TalkQueueItem {
  comment: Comment;
  /** Null for a review of the work: there is no model behind it to open. */
  model: { id: string; name: string } | null;
  /** 'model', or which thing it is a review of: see `wallRules.ts`. */
  about: string;
  reports: { kind: string; said: string; made: string; by: string | null }[];
}

export interface Talk {
  comments: Comment[];
  /** How many are there, the ones taken off not counted. */
  count: number;
  /** Whether this person may write at all: signed in, and not barred. */
  mayWrite: boolean;
}
