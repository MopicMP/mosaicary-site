import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { settle } from '../server/auth.js';
import { migrate, open, type Db } from '../server/db.js';

/**
 * That the database is the same database in both places.
 *
 * These run against real Postgres — the WebAssembly build of it, in this process,
 * with nothing installed. That is the whole point of choosing it: a test that runs
 * against a different engine from the one in production is a test that agrees with
 * you until the day it matters.
 */

let db: Db;

beforeAll(async () => {
  db = await open(undefined, 'memory://');
  await migrate(db);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('the schema', () => {
  it('is safe to bring forward again', async () => {
    // Boot happens on every deploy and every restart. A migration that is not
    // safe to re-run is a deploy that fails the second time it is tried.
    const second = await migrate(db);
    expect(second).toEqual([]);
  });

  it('records what it applied', async () => {
    const rows = await db.query<{ name: string }>('select name from migrations order by name');
    expect(rows.map((row) => row.name)).toContain('001-users');
  });
});

describe('people', () => {
  it('makes an account the first time somebody arrives', async () => {
    const id = await settle(db, 'discord-1', 'Мопик', 'abc');
    expect(id).toBeTruthy();
    const rows = await db.query<{ handle: string }>('select handle from users where id = $1', [id]);
    expect(rows[0]?.handle).toBe('Мопик');
  });

  /**
   * The same person twice is the same account, whatever they are called now.
   *
   * Discord lets a name change, so the name can never be the key. Keyed by it, the
   * first rename would leave somebody's skins behind in an account they can no
   * longer reach — and nothing about that failure would look like a bug.
   */
  it('knows a returning person by their Discord id and not by their name', async () => {
    const first = await settle(db, 'discord-2', 'Старое имя', null);
    const again = await settle(db, 'discord-2', 'Новое имя', 'xyz');
    expect(again).toBe(first);

    const rows = await db.query<{ handle: string; avatar: string }>(
      'select handle, avatar from users where id = $1',
      [first],
    );
    expect(rows[0]?.handle).toBe('Новое имя');
    expect(rows[0]?.avatar).toBe('xyz');

    const count = await db.query<{ n: string }>(
      'select count(*)::text as n from users where discord_id = $1',
      ['discord-2'],
    );
    expect(count[0]?.n).toBe('1');
  });
});
