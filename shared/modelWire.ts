import type { Use } from './modelRules.js';

/**
 * What the Worker sends about models, in one place for both ends.
 *
 * Plain data only — no functions and nothing that needs the DOM or the Workers
 * runtime — so the page and the Worker can both import it without either dragging
 * the other's types along.
 */

export interface Person {
  id: string;
  handle: string;
  face: string | null;
}

/**
 * Where the camera stands to show a model: which way round and how far up, in radians.
 *
 * Here rather than beside the drawing code because it travels: an author chooses it
 * while uploading, the Worker keeps it, and the card picture, the window and the
 * Blockbench plugin all open the model from it.
 */
export interface Look {
  spin: number;
  tilt: number;
}

/** One model as a card in the catalogue: everything the filters and the card need. */
export interface ModelSummary {
  id: string;
  name: string;
  format: string;
  use: Use;
  version: string;
  boxUv: boolean;
  cubes: number;
  meshes: number;
  bones: number;
  animations: number;
  textures: number;
  textureWidth: number;
  textureHeight: number;
  density: number;
  bytes: number;
  tags: string[];
  license: string | null;
  /** Who made it, when the person uploading said it was somebody else. */
  author: { name: string; url: string | null } | null;
  /** Who uploaded it. Never "who made it". */
  by: Person;
  /** Null for a model that has never been public. */
  published: string | null;
  created: string;
  updated: string;
  downloads: number;
  /** Hearts: how many people liked it. */
  likes: number;
  /** How many comments there are, the ones taken off not counted. */
  comments: number;
  /** Address of the picture, or null while there is none. Changes when the model does. */
  preview: string | null;
  visibility: 'private' | 'public';
  /** Only ever true in the owner's own list or for whoever runs the site. */
  hidden: boolean;
  /** For adults. Never sent to somebody who has them hidden, except the owner. */
  adult: boolean;
  /** The colour its author put behind it, `#rrggbb`; null for none. */
  background: string | null;
  /**
   * The angle its author showed it from, or null for the one angle every model used
   * before anybody could choose: a model whose front is not where the editor's north
   * is turned up back-first, and only its author knows which side is its face.
   */
  look: Look | null;
}

/** One model opened in its own window. */
export interface ModelDetail extends ModelSummary {
  description: string;
  sha256: string;
  print: string;
  shape: string;
  mine: boolean;
  /** Whether the person looking has their heart on it. */
  liked: boolean;
  /** Whether the person looking may take it down. */
  admin: boolean;
  /** Marked for adults by whoever runs the site, so the owner cannot take the mark off. */
  adultFixed: boolean;
  /** Only sent to whoever runs the site. */
  doubted?: boolean;
  reports?: number;
}

/** A model waiting for whoever runs the site to look at it. */
export interface QueueItem extends ModelSummary {
  doubted: boolean;
  reports: { kind: string; said: string; made: string; by: string | null }[];
}

export interface Notice {
  id: string;
  kind: string;
  about: string | null;
  said: string;
  made: string;
  seen: boolean;
  /** The clause of the rules a decision against somebody cites, by its key; null otherwise. */
  rule: string | null;
}

/** Why something was refused, in words for a person, with what the page needs to act on it. */
export interface Refused {
  error: string;
  /** The model this one collided with, so the person can be sent to look at it. */
  against?: string;
  /** Whether this is the second time, which is what the wait hangs on. */
  again?: boolean;
  barredUntil?: string;
}
