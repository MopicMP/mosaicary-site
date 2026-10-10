import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

import { MIGRATIONS } from './schema.js';

/**
 * The database, and the same database in two places.
 *
 * <h2>The problem this solves</h2>
 *
 * In production there is Postgres, because Railway has a plugin for it and because
 * everything here wants what Postgres has. On this machine there is nothing — and a
 * back end that cannot be run without first installing a database server is a back
 * end nobody runs before deploying it. That is how a project ends up testing in
 * production.
 *
 * The usual answer is SQLite locally and Postgres in the cloud, and the usual
 * answer is a trap: two dialects that agree until the day they do not, and the day
 * they do not is a day when the code has already been written against the wrong
 * one. So this is Postgres in both places — {@link PGlite} is the real thing
 * compiled to WebAssembly and run inside this process, same parser, same planner,
 * same types. Nothing to install, no Docker, and no dialect to keep in mind.
 *
 * What it costs: a few megabytes of dependency, and a local database that is a
 * directory rather than a server. Neither matters. What it buys is that a query
 * that works here works there, which is the only property worth paying for.
 */
export interface Db {
  /** Which of the two is actually underneath, for the log line at boot. */
  kind: 'postgres' | 'pglite';
  /** One statement with placeholders, giving back the rows. */
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Row[]>;
  /**
   * Several statements with no placeholders, all or nothing.
   *
   * Both ends run a multi-statement string as one implicit transaction, so a
   * migration that fails halfway leaves the database as it was rather than half
   * migrated — which is the state there is no good way back from.
   */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Opens whichever of the two is called for.
 *
 * The choice is made by whether there is a `DATABASE_URL`, not by `NODE_ENV`:
 * pointing a local run at a real database is a thing worth being able to do by
 * setting one variable, and having to lie about the environment to do it is how
 * people end up running the whole thing in production mode to test one query.
 */
export async function open(
  url = process.env.DATABASE_URL,
  folder = process.env.DB_FOLDER ?? '.data/db',
): Promise<Db> {
  if (url) {
    const pool = new pg.Pool({
      connectionString: url,
      // Railway's own plugin presents a certificate its clients are not given a
      // root for. This is inside their private network; the alternative on offer
      // is not to encrypt at all.
      ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
      max: 8,
    });
    return {
      kind: 'postgres',
      async query<Row>(sql: string, params: unknown[] = []) {
        const answer = await pool.query(sql, params);
        return answer.rows as Row[];
      },
      async exec(sql: string) {
        await pool.query(sql);
      },
      async close() {
        await pool.end();
      },
    };
  }

  // It makes its own directory but not the one above it, so the first run on a
  // clean checkout falls over on `mkdir .data/db` with no `.data`.
  if (!folder.startsWith('memory://')) {
    await mkdir(dirname(folder), { recursive: true });
  }
  const little = await PGlite.create(folder);
  return {
    kind: 'pglite',
    async query<Row>(sql: string, params: unknown[] = []) {
      const answer = await little.query<Row>(sql, params);
      return answer.rows;
    },
    async exec(sql: string) {
      await little.exec(sql);
    },
    async close() {
      await little.close();
    },
  };
}

/**
 * Brings the database up to the steps this build knows about.
 *
 * Runs at boot rather than as a separate command on purpose. One process, one
 * deploy, and no state where the code is new and the tables are old — which on a
 * platform that restarts things for you is a state you will otherwise reach by
 * accident at three in the morning.
 *
 * Applied steps are recorded by name, so this is safe to run every time and safe to
 * run twice at once: the record is written inside the same transaction as the step.
 */
export async function migrate(db: Db, say: (line: string) => void = () => {}): Promise<string[]> {
  await db.exec(`
    create table if not exists migrations (
      name    text primary key,
      applied timestamptz not null default now()
    );
  `);

  const done = new Set(
    (await db.query<{ name: string }>('select name from migrations')).map((row) => row.name),
  );

  const fresh: string[] = [];
  for (const step of MIGRATIONS) {
    if (done.has(step.name)) continue;
    // The name is written into the statement below rather than bound, so it is
    // held to something that cannot be anything else. These are our own constants
    // and never come from outside, but a rule that depends on remembering where a
    // string came from is a rule that lasts until somebody forgets.
    if (!/^[a-z0-9-]+$/.test(step.name)) throw new Error(`недопустимое имя шага: ${step.name}`);
    // The record goes in with the step, in the one implicit transaction, so a
    // migration cannot end up half applied and marked as done.
    await db.exec(`${step.sql}\ninsert into migrations (name) values ('${step.name}');`);
    say(`база: применён шаг ${step.name}`);
    fresh.push(step.name);
  }
  return fresh;
}
