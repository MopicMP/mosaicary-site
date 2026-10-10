import type { Subject, WallNo } from '../../shared/wallRules.js';
import { WALL_SAID } from '../../shared/wallRules.js';
import type { Review, Wall } from '../../shared/wallWire.js';
import { ask, sayWhy, sending } from './ask.js';
import { words } from './words.js';

/**
 * Talking to the Worker about the wall of reviews.
 *
 * The wall is read and written by its own address; everything done to one review —
 * a heart, a report, taking it off — goes by the review's own address, the same one a
 * comment uses, because a review is a comment with a subject (see `wall.ts`).
 */

export type { Review, Wall };

export function wallOf(about: Subject | null): Promise<Wall> {
  return ask(about ? `/api/feedback?about=${about}` : '/api/feedback');
}

export function sayOn(about: Subject, said: string): Promise<Review> {
  return ask('/api/feedback', sending('POST', { about, said }));
}

export function answerOn(replyTo: string, said: string): Promise<Review> {
  return ask('/api/feedback', sending('POST', { replyTo, said }));
}

export function rewriteMine(id: string, said: string): Promise<{ ok: true; said: string; edited: string }> {
  return ask(`/api/talk/${id}`, sending('PATCH', { said }));
}

/**
 * Why the server refused, in the language on screen.
 *
 * The Worker answers with a code and an English sentence behind it. An unknown code
 * shows the English rather than "не получилось": the sentence is at least about what
 * happened, and a code nobody translated yet is our fault, not the visitor's.
 */
export function sayNo(thing: unknown): string {
  const said = thing as { no?: string; error?: string } | null;
  const code = said?.no;
  if (code && code in WALL_SAID) {
    const known = words().wall.no as Record<string, string | undefined>;
    return known[code] ?? WALL_SAID[code as WallNo];
  }
  return said?.error ?? sayWhy(thing);
}
