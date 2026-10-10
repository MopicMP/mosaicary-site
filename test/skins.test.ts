import { createHash } from 'node:crypto';

import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { settle } from '../server/auth.js';
import { migrate, open, type Db } from '../server/db.js';
import { LARGEST, refuse, shapeOf } from '../server/png.js';
import { SESSION_COOKIE, makeSession } from '../server/session.js';
import { secretOf } from '../server/sign.js';
import { skinRoutes } from '../server/skins.js';

/**
 * Putting skins in, and who is allowed to see them come out.
 *
 * The half of this worth the setup is the second half. "Everything public, plus
 * everything of mine" is one clause, and every way of getting it wrong still
 * returns a list of skins that looks entirely reasonable — it is only wrong in
 * whose skins they are, which nothing but a test with two people in it can see.
 */

let app: FastifyInstance;
let db: Db;
let mine: string;
let theirs: string;

/** A PNG header of the given size. The routes never decode, so this is enough. */
function png(width = 64, height = 64, salt = 0): Buffer {
  const out = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out, 0);
  out.writeUInt32BE(13, 8);
  out.write('IHDR', 12, 'ascii');
  out.writeUInt32BE(width, 16);
  out.writeUInt32BE(height, 20);
  out.writeUInt32BE(salt, 24);
  return out;
}

function as(who: string) {
  return { [SESSION_COOKIE]: makeSession(secretOf(), who) };
}

beforeAll(async () => {
  db = await open(undefined, 'memory://');
  await migrate(db);
  mine = await settle(db, 'discord-mine', 'Мопик', null);
  theirs = await settle(db, 'discord-theirs', 'Кто-то ещё', null);

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

describe('what counts as a skin', () => {
  it('takes an ordinary one and an HD one and the old layout', () => {
    expect(refuse(png(64, 64))).toBeNull();
    expect(refuse(png(1024, 1024))).toBeNull();
    expect(refuse(png(64, 32))).toBeNull();
  });

  it('refuses what is not one, and says which', () => {
    expect(refuse(Buffer.from('это вообще не картинка'))).toContain('не PNG');
    expect(refuse(png(48, 48))).toContain('от 64');
    expect(refuse(png(96, 96))).toContain('степень двойки');
    expect(refuse(png(64, 20))).toContain('высота');
    expect(refuse(Buffer.alloc(0))).toContain('пустой');
    expect(refuse(Buffer.alloc(LARGEST + 1))).toContain('4 МБ');
  });

  /** The half-height layout is read as such, not as a broken square one. */
  it('reads the shape without decoding anything', () => {
    expect(shapeOf(png(512, 256)).layout).toBe(32);
    expect(shapeOf(png(512, 512)).layout).toBe(64);
    expect(shapeOf(png(64, 64)).width).toBe(64);
    // The same fingerprint the mod uses to address a picture.
    const bytes = png(64, 64, 7);
    expect(shapeOf(bytes).fingerprint).toBe(
      createHash('sha256').update(bytes).digest('hex').slice(0, 32),
    );
  });
});

describe('putting one in', () => {
  it('will not take one from nobody', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/skins',
      headers: { 'content-type': 'image/png' },
      payload: png(64, 64, 1),
    });
    expect(reply.statusCode).toBe(401);
  });

  it('takes one and hands back its bytes unchanged', async () => {
    const bytes = png(64, 64, 2);
    const put = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Ночной гость&gender=girl&tags=готика,очки',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: bytes,
    });
    expect(put.statusCode).toBe(201);
    const { id } = put.json();

    const back = await app.inject({ method: 'GET', url: `/api/skins/${id}/png`, cookies: as(mine) });
    expect(back.headers['content-type']).toBe('image/png');
    expect(Buffer.from(back.rawPayload).equals(bytes)).toBe(true);
    // An id never points at different bytes, so a stale copy cannot be wrong.
    expect(back.headers['cache-control']).toContain('immutable');

    const told = await app.inject({ method: 'GET', url: `/api/skins/${id}`, cookies: as(mine) });
    expect(told.json()).toMatchObject({
      name: 'Ночной гость',
      gender: 'girl',
      // Who put it here. Never "who drew it" — a fresh upload has said nothing
      // about that, and the site does not fill the gap in on its own.
      uploader: 'Мопик',
      author: { state: 'none', name: null },
      width: 64,
      mine: true,
      published: false,
    });
    expect(told.json().tags.sort()).toEqual(['готика', 'очки']);
  });

  /**
   * The same file twice is one skin, and saying so is not an error.
   *
   * Uploading a folder, then uploading it again because you were not sure it
   * worked, is the ordinary thing people do. Refusing the second attempt makes
   * that look like a failure; answering with the skin already there does not.
   */
  it('does not make a second copy of the same file', async () => {
    const bytes = png(64, 64, 3);
    const first = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Раз',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: bytes,
    });
    const again = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Два',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: bytes,
    });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ id: first.json().id, already: true });
  });

  it('refuses rubbish with a reason rather than a number', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/skins',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: Buffer.from('нет'),
    });
    expect(reply.statusCode).toBe(400);
    expect(String(reply.json().error)).toContain('не PNG');
  });
});

describe('who sees what', () => {
  it('keeps an upload private until somebody says otherwise', async () => {
    const put = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Только мой',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: png(64, 64, 10),
    });
    const { id } = put.json();

    const asStranger = await app.inject({
      method: 'GET',
      url: `/api/skins/${id}`,
      cookies: as(theirs),
    });
    expect(asStranger.statusCode).toBe(404);

    // And not merely hidden from the list: the bytes are not there either.
    const bytes = await app.inject({
      method: 'GET',
      url: `/api/skins/${id}/png`,
      cookies: as(theirs),
    });
    expect(bytes.statusCode).toBe(404);

    const listed = await app.inject({ method: 'GET', url: '/api/skins', cookies: as(theirs) });
    expect(listed.json().some((skin: { id: string }) => skin.id === id)).toBe(false);

    const mineListed = await app.inject({ method: 'GET', url: '/api/skins', cookies: as(mine) });
    expect(mineListed.json().some((skin: { id: string }) => skin.id === id)).toBe(true);
  });

  it('will not let anybody rename or delete what is not theirs', async () => {
    const put = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Моё',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: png(64, 64, 11),
    });
    const { id } = put.json();

    for (const [method, payload] of [
      ['PATCH', { name: 'украдено' }],
      ['PUT', { mask: '8:1//' }],
    ] as const) {
      const reply = await app.inject({
        method,
        url: method === 'PUT' ? `/api/skins/${id}/mask` : `/api/skins/${id}`,
        cookies: as(theirs),
        payload,
      });
      expect(reply.statusCode).toBe(404);
    }

    const wiped = await app.inject({ method: 'DELETE', url: `/api/skins/${id}`, cookies: as(theirs) });
    expect(wiped.statusCode).toBe(404);

    const still = await app.inject({ method: 'GET', url: `/api/skins/${id}`, cookies: as(mine) });
    expect(still.json().name).toBe('Моё');
  });

  it('lets the owner mark a face and take it back off', async () => {
    const put = await app.inject({
      method: 'POST',
      url: '/api/skins?name=Размеченный',
      headers: { 'content-type': 'image/png' },
      cookies: as(mine),
      payload: png(64, 64, 12),
    });
    const { id } = put.json();

    await app.inject({
      method: 'PUT',
      url: `/api/skins/${id}/mask`,
      cookies: as(mine),
      payload: { mask: '8:22.1.2.1.1a//21.1.4.1.19/////' },
    });
    const marked = await app.inject({ method: 'GET', url: `/api/skins/${id}`, cookies: as(mine) });
    expect(marked.json().mask).toContain('8:');

    await app.inject({
      method: 'PUT',
      url: `/api/skins/${id}/mask`,
      cookies: as(mine),
      payload: { mask: '' },
    });
    const bare = await app.inject({ method: 'GET', url: `/api/skins/${id}`, cookies: as(mine) });
    expect(bare.json().mask).toBeNull();
  });

  it('gives a person their own list when they ask for it', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/skins?mine=1', cookies: as(theirs) });
    expect(reply.json()).toEqual([]);
    const nobody = await app.inject({ method: 'GET', url: '/api/skins?mine=1' });
    expect(nobody.statusCode).toBe(401);
  });
});
