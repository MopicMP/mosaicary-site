import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { settle } from '../server/auth.js';
import { migrate, open, type Db } from '../server/db.js';
import { character, draw } from './help/skins.js';
import { LARGEST } from '../server/png.js';
import { SESSION_COOKIE, makeSession } from '../server/session.js';
import { secretOf } from '../server/sign.js';
import { skinRoutes } from '../server/skins.js';

/**
 * Publishing somebody else's work, and what stands in the way.
 *
 * The comparison itself is checked next door, on pictures alone. What is checked
 * here is the rule built on top of it: the first attempt is refused and the author
 * is told, the second costs the person the right to publish for a while, and
 * nothing at all happens while a skin stays private.
 *
 * The penalty waiting for the second attempt is not softness. On a small site the
 * common case is somebody who gathered skins for five years and does not know where
 * they came from, and an automatic first-strike rule is also a weapon: publish a
 * person's work before they do and they are penalised for publishing their own.
 */

let app: FastifyInstance;
let db: Db;
let mine: string;
let theirs: string;

function as(who: string) {
  return { [SESSION_COOKIE]: makeSession(secretOf(), who) };
}

async function put(who: string, bytes: Buffer, name: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/skins?name=${encodeURIComponent(name)}`,
    headers: { 'content-type': 'image/png' },
    cookies: as(who),
    payload: bytes,
  });
  return reply.json().id as string;
}

function publish(who: string, id: string, origin = 'mine') {
  return app.inject({
    method: 'POST',
    url: `/api/skins/${id}/publish`,
    cookies: as(who),
    payload: { origin },
  });
}

beforeAll(async () => {
  db = await open(undefined, 'memory://');
  await migrate(db);
  mine = await settle(db, 'discord-author', 'Автор', null);
  theirs = await settle(db, 'discord-thief', 'Не автор', null);

  app = Fastify();
  await app.register(fastifyCookie);
  app.addContentTypeParser(
    ['image/png', 'application/octet-stream'],
    { parseAs: 'buffer', bodyLimit: LARGEST },
    (_request, body, done) => done(null, body),
  );
  skinRoutes(app, db);
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('publishing somebody else’s work', () => {
  it('lets the first person publish', async () => {
    const id = await put(mine, draw(character), 'Мой персонаж');
    const reply = await publish(mine, id);
    expect(reply.statusCode).toBe(200);
  });

  it('refuses the same drawing from somebody else, one pixel changed', async () => {
    const nearly = draw((x, y) => (x === 30 && y === 31 ? [1, 2, 3, 255] : character(x, y)));
    const id = await put(theirs, nearly, 'Совершенно мой скин');
    const reply = await publish(theirs, id);

    expect(reply.statusCode).toBe(409);
    expect(reply.json().verdict).toBe('same');
    // Sent to the record that already exists rather than merely told no.
    expect(reply.json().against).toBeTruthy();
    expect(reply.json().again).toBe(false);

    // And it is not on the showcase.
    const listed = await app.inject({ method: 'GET', url: '/api/skins' });
    expect(listed.json().some((skin: { id: string }) => skin.id === id)).toBe(false);
  });

  /**
   * The author is told, whether or not anything happens to anybody.
   *
   * This is the part that is useful even when the attempt was innocent, and it is
   * the thing an author actually wants from a site: to know.
   */
  it('tells the person whose work it is', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/notices', cookies: as(mine) });
    const notices = reply.json() as { said: string; kind: string }[];
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0]!.kind).toBe('copy');
    expect(notices[0]!.said).toContain('Не автор');
  });

  /**
   * A second attempt at the same work is a decision rather than a mistake.
   *
   * The first refusal costs nothing on purpose: on a small site the common case is
   * somebody who gathered skins for five years and does not know where they came
   * from. Punishing that teaches nothing. It also matters that a penalty cannot be
   * triggered by somebody else — publish a person's work before they do and an
   * automatic first-strike rule would penalise them for publishing their own.
   */
  it('bars publishing after a second attempt at the same work', async () => {
    const again = draw((x, y) => (x === 41 && y === 41 ? [9, 9, 9, 255] : character(x, y)));
    const id = await put(theirs, again, 'Ну точно мой');
    const second = await publish(theirs, id);
    expect(second.statusCode).toBe(409);
    expect(second.json().again).toBe(true);

    // Now nothing of theirs can be published, including something unrelated.
    const other = await put(theirs, draw((x, y) => [x * 2, 255 - y * 2, 60, 255]), 'Своё');
    const barred = await publish(theirs, other);
    expect(barred.statusCode).toBe(403);
    expect(String(barred.json().error)).toContain('нельзя');
  });

  it('leaves the author alone', async () => {
    const other = await put(mine, draw((x, y) => [255 - x * 3, y * 3, 30, 255]), 'Ещё один');
    expect((await publish(mine, other)).statusCode).toBe(200);
  });
});

describe('who a published skin belongs to', () => {
  /**
   * First to publish it is the author, and the site says so plainly.
   *
   * Nothing can establish who drew a picture — that is a property of PNG files,
   * not a shortcoming here — so this is a convention. What makes it worth having
   * is underneath it: the same drawing cannot be published twice however it is
   * edited, so being first happens once and is then closed.
   */
  it('credits whoever got there first', async () => {
    const id = await put(mine, draw((x, y) => [x, y, 200, 255]), 'Первый');
    await publish(mine, id);
    const told = (await app.inject({ method: 'GET', url: `/api/skins/${id}` })).json();
    expect(told.author.state).toBe('first');
    expect(told.author.name).toBe('Автор');
    expect(told.uploader).toBe('Автор');
  });

  /**
   * And somebody publishing work they did not draw can still credit whoever did.
   *
   * The honest answer for most of what people have collected, and the only thing
   * worse than a catalogue crediting the wrong person is one with no way to
   * credit the right one.
   */
  it('carries somebody else’s name when it is given', async () => {
    const id = await put(mine, draw((x, y) => [90, x, y, 255]), 'Не моё');
    await app.inject({
      method: 'POST',
      url: `/api/skins/${id}/publish`,
      cookies: as(mine),
      payload: { author: 'Vera', url: 'https://example.test/vera' },
    });
    const told = (await app.inject({ method: 'GET', url: `/api/skins/${id}` })).json();
    expect(told.author.state).toBe('named');
    expect(told.author.name).toBe('Vera');
    // And who put it here is still known, and still not the same question.
    expect(told.uploader).toBe('Автор');
  });

  /** Nothing is said about anybody while a skin sits on a private shelf. */
  it('says nothing about a skin nobody has published', async () => {
    const id = await put(mine, draw((x, y) => [30, 200 - x, y, 255]), 'На полке');
    const told = (await app.inject({ method: 'GET', url: `/api/skins/${id}`, cookies: as(mine) })).json();
    expect(told.author.state).toBe('none');
    expect(told.author.name).toBeNull();
    expect(told.published).toBe(false);
  });

  /** Private is nobody's business: anybody may keep anything. */
  it('checks nothing while a skin stays private', async () => {
    const copy = draw((x, y) => (x === 12 && y === 12 ? [7, 7, 7, 255] : character(x, y)));
    const reply = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Себе',
      headers: { 'content-type': 'image/png' },
      cookies: as(theirs),
      payload: copy,
    });
    expect(reply.statusCode).toBe(201);
  });
});
