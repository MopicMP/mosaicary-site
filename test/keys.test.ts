import { describe, expect, it } from 'vitest';

import { KEY_PREFIX, KEY_RANDOM, looksLikeKey } from '../shared/keyWire.js';
import { keyMayUse, keyOf, limitKeyOf, overLimit, type Limiter } from '../worker/keyRules.js';
import { freshId } from '../worker/sign.js';

/**
 * That an API key means what keys.ts says: read from one header only, in one shape
 * only, and good for the routes it lists and nothing else.
 *
 * The routes themselves — making, listing, taking away, a key in place of the cookie,
 * an invalid key never falling back to it — are asked of a running Worker by
 * test/live/keys.mjs.
 */

const request = (authorization?: string) =>
  new Request('https://site.test/api/models', authorization === undefined ? {} : { headers: { authorization } });

describe('the key a request carries', () => {
  const key = KEY_PREFIX + freshId(KEY_RANDOM);

  it('is nothing when the request says nothing about one', () => {
    expect(keyOf(request())).toBeNull();
  });

  it('is read from a Bearer header, whatever case the word is in', () => {
    expect(keyOf(request(`Bearer ${key}`))).toBe(key);
    expect(keyOf(request(`bearer   ${key}  `))).toBe(key);
  });

  it('is an empty string for an Authorization header of any other shape, so the cookie is still not looked at', () => {
    expect(keyOf(request(''))).toBe('');
    expect(keyOf(request(`Basic ${key}`))).toBe('');
    expect(keyOf(request(`Bearer ${key} extra`))).toBe('');
  });
});

describe('the shape of a key', () => {
  it('is the prefix and forty letters and digits', () => {
    const key = KEY_PREFIX + freshId(KEY_RANDOM);
    expect(key).toHaveLength(KEY_PREFIX.length + KEY_RANDOM);
    expect(looksLikeKey(key)).toBe(true);
  });

  it('is not anything else, so nothing else reaches the database', () => {
    const key = KEY_PREFIX + freshId(KEY_RANDOM);
    expect(looksLikeKey(key.slice(0, -1))).toBe(false);
    expect(looksLikeKey(`${key}x`)).toBe(false);
    expect(looksLikeKey(`xxx_${key.slice(4)}`)).toBe(false);
    expect(looksLikeKey(`${key.slice(0, -1)}-`)).toBe(false);
    expect(looksLikeKey('')).toBe(false);
  });
});

describe('what a key may do', () => {
  const id = 'Ab3dE5gH9jK1';

  it('reads the catalogue, a model, its file and picture, and who it belongs to', () => {
    expect(keyMayUse('GET', '/api/models')).toBe(true);
    expect(keyMayUse('GET', `/api/models/${id}`)).toBe(true);
    expect(keyMayUse('GET', `/api/models/${id}/file`)).toBe(true);
    expect(keyMayUse('GET', `/api/models/${id}/preview`)).toBe(true);
    expect(keyMayUse('GET', '/api/auth/me')).toBe(true);
  });

  it('does not manage keys, so a key that leaked cannot make more of itself', () => {
    expect(keyMayUse('GET', '/api/keys')).toBe(false);
    expect(keyMayUse('POST', '/api/keys')).toBe(false);
    expect(keyMayUse('DELETE', `/api/keys/${id}`)).toBe(false);
  });

  it('does not say anybody is eighteen, sign out or act for whoever runs the site', () => {
    expect(keyMayUse('POST', '/api/auth/adult')).toBe(false);
    expect(keyMayUse('POST', '/api/auth/leave')).toBe(false);
    expect(keyMayUse('GET', '/api/admin/queue')).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/takedown`)).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/adult`)).toBe(false);
  });

  it('puts a model up, in the four steps the page itself takes', () => {
    expect(keyMayUse('POST', '/api/models')).toBe(true);
    expect(keyMayUse('PUT', `/api/models/${id}/file`)).toBe(true);
    expect(keyMayUse('PUT', `/api/models/${id}/preview`)).toBe(true);
    expect(keyMayUse('POST', `/api/models/${id}/publish`)).toBe(true);
    expect(keyMayUse('PATCH', `/api/models/${id}`)).toBe(true);
  });

  it('undoes nothing: a model is neither thrown away nor taken off the catalogue by a key', () => {
    expect(keyMayUse('DELETE', `/api/models/${id}`)).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/hide`)).toBe(false);
  });

  it('puts up a model, not a comment or anything else under that path', () => {
    expect(keyMayUse('PUT', `/api/models/${id}`)).toBe(false);
    expect(keyMayUse('PUT', `/api/models/${id}/talk`)).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/file`)).toBe(false);
    expect(keyMayUse('PATCH', '/api/models')).toBe(false);
    expect(keyMayUse('PATCH', `/api/talk/${id}`)).toBe(false);
  });

  it('does what a person does while looking: hearts, comments, notices', () => {
    expect(keyMayUse('GET', '/api/models/liked')).toBe(true);
    expect(keyMayUse('POST', `/api/models/${id}/like`)).toBe(true);
    expect(keyMayUse('DELETE', `/api/models/${id}/like`)).toBe(true);
    expect(keyMayUse('GET', `/api/models/${id}/talk`)).toBe(true);
    expect(keyMayUse('POST', `/api/models/${id}/talk`)).toBe(true);
    expect(keyMayUse('DELETE', `/api/talk/${id}`)).toBe(true);
    expect(keyMayUse('POST', `/api/talk/${id}/like`)).toBe(true);
    expect(keyMayUse('DELETE', `/api/talk/${id}/like`)).toBe(true);
    expect(keyMayUse('GET', '/api/notices')).toBe(true);
    expect(keyMayUse('POST', '/api/notices/seen')).toBe(true);
  });

  it('does not report: a report is a legal notice and the easiest thing to flood', () => {
    expect(keyMayUse('POST', `/api/models/${id}/report`)).toBe(false);
    expect(keyMayUse('POST', `/api/talk/${id}/report`)).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/doubt`)).toBe(false);
  });

  it('does not reach the queues of whoever runs the site', () => {
    expect(keyMayUse('GET', '/api/admin/talk')).toBe(false);
    expect(keyMayUse('POST', '/api/admin/policy')).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/settle`)).toBe(false);
    expect(keyMayUse('POST', `/api/models/${id}/restore`)).toBe(false);
  });
});

/**
 * The decision around the limiter, with a stand-in for Cloudflare's binding that keeps
 * its documented promise: `limit({ key })` answers `{ success }`, false once a key has
 * used its allowance. The binding itself is not exercised here; test/live/keys.mjs asks
 * a running Worker for that.
 */
describe('how often a key may ask', () => {
  const counting = (allowance: number): Limiter & { seen: string[] } => {
    const used = new Map<string, number>();
    const seen: string[] = [];
    return {
      seen,
      async limit({ key }) {
        seen.push(key);
        used.set(key, (used.get(key) ?? 0) + 1);
        return { success: used.get(key)! <= allowance };
      },
    };
  };

  it('is counted per account, so ten keys of one person share one allowance', () => {
    expect(limitKeyOf('Ab3dE5gH9jK1', 'mos_one')).toBe('account:Ab3dE5gH9jK1');
    expect(limitKeyOf('Ab3dE5gH9jK1', 'mos_two')).toBe(limitKeyOf('Ab3dE5gH9jK1', 'mos_one'));
  });

  it('counts a key that does not work by itself, cut to a sane length', () => {
    expect(limitKeyOf(null, 'mos_nothing')).toBe('key:mos_nothing');
    expect(limitKeyOf(null, 'x'.repeat(500))).toHaveLength(4 + 64);
  });

  it('lets requests through until the allowance is used, then refuses', async () => {
    const limiter = counting(3);
    const answers = [];
    for (let i = 0; i < 5; i += 1) answers.push(await overLimit(limiter, 'account:a'));
    expect(answers).toEqual([false, false, false, true, true]);
    expect(await overLimit(limiter, 'account:b')).toBe(false);
  });

  it('lets a request through when there is no limiter at all', async () => {
    expect(await overLimit(undefined, 'account:a')).toBe(false);
  });

  it('lets a request through when the limiter itself fails, rather than taking the plugin down', async () => {
    const broken: Limiter = {
      limit: () => Promise.reject(new Error('internal error')),
    };
    expect(await overLimit(broken, 'account:a')).toBe(false);
  });
});
