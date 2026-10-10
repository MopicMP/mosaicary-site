import { afterEach, describe, expect, it, vi } from 'vitest';
import { askWhoIAm } from '../src/lib/me.js';

/**
 * The page asking who it is, around a restart.
 *
 * The 500 here is what Vite's proxy answers while the Worker behind it is not up yet
 * (its proxy error handler writes 500, text/plain); a thrown fetch is no connection at
 * all. Neither is an answer, and neither may be taken for "not signed in".
 */

const signedIn = { signedIn: true, id: 'abc123def456', handle: 'Кто-то' };

function answers(...steps: (number | 'offline' | object)[]) {
  const calls = { n: 0 };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const step = steps[Math.min(calls.n++, steps.length - 1)]!;
      if (step === 'offline') throw new TypeError('Failed to fetch');
      if (typeof step === 'number') return new Response('', { status: step });
      return new Response(JSON.stringify(step), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('asking who this is', () => {
  it('waits out a restart instead of signing the person out', async () => {
    vi.useFakeTimers();
    const calls = answers('offline', 500, 502, signedIn);
    const asked = askWhoIAm();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await asked).toEqual(signedIn);
    expect(calls.n).toBe(4);
  });

  it('takes a plain refusal at its word, without asking again', async () => {
    const calls = answers(404);
    expect((await askWhoIAm()).signedIn).toBe(false);
    expect(calls.n).toBe(1);
  });

  it('gives up on an API that is simply off', async () => {
    vi.useFakeTimers();
    const calls = answers('offline');
    const asked = askWhoIAm();
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await asked).signedIn).toBe(false);
    expect(calls.n).toBeGreaterThan(3);
    expect(calls.n).toBeLessThan(12);
  });
});
