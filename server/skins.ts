import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { accountOf, mustBe } from './auth.js';
import type { Db } from './db.js';
import { refuse, shapeOf } from './png.js';
import { barredUntil, mayPublish, printFor } from './publish.js';

/**
 * Skins: putting one in, listing them, and handing the bytes back.
 *
 * <h2>Who can see what</h2>
 *
 * An upload is private. There is no public showcase yet, and a site that starts
 * publishing what people put into it before anybody has agreed to that is a site
 * that has to apologise later. What is public today is the shipped samples, which
 * belong to nobody and cannot be edited.
 *
 * Every listing therefore says the same thing: everything public, plus everything
 * of yours. That one clause is in one place, {@link visible}, because "and also
 * yours" written out at four call sites is three chances to leave it off — and
 * leaving it off is invisible until it is somebody else's skins on your screen.
 *
 * <h2>Bytes are answered by their own route</h2>
 *
 * Not as base64 inside JSON: that is a third bigger, cannot be cached by the
 * browser as a picture, and puts four megabytes through a JSON parser. A separate
 * route can also say `immutable`, which is honest here — the address contains the
 * id and the bytes behind an id never change.
 */

/** How a skin is described to the front, matching what the catalogue already reads. */
export interface Told {
  id: string;
  name: string;
  /**
   * Who put it here. Never "who drew it" — that is a different question and the
   * site does not know the answer to it.
   */
  uploader: string;
  /**
   * What is known about who drew it.
   *
   * `none` — nobody has said. `claimed` — somebody said it is theirs and showed
   * nothing. `named` — the uploader named somebody else. `confirmed` — it was
   * shown, or settled. The page prints these differently on purpose: the whole
   * mechanism is that "said" and "shown" do not look the same.
   */
  author: { state: 'none' | 'first' | 'named'; name: string | null; url: string | null };
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
  /** Whether it is in front of other people, and how it got there. */
  published: boolean;
  origin: string | null;
}

export function skinRoutes(app: FastifyInstance, db: Db): void {
  /**
   * The bytes as a PNG.
   *
   * Cached hard and for a year. The id never points at different bytes — a
   * changed picture is a new upload with a new id — so there is nothing for a
   * stale copy to be wrong about.
   */
  app.get('/api/skins/:id/png', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = await accountOf(db, request);
    const rows = await db.query<{ bytes: Uint8Array }>(
      `select s.bytes from skins s where s.id = $1 and ${visible('$2')}`,
      [id, me?.id ?? null],
    );
    const skin = rows[0];
    if (!skin) return reply.code(404).send({ error: 'нет такого скина' });
    return reply
      .header('content-type', 'image/png')
      .header('cache-control', 'public, max-age=31536000, immutable')
      // The two drivers hand bytes back differently — one a Buffer, one a plain
      // array of them — and anything that is not a Buffer is serialised as JSON,
      // which turns a picture into three hundred kilobytes of numbers.
      .send(Buffer.isBuffer(skin.bytes) ? skin.bytes : Buffer.from(skin.bytes));
  });

  /** The catalogue: everything public, and everything of yours. */
  app.get('/api/skins', async (request, reply) => {
    const me = await accountOf(db, request);
    const query = request.query as { mine?: string };
    const onlyMine = query.mine === '1';
    if (onlyMine && !me) return reply.code(401).send({ error: 'нужно войти' });

    const rows = await db.query<Row>(
      `select s.id, s.name, s.author, s.fingerprint, s.width, s.layout, s.gender,
              s.visibility, s.created, s.owner,
              s.author_state, s.author_name, s.author_url, s.origin,
              m.encoded as mask,
              coalesce(array_agg(t.tag) filter (where t.tag is not null), '{}') as tags
         from skins s
         left join masks m on m.skin_id = s.id
         left join tags  t on t.skin_id = s.id
        where ${onlyMine ? 's.owner = $1' : visible('$1')}
        group by s.id, m.encoded
        order by s.created desc
        limit 500`,
      [me?.id ?? null],
    );
    return reply.send(rows.map((row) => tell(row, me?.id ?? null)));
  });

  app.get('/api/skins/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const me = await accountOf(db, request);
    const rows = await db.query<Row>(
      `select s.id, s.name, s.author, s.fingerprint, s.width, s.layout, s.gender,
              s.visibility, s.created, s.owner,
              s.author_state, s.author_name, s.author_url, s.origin,
              m.encoded as mask,
              coalesce(array_agg(t.tag) filter (where t.tag is not null), '{}') as tags
         from skins s
         left join masks m on m.skin_id = s.id
         left join tags  t on t.skin_id = s.id
        where s.id = $1 and ${visible('$2')}
        group by s.id, m.encoded`,
      [id, me?.id ?? null],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'нет такого скина' });
    return reply.send(tell(rows[0], me?.id ?? null));
  });

  /**
   * Putting one in.
   *
   * The picture arrives as the body and everything else as the address, rather
   * than as a form with parts in it. One less thing to parse, one less dependency,
   * and the bytes never become a string on the way.
   */
  app.post('/api/skins', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;

    const bytes = request.body as Buffer;
    if (!Buffer.isBuffer(bytes)) {
      return reply.code(415).send({ error: 'жду картинку PNG телом запроса' });
    }
    const wrong = refuse(bytes);
    if (wrong) return reply.code(400).send({ error: wrong });

    const shape = shapeOf(bytes);
    const query = request.query as { name?: string; gender?: string; tags?: string };
    const name = tidy(query.name) || 'без названия';
    const gender = ['girl', 'boy', 'neutral'].includes(query.gender ?? '')
      ? query.gender!
      : 'neutral';

    // The same file twice is the same skin. Answering with the one already there,
    // rather than refusing, is what makes uploading a folder twice harmless.
    const already = await db.query<{ id: string }>(
      'select id from skins where owner = $1 and fingerprint = $2',
      [me.id, shape.fingerprint],
    );
    if (already[0]) {
      return reply.code(200).send({ id: already[0].id, already: true });
    }

    const id = randomUUID();
    await db.query(
      `insert into skins (id, owner, author, name, fingerprint, width, layout, gender, bytes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, me.id, me.handle, name, shape.fingerprint, shape.width, shape.layout, gender, bytes],
    );
    await putTags(db, id, splitTags(query.tags));
    // Worked out now, while the bytes are already in hand, rather than at the
    // moment somebody presses publish and is left waiting for it.
    await printFor(db, id);
    return reply.code(201).send({ id, already: false });
  });

  /** Renaming, retagging, changing who it is drawn as. Only your own. */
  app.patch('/api/skins/:id', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; gender?: string; tags?: string[] };

    const owned = await db.query<{ id: string }>(
      'select id from skins where id = $1 and owner = $2',
      [id, me.id],
    );
    if (!owned[0]) return reply.code(404).send({ error: 'нет такого скина' });

    if (body.name !== undefined) {
      await db.query('update skins set name = $2 where id = $1', [id, tidy(body.name) || 'без названия']);
    }
    if (body.gender !== undefined && ['girl', 'boy', 'neutral'].includes(body.gender)) {
      await db.query('update skins set gender = $2 where id = $1', [id, body.gender]);
    }
    if (body.tags !== undefined) {
      await db.query('delete from tags where skin_id = $1', [id]);
      await putTags(db, id, body.tags.map((tag) => tidy(tag)).filter(Boolean));
    }
    return reply.send({ ok: true });
  });

  /** Saving a marked face. The mask travels as the same short string everywhere. */
  app.put('/api/skins/:id/mask', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    const { id } = request.params as { id: string };
    const body = request.body as { mask?: string };
    const mask = typeof body?.mask === 'string' ? body.mask : '';
    if (mask.length > 64 * 1024) return reply.code(400).send({ error: 'разметка слишком длинная' });

    const owned = await db.query<{ id: string }>(
      'select id from skins where id = $1 and owner = $2',
      [id, me.id],
    );
    if (!owned[0]) return reply.code(404).send({ error: 'нет такого скина' });

    if (!mask.trim()) {
      await db.query('delete from masks where skin_id = $1', [id]);
    } else {
      await db.query(
        `insert into masks (skin_id, encoded) values ($1, $2)
         on conflict (skin_id) do update set encoded = excluded.encoded, updated = now()`,
        [id, mask],
      );
    }
    return reply.send({ ok: true });
  });

  /**
   * Putting one in front of other people.
   *
   * Its own action, and never a side effect of uploading. Publishing is the moment
   * a claim is made, and a claim made by accident is the whole problem — a folder
   * gathered over five years, uploaded in one go, with somebody's name landing
   * under every file in it.
   */
  app.post('/api/skins/:id/publish', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    const { id } = request.params as { id: string };
    const body = request.body as { author?: string; url?: string };

    const owned = await db.query<{ id: string; visibility: string }>(
      'select id, visibility from skins where id = $1 and owner = $2',
      [id, me.id],
    );
    if (!owned[0]) return reply.code(404).send({ error: 'нет такого скина' });

    // Named, if the person wants to credit somebody else; otherwise theirs by
    // the rule below. There is no third answer to collect any more.
    const credited = tidy(body?.author);

    const barred = await barredUntil(db, me.id);
    if (barred) {
      return reply.code(403).send({
        error: `публиковать пока нельзя — до ${barred.toLocaleDateString('ru')}`,
        barredUntil: barred.toISOString(),
      });
    }

    const may = await mayPublish(db, id, me.id);
    if (!may.ok) {
      return reply.code(409).send({
        error: may.said,
        against: may.against,
        verdict: may.verdict,
        again: may.again,
      });
    }

    /**
     * First to publish it is the author.
     *
     * Not because that establishes anything — it cannot, and nothing can. It is a
     * convention, and the honest reason to adopt it is that the alternative was a
     * byline nobody could read: "заявил себя автором, со слов" on every card is a
     * hedge repeated so often it stops being information.
     *
     * What makes the convention worth having is the machinery already under it:
     * the same drawing cannot be published twice however it is edited, so being
     * first is a thing that happens once. And anybody who wants to credit
     * somebody else still can, by name.
     */
    await db.query(
      `update skins
          set visibility = 'public', published = now(), origin = 'first',
              author_state = 'first', author_name = $2, author_url = $3
        where id = $1`,
      [id, credited || me.handle, tidy(body?.url)?.slice(0, 300) || null],
    );
    return reply.send({ ok: true, near: may.near ?? null });
  });

  /** And taking it back down, which is always allowed and never questioned. */
  app.post('/api/skins/:id/hide', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    const { id } = request.params as { id: string };
    const gone = await db.query<{ id: string }>(
      `update skins set visibility = 'private', published = null
        where id = $1 and owner = $2 returning id`,
      [id, me.id],
    );
    if (!gone[0]) return reply.code(404).send({ error: 'нет такого скина' });
    return reply.send({ ok: true });
  });

  /** What has happened that somebody ought to know about. */
  app.get('/api/notices', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    const rows = await db.query<{ id: string; kind: string; about: string; said: string; made: Date; seen: boolean }>(
      'select id, kind, about, said, made, seen from notices where who = $1 order by made desc limit 50',
      [me.id],
    );
    return reply.send(rows.map((row) => ({ ...row, made: new Date(row.made).toISOString() })));
  });

  app.post('/api/notices/seen', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    await db.query('update notices set seen = true where who = $1', [me.id]);
    return reply.send({ ok: true });
  });

  app.delete('/api/skins/:id', async (request, reply) => {
    const me = await mustBe(db, request, reply);
    if (!me) return reply;
    const { id } = request.params as { id: string };
    const gone = await db.query<{ id: string }>(
      'delete from skins where id = $1 and owner = $2 returning id',
      [id, me.id],
    );
    if (!gone[0]) return reply.code(404).send({ error: 'нет такого скина' });
    return reply.send({ ok: true });
  });
}

// ------------------------------------------------------------------ the details

interface Row {
  id: string;
  name: string;
  author: string;
  fingerprint: string;
  width: number;
  layout: number;
  gender: string;
  visibility: string;
  created: Date | string;
  owner: string | null;
  mask: string | null;
  tags: string[];
  author_state: string;
  author_name: string | null;
  author_url: string | null;
  origin: string | null;
}

/**
 * The one rule about who sees what, written once.
 *
 * Public, or yours. Spelled out at each call site instead, it would be right at
 * three of them and quietly missing at the fourth — and a missing "and yours" is
 * invisible, while a missing "public" is somebody else's private skins on screen.
 */
function visible(who: string): string {
  return `(s.visibility = 'public' or s.owner = ${who})`;
}

function tell(row: Row, me: string | null): Told {
  /**
   * Three states, and only three.
   *
   * `first` is somebody who published a drawing nobody had published before, and
   * that is what this site means by an author — a convention, because nothing can
   * establish who drew a picture, and one worth having because the same drawing
   * cannot be published twice. `named` is a credit to somebody who is not here.
   * `none` is a skin still on a private shelf, where nothing has been said.
   */
  const state: Told['author']['state'] =
    row.author_state === 'first'
      ? row.author_name && row.author_name !== row.author
        ? 'named'
        : 'first'
      : row.author_name
        ? 'named'
        : 'none';

  return {
    id: row.id,
    name: row.name,
    uploader: row.author,
    author: {
      state,
      // Whoever was credited, or the person who got here first.
      name: row.author_name ?? (state === 'first' ? row.author : null),
      url: row.author_url ?? null,
    },
    fingerprint: row.fingerprint,
    url: `/api/skins/${row.id}/png`,
    width: row.width,
    layout: row.layout,
    gender: row.gender,
    tags: row.tags ?? [],
    mask: row.mask ?? null,
    // Worked out in the browser, where the picture is already being decoded to be
    // drawn. Nothing here has a decoder, and adding one to answer a question about
    // appearance would mean running an inflater over whatever was uploaded.
    hasOverlay: true,
    uploaded: new Date(row.created).toISOString(),
    stars: 0,
    mine: row.owner !== null && row.owner === me,
    published: row.visibility === 'public',
    origin: row.origin ?? null,
  };
}

async function putTags(db: Db, id: string, tags: string[]): Promise<void> {
  const kept = [...new Set(tags.map((tag) => tag.slice(0, 24)))].slice(0, 12);
  for (const tag of kept) {
    await db.query('insert into tags (skin_id, tag) values ($1, $2) on conflict do nothing', [
      id,
      tag,
    ]);
  }
}

function splitTags(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(',')
    .map((tag) => tidy(tag))
    .filter(Boolean);
}

/** Trimmed, collapsed, and short enough to fit on a card. */
function tidy(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
