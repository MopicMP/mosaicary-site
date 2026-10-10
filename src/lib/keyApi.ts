import type { ApiKey, MadeKey } from '../../shared/keyWire.js';
import { ask, sending } from './ask.js';

/** One's own API keys: the list, a new one, one taken away. Only ever from the site, signed in. */

export function listKeys(): Promise<ApiKey[]> {
  return ask<ApiKey[]>('/api/keys');
}

export function makeKey(name: string): Promise<MadeKey> {
  return ask<MadeKey>('/api/keys', sending('POST', { name }));
}

export function dropKey(id: string): Promise<{ ok: true }> {
  return ask<{ ok: true }>(`/api/keys/${id}`, sending('DELETE'));
}
