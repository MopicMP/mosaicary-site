import type { CommentReportKind } from '../../shared/talkRules.js';
import type { Comment, Talk, TalkQueueItem } from '../../shared/talkWire.js';
import { ask, sending } from './ask.js';

/**
 * Talking to the Worker about the talk under a model.
 *
 * The comments of one model are read by the model's address; everything done to a
 * single comment goes by the comment's own address, because by then the model it
 * belongs to is the server's business and not the page's.
 */

export type { Comment, Talk, TalkQueueItem };

export function talkOf(id: string): Promise<Talk> {
  return ask(`/api/models/${id}/talk`);
}

export function sayUnder(id: string, said: string, replyTo: string | null = null): Promise<Comment> {
  return ask(`/api/models/${id}/talk`, sending('POST', { said, replyTo }));
}

/**
 * Taking one off. `said` is the reason, and is asked for unless it is one's own;
 * `rule` is the clause it broke, asked for when the site takes it off.
 */
export function dropComment(cid: string, said = '', rule: string | null = null): Promise<{ ok: true; gone: string }> {
  return ask(`/api/talk/${cid}`, sending('DELETE', { said, rule }));
}

export function likeComment(cid: string, on: boolean): Promise<{ likes: number; liked: boolean }> {
  return ask(`/api/talk/${cid}/like`, sending(on ? 'POST' : 'DELETE'));
}

export function reportComment(cid: string, kind: CommentReportKind, said: string): Promise<{ ok: true }> {
  return ask(`/api/talk/${cid}/report`, sending('POST', { kind, said }));
}

export function talkQueue(): Promise<TalkQueueItem[]> {
  return ask('/api/admin/talk');
}
