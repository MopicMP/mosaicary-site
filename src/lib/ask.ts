import type { Refused } from '../../shared/modelWire.js';

/**
 * How the page talks to the Worker: one fetch, one way of failing.
 *
 * Every refusal reaches the page thrown whole, as the object the server sent. A
 * refusal to publish carries more than a sentence — which model it collided with and
 * whether this has happened before — and a page handed only the message would have to
 * guess at the rest.
 *
 * Its own module so that the catalogue and the talk under it share one of these
 * instead of two that drift apart.
 */
export async function ask<T>(url: string, how?: RequestInit): Promise<T> {
  let answer: Response;
  try {
    answer = await fetch(url, { credentials: 'same-origin', ...how });
  } catch {
    throw { error: 'сервер не отвечает, проверь соединение' } satisfies Refused;
  }
  if (!answer.ok) {
    const said = (await answer.json().catch(() => null)) as Refused | null;
    if (said?.error) throw said;
    throw { error: `не получилось (${answer.status})` } satisfies Refused;
  }
  return (await answer.json()) as T;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export function sending(method: string, body?: unknown): RequestInit {
  return body === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/** Whether something caught is a refusal from the server rather than a fault here. */
export function isRefused(thing: unknown): thing is Refused {
  return !!thing && typeof thing === 'object' && typeof (thing as Refused).error === 'string';
}

/** The words to put on the page for anything that went wrong. */
export function sayWhy(thing: unknown): string {
  if (isRefused(thing)) return thing.error;
  if (thing instanceof Error) return thing.message;
  return 'не получилось';
}
