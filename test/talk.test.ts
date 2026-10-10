import { describe, expect, it } from 'vitest';

import { cleanComment, goneWords, readWriting, threadsOf } from '../shared/talkRules.js';
import type { Comment, GoneBy } from '../shared/talkWire.js';

/**
 * That a conversation reads the way it was written.
 *
 * The three things that can go wrong here are all silent. A comment can lose the line
 * breaks its author put in and come out as a wall. An answer can lose the comment it
 * answered and vanish with it, which is somebody's words gone with nobody told. And a
 * comment taken off can take its answers down with it, which is the same loss by
 * another route. None of the three throws anything, so each one is asked about here.
 */

function said(id: string, over: Partial<Comment> = {}): Comment {
  return {
    id,
    by: { id: 'u1', handle: 'somebody', face: null },
    said: id,
    made: `2026-10-06T12:00:${id.slice(-2).padStart(2, '0')}Z`,
    replyTo: null,
    likes: 0,
    liked: false,
    mayRemove: false,
    gone: null,
    ...over,
  };
}

describe('a comment on its way to the database', () => {
  it('keeps paragraphs and drops what cannot be seen', () => {
    expect(cleanComment('первая\n\nвторая')).toBe('первая\n\nвторая');
    expect(cleanComment('  рядом  \n  строки  ')).toBe('рядом\n  строки');
    expect(cleanComment('а\u0007б')).toBe('аб');
    expect(cleanComment('а\r\nб')).toBe('а\nб');
  });

  it('closes the gap somebody pushed the page open with', () => {
    expect(cleanComment('верх\n\n\n\n\n\nниз')).toBe('верх\n\nниз');
  });

  it('cuts at the limit rather than refusing', () => {
    expect(cleanComment('я'.repeat(1200))).toHaveLength(1000);
  });

  it('is nothing when nothing was written', () => {
    expect(cleanComment('   \n  ')).toBe('');
    expect(cleanComment(undefined)).toBe('');
  });
});

describe('what the page sends', () => {
  it('takes words with an answer, or words alone', () => {
    expect(readWriting({ said: 'да', replyTo: 'abcdefgh1234' })).toEqual({ said: 'да', replyTo: 'abcdefgh1234' });
    expect(readWriting({ said: 'да' })).toEqual({ said: 'да', replyTo: null });
  });

  it('refuses empty words and an answer to nothing recognisable', () => {
    expect(readWriting({ said: '  ' })).toHaveProperty('error');
    expect(readWriting({ said: 'да', replyTo: 'коротко' })).toHaveProperty('error');
    expect(readWriting(null)).toHaveProperty('error');
  });
});

describe('the flat list as a conversation', () => {
  it('hangs answers under what they answer, oldest first', () => {
    const threads = threadsOf([
      said('b02'),
      said('a01'),
      said('r04', { replyTo: 'a01' }),
      said('r03', { replyTo: 'a01' }),
    ]);
    expect(threads.map((one) => one.head.id)).toEqual(['a01', 'b02']);
    expect(threads[0]!.replies.map((one) => one.id)).toEqual(['r03', 'r04']);
  });

  it('keeps a comment that was taken off while answers hang from it', () => {
    const threads = threadsOf([said('a01', { gone: 'site', said: '' }), said('r02', { replyTo: 'a01' })]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.head.gone).toBe('site');
    expect(threads[0]!.replies.map((one) => one.id)).toEqual(['r02']);
  });

  it('drops one that was taken off with nothing hanging from it', () => {
    expect(threadsOf([said('a01', { gone: 'author', said: '' })])).toEqual([]);
  });

  it('shows an answer whose comment is not in the list rather than losing it', () => {
    const threads = threadsOf([said('r01', { replyTo: 'gone99999999' })]);
    expect(threads.map((one) => one.head.id)).toEqual(['r01']);
  });
});

describe('what stands in place of a comment taken off', () => {
  it('names who took it off, in all three cases', () => {
    const all: GoneBy[] = ['author', 'owner', 'site'];
    const words = all.map(goneWords);
    expect(new Set(words).size).toBe(3);
    for (const one of words) expect(one.length).toBeGreaterThan(10);
  });
});
