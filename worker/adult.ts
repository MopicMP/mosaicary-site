import { closedIn, closedList } from '../shared/adult.js';
import type { Ctx } from './reply.js';

/**
 * Whether models for adults are closed where this request comes from.
 *
 * By Cloudflare's reading of the address, which is all a Worker has. A request it
 * places nowhere is not treated as closed, which is what a local run looks like.
 */
export function closedHere(c: Ctx): boolean {
  return closedIn(c.country, closedList(c.env.ADULT_CLOSED));
}
