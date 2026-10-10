import type { Facts, Prepared } from '../../shared/bbmodel.js';
import type { License, ReportKind } from '../../shared/modelRules.js';
import type { Look, ModelDetail, ModelSummary, Notice, QueueItem, Refused } from '../../shared/modelWire.js';
import { ask, sending } from './ask.js';

/**
 * Talking to the Worker about models.
 *
 * One module, so that "what the server calls things" is a fact in one place. How a
 * request is made and how a refusal arrives is in `ask.ts`, which the talk under a
 * model shares.
 */

export type { ModelDetail, ModelSummary, Notice, QueueItem, Refused };
export { isRefused, sayWhy } from './ask.js';

export function modelsFromApi(): Promise<ModelSummary[]> {
  return ask('/api/models');
}

export function myModels(): Promise<ModelSummary[]> {
  return ask('/api/models?mine=1');
}

export function myLikes(): Promise<string[]> {
  return ask<string[]>('/api/models/liked').catch(() => []);
}

export function modelDetail(id: string): Promise<ModelDetail> {
  return ask(`/api/models/${id}`);
}

/** Where the file itself is. `view` is a look rather than a download, and is not counted. */
export function fileOf(id: string, view = false): string {
  return `/api/models/${id}/file${view ? '?for=view' : ''}`;
}

/**
 * Puts one prepared model up, in the three steps the server takes it in.
 *
 * The row first, with what the page counted; then the file, which the bucket checks
 * against the hash as it arrives; then the picture. A model whose file never arrives
 * stays invisible and is swept away within the hour, so a closed tab halfway through
 * leaves nothing behind but a retry.
 *
 * `already` is the server recognising the same bytes from the same person, in which
 * case nothing is sent twice.
 */
export async function sendModel(
  ready: Prepared,
  about: {
    name: string;
    description: string;
    tags: string[];
    license?: License | null;
    background?: string | null;
    look?: Look | null;
  },
  preview: Blob | null,
  onStep?: (step: 'row' | 'file' | 'preview') => void,
): Promise<{ id: string; already: boolean }> {
  onStep?.('row');
  const begun = await ask<{ id: string; already: boolean }>(
    '/api/models',
    sending('POST', {
      ...about,
      sha256: ready.sha256,
      bytes: ready.bytes.byteLength,
      print: ready.print,
      shape: ready.shape,
      facts: ready.facts,
    }),
  );
  if (begun.already) return begun;

  onStep?.('file');
  await ask(`/api/models/${begun.id}/file`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: ready.bytes as BodyInit,
  });

  if (preview) {
    onStep?.('preview');
    // A model without its picture is still a model; the card draws a placeholder and
    // the owner can try again from the window.
    await putPreview(begun.id, preview).catch(() => undefined);
  }
  return begun;
}

export function putPreview(id: string, picture: Blob): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/preview`, {
    method: 'PUT',
    headers: { 'content-type': picture.type || 'image/webp' },
    body: picture,
  });
}

export function changeModel(
  id: string,
  about: {
    name?: string;
    description?: string;
    tags?: string[];
    adult?: boolean;
    over18?: boolean;
    background?: string | null;
    look?: Look | null;
  },
): Promise<{ ok: true }> {
  return ask(`/api/models/${id}`, sending('PATCH', about));
}

export function dropModel(id: string): Promise<{ ok: true }> {
  return ask(`/api/models/${id}`, sending('DELETE'));
}

export function publishModel(
  id: string,
  said: { license: License; author?: string; url?: string; adult: boolean; over18?: boolean },
): Promise<{ ok: true; near: string | null }> {
  return ask(`/api/models/${id}/publish`, sending('POST', said));
}

export function hideModel(id: string): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/hide`, sending('POST'));
}

export function likeModel(id: string, on: boolean): Promise<{ likes: number; liked: boolean }> {
  return ask(`/api/models/${id}/like`, sending(on ? 'POST' : 'DELETE'));
}

export function reportModel(id: string, kind: ReportKind, said: string): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/report`, sending('POST', { kind, said }));
}

/**
 * Tells the server what this page counted in the file it opened, or that it could
 * not read the file as a model at all.
 *
 * Every signed-in page that opens a model does this once, quietly. The uploader's
 * page said what was inside and the server could not check; the thousandth page to
 * open it is a thousand checks, and a disagreement is put in front of a person.
 */
export function doubtModel(id: string, facts: Facts | 'unreadable'): Promise<{ same: boolean }> {
  return ask(`/api/models/${id}/doubt`, sending('POST', facts === 'unreadable' ? { unreadable: true } : { facts }));
}

/** `rule` is the key of the clause the model broke, which the notice to its owner cites. */
export function takeDown(id: string, said: string, rule: string): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/takedown`, sending('POST', { said, rule }));
}

export function restore(id: string, said: string): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/restore`, sending('POST', { said }));
}

/**
 * Whoever runs the site marking a model 18+, or taking the mark off.
 *
 * What the owner cannot do themselves afterwards, which is why it is a separate
 * route rather than an edit made on their behalf.
 */
export function markAdult(id: string, adult: boolean, said = ''): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/adult`, sending('POST', { adult, said }));
}

/** Looked at, nothing wrong: the reports are answered and the model stays. */
export function settle(id: string): Promise<{ ok: true }> {
  return ask(`/api/models/${id}/settle`, sending('POST'));
}

export function noticesFor(): Promise<Notice[]> {
  return ask<Notice[]>('/api/notices').catch(() => []);
}

export function noticesSeen(): Promise<void> {
  return ask('/api/notices/seen', sending('POST')).then(
    () => undefined,
    () => undefined,
  );
}

export function adminQueue(): Promise<QueueItem[]> {
  return ask('/api/admin/queue');
}

/** The rules changed: every account is told, since there is no address to write to. */
export function tellPolicy(said: string): Promise<{ sent: number }> {
  return ask('/api/admin/policy', sending('POST', { said }));
}
