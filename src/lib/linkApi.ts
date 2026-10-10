import type { LinkAsked } from '../../shared/linkWire.js';
import { ask, sending } from './ask.js';

/**
 * The site's half of signing a program in: what is being asked, and the answer.
 *
 * Three routes, all of them from the site's own pages and signed in. The other two —
 * starting a request and collecting the key — belong to the plugin and are never
 * called from here: the page and the plugin never talk to each other, which is the
 * whole shape of this (shared/linkWire.ts).
 */

export function askedLink(code: string): Promise<LinkAsked> {
  return ask<LinkAsked>(`/api/link/${code}`);
}

export function answerLink(code: string, yes: boolean): Promise<{ ok: true }> {
  return ask<{ ok: true }>(`/api/link/${code}/${yes ? 'allow' : 'deny'}`, sending('POST'));
}
