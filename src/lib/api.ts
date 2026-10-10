import type { Gender, Layout, Skin } from './catalogue.js';

/**
 * Talking to our own back end.
 *
 * One module, so that "what the server calls things" is a fact in one place. The
 * shapes it hands back are turned into the shapes the pages already use here, at
 * the edge — a page that knows both is a page that has to be changed twice.
 */

/**
 * What is known about who drew a skin.
 *
 * Four states rather than a name, because the difference between them is the whole
 * mechanism. `claimed` and `confirmed` are printed differently on purpose: a name
 * with nothing beside it is a name nobody checked, and if the page draws those two
 * the same way then saying it is yours costs nothing and everybody says it.
 */
export interface Author {
  state: 'none' | 'first' | 'named';
  name: string | null;
  url: string | null;
}


export interface Mine extends Skin {
  /** Whether this one is yours to rename, mark or throw away. */
  mine: boolean;
  /** Who put it here. Never "who drew it". */
  uploader: string;
  author: Author;
  published: boolean;
  /** How it got onto the showcase. 'first' for everything published now. */
  origin: string | null;
}

/** Why publishing was refused, when it was. */
export interface Refused {
  error: string;
  against?: string;
  verdict?: 'same' | 'close';
  again?: boolean;
  barredUntil?: string;
}

interface Sent {
  id: string;
  name: string;
  uploader: string;
  author: Author;
  fingerprint: string;
  url: string;
  width: number;
  layout: number;
  gender: string;
  tags: string[];
  mask: string | null;
  hasOverlay: boolean;
  uploaded: string;
  stars: number;
  mine: boolean;
  published: boolean;
  origin: string | null;
}

function ours(sent: Sent): Mine {
  return {
    ...sent,
    layout: (sent.layout === 32 ? 32 : 64) as Layout,
    gender: (['girl', 'boy', 'neutral'].includes(sent.gender) ? sent.gender : 'neutral') as Gender,
    // The catalogue's own field, kept for the parts that only ever want one name
    // to print. Which name it is depends on what is actually known.
    author: sent.author,
  };
}

async function ask<T>(url: string, how?: RequestInit): Promise<T> {
  const answer = await fetch(url, { credentials: 'same-origin', ...how });
  if (!answer.ok) {
    // The server says why in words meant for a person; anything else is a number
    // nobody can act on, and "500" on a page is the same as saying nothing.
    const said = (await answer.json().catch(() => null)) as Refused | null;
    // Thrown whole rather than as a message, because a refusal to publish carries
    // more than one sentence: which skin it collided with, and whether this has
    // happened before.
    if (said?.error) throw said;
    throw new Error(`не получилось (${answer.status})`);
  }
  return (await answer.json()) as T;
}

export async function skinsFromApi(mine = false): Promise<Mine[]> {
  const sent = await ask<Sent[]>(`/api/skins${mine ? '?mine=1' : ''}`);
  return sent.map(ours);
}

/**
 * Sends one picture up, as itself.
 *
 * The bytes are the body and everything else is in the address. Wrapped in a form
 * they would be base64 on the way — a third larger, and four megabytes through a
 * parser that has no business seeing them.
 */
export async function sendSkin(
  file: File,
  about: { name: string; gender: Gender; tags: string[] },
): Promise<{ id: string; already: boolean }> {
  const query = new URLSearchParams({
    name: about.name,
    gender: about.gender,
    tags: about.tags.join(','),
  });
  return ask(`/api/skins?${query.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: file,
  });
}

export async function renameSkin(
  id: string,
  about: { name?: string; gender?: Gender; tags?: string[] },
): Promise<void> {
  await ask(`/api/skins/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(about),
  });
}

export async function dropSkin(id: string): Promise<void> {
  await ask(`/api/skins/${id}`, { method: 'DELETE' });
}

export async function publishSkin(
  id: string,
  said: { author?: string; url?: string } = {},
): Promise<{ ok: true; near: { against: string; apart: number } | null }> {
  return ask(`/api/skins/${id}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(said),
  });
}

export async function hideSkin(id: string): Promise<void> {
  await ask(`/api/skins/${id}/hide`, { method: 'POST' });
}

export interface Notice {
  id: string;
  kind: string;
  about: string | null;
  said: string;
  made: string;
  seen: boolean;
}

export async function noticesFor(): Promise<Notice[]> {
  try {
    return await ask<Notice[]>('/api/notices');
  } catch {
    // Not signed in, or offline. Having nothing to tell somebody is not an error
    // worth putting on a page.
    return [];
  }
}

export async function noticesSeen(): Promise<void> {
  await ask('/api/notices/seen', { method: 'POST' }).catch(() => undefined);
}

/**
 * What is wrong with a file before it is sent anywhere.
 *
 * The same rules the server keeps, asked here first — not instead. A check only in
 * the browser is no check at all, since the page doing it is the page an attacker
 * replaced. What it buys is being told now rather than after four megabytes have
 * gone up the wire.
 */
export function wrongWith(file: File): string | null {
  if (!/\.png$/i.test(file.name) && file.type !== 'image/png') return 'это не PNG';
  if (file.size === 0) return 'файл пустой';
  if (file.size > 4 * 1024 * 1024) return `больше 4 МБ (${Math.round(file.size / 1024)} КБ)`;
  return null;
}

/** A name for a skin taken from its file, since that is what people call it. */
export function nameFromFile(name: string): string {
  return name
    .replace(/\.png$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
