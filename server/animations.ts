import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';

import type { Db } from './db.js';

/**
 * The animation catalogue.
 *
 * <h2>Why this is the easy half of the same problem</h2>
 *
 * A skin is a picture and a picture says nothing about who drew it — that is the
 * whole difficulty next door. An animation arrives in a pack: from a named person,
 * as a body of work, with terms attached. There is nothing to establish, so
 * nothing here has to guess: the author is a column, and the links to where they
 * can be found and supported travel with every single entry rather than sitting in
 * a credits page nobody opens.
 *
 * <h2>Where the pack comes from</h2>
 *
 * The mod's own resources, which is where it was already unpacked and where the
 * refusal list has already been applied. One copy on disk rather than two, and the
 * one that has been through the filter — see `tools/extract_emotes.py`.
 *
 * <h2>What is stored and what is not</h2>
 *
 * The emote file byte for byte. Not reformatted, not rounded, not re-encoded: the
 * pack's terms forbid altering the files, and the format's wastefulness is not
 * ours to fix. Postgres compresses a column like this on its own — a hundred and
 * seventy megabytes of repeated decimal places is exactly what a compressor is
 * good at — so the honest thing and the cheap thing agree for once.
 */

/** Milyan, and the project the pack comes from. Written once, carried everywhere. */
export const SPEMOTES = {
  pack: 'spemotes',
  author: 'Milyan',
  authorUrl: 'https://spemotes.com',
  supportUrl: 'https://boosty.to/spemotes',
} as const;

export interface AnimationTold {
  id: string;
  pack: string;
  slug: string;
  name: string;
  author: string;
  authorUrl: string | null;
  supportUrl: string | null;
  description: string;
  loop: boolean;
  ticks: number;
  tags: string[];
  icon: string | null;
  emote: string;
}

export function animationRoutes(app: FastifyInstance, db: Db): void {
  /** Everything, without the keyframes — which are the whole weight of it. */
  app.get('/api/animations', async (_request, reply) => {
    const rows = await db.query<Row>(
      `select a.id, a.pack, a.slug, a.name, a.author, a.author_url, a.support_url,
              a.description, a.loop, a.ticks, a.icon is not null as has_icon,
              coalesce(array_agg(t.tag) filter (where t.tag is not null), '{}') as tags
         from animations a
         left join animation_tags t on t.animation = a.id
        group by a.id
        order by a.name`,
    );
    return reply.send(rows.map(tell));
  });

  /** The pack's own categories, so the site groups them the way the game does. */
  app.get('/api/animations/kinds', async (_request, reply) => {
    const rows = await db.query<{ tag: string; parent: string | null }>(
      'select tag, parent from tag_kinds order by tag',
    );
    return reply.send(rows);
  });

  app.get('/api/animations/:id/icon', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db.query<{ icon: Uint8Array | null }>(
      'select icon from animations where id = $1',
      [id],
    );
    const icon = rows[0]?.icon;
    if (!icon) return reply.code(404).send({ error: 'нет картинки' });
    return reply
      .header('content-type', 'image/png')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(Buffer.isBuffer(icon) ? icon : Buffer.from(icon));
  });

  /**
   * The keyframes, asked for only when something is actually going to play.
   *
   * Seven hundred of these are a hundred and seventy megabytes. Sending the list
   * with the movement in it would mean every visitor downloading all of it to look
   * at a page of names.
   */
  app.get('/api/animations/:id/emote', async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await db.query<{ body: Uint8Array }>(
      'select body from animations where id = $1',
      [id],
    );
    const body = rows[0]?.body;
    if (!body) return reply.code(404).send({ error: 'нет такой анимации' });
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(Buffer.isBuffer(body) ? body : Buffer.from(body));
  });
}

interface Row {
  id: string;
  pack: string;
  slug: string;
  name: string;
  author: string;
  author_url: string | null;
  support_url: string | null;
  description: string;
  loop: boolean;
  ticks: number;
  has_icon: boolean;
  tags: string[];
}

function tell(row: Row): AnimationTold {
  return {
    id: row.id,
    pack: row.pack,
    slug: row.slug,
    name: row.name,
    author: row.author,
    authorUrl: row.author_url,
    supportUrl: row.support_url,
    description: row.description,
    loop: row.loop,
    ticks: row.ticks,
    tags: row.tags ?? [],
    icon: row.has_icon ? `/api/animations/${row.id}/icon` : null,
    emote: `/api/animations/${row.id}/emote`,
  };
}

// --------------------------------------------------------------------- putting in

/** The tree of categories, as the pack has it. */
interface PackIndex {
  emotes: IndexEntry[];
  categories?: Record<string, string[]>;
}

interface IndexEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  icon: boolean;
  tags: string[];
}

/**
 * The pack, put in the first time the table is empty.
 *
 * Seven hundred files, so it says how it is getting on: a boot that goes quiet for
 * a minute is a boot somebody kills.
 */
export async function seedAnimations(
  db: Db,
  say: (line: string) => void = () => {},
): Promise<number> {
  const already = await db.query<{ n: string }>(
    'select count(*)::text as n from animations where pack = $1',
    [SPEMOTES.pack],
  );
  if (Number(already[0]?.n ?? 0) > 0) return 0;

  const here = dirname(fileURLToPath(import.meta.url));
  const roots = [
    // Deployed beside the built front, and in the repository during development.
    join(here, '../emotes'),
    join(here, '../../../fabric-example-mod-26.2/src/main/resources/assets/npc_studio/emotes'),
    join(here, '../../fabric-example-mod-26.2/src/main/resources/assets/npc_studio/emotes'),
  ];

  let root = '';
  let index: PackIndex | null = null;
  for (const where of roots) {
    try {
      index = JSON.parse(await readFile(join(where, 'index.json'), 'utf8')) as PackIndex;
      root = where;
      break;
    } catch {
      // The next place, or none: a site without the pack is a site with an empty
      // animation catalogue, which it has to survive anyway.
    }
  }
  if (!index) {
    say('пак анимаций не найден — каталог анимаций начнётся пустым');
    return 0;
  }

  const present = new Set(await readdir(root));
  let put = 0;
  for (const entry of index.emotes) {
    try {
      const body = await readFile(join(root, `${entry.id}.json`));
      const icon = present.has(`${entry.id}.png`)
        ? await readFile(join(root, `${entry.id}.png`))
        : null;
      const ticks = ticksIn(body);

      const id = randomUUID();
      await db.query(
        `insert into animations (id, pack, slug, name, author, author_url, support_url,
                                 description, loop, ticks, body, icon)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (pack, slug) do nothing`,
        [
          id,
          SPEMOTES.pack,
          entry.id,
          plainName(entry.name) || entry.id,
          // The pack writes "SPEmotes" in every file; the person is Milyan.
          SPEMOTES.author,
          SPEMOTES.authorUrl,
          SPEMOTES.supportUrl,
          plainName(entry.description),
          ticks.loop,
          ticks.end,
          body,
          icon,
        ],
      );
      for (const tag of entry.tags ?? []) {
        await db.query(
          'insert into animation_tags (animation, tag) values ($1, $2) on conflict do nothing',
          [id, tag],
        );
      }
      put++;
      if (put % 100 === 0) say(`анимации: ${put} из ${index.emotes.length}`);
    } catch (why) {
      say(`анимация ${entry.id} не легла: ${String(why)}`);
    }
  }
  // The pack's own tree, kept as it is rather than worked out again: the game's
  // picker shows this one, and two answers to the same question is one too many.
  for (const [parent, under] of Object.entries(index.categories ?? {})) {
    await db.query('insert into tag_kinds (tag, parent) values ($1, null) on conflict do nothing', [
      parent,
    ]);
    for (const child of under) {
      await db.query(
        `insert into tag_kinds (tag, parent) values ($1, $2)
         on conflict (tag) do update set parent = excluded.parent`,
        [child, parent],
      );
    }
  }

  say(`анимации: положено ${put}, автор ${SPEMOTES.author} (${SPEMOTES.authorUrl})`);
  return put;
}

/**
 * How long it runs and whether it repeats, without parsing the keyframes.
 *
 * These are a quarter of a megabyte each and the answer is in the first few
 * hundred bytes. Reading all of it seven hundred times, to learn two numbers,
 * would make a first boot several minutes long for nothing.
 */
function ticksIn(body: Buffer): { end: number; loop: boolean } {
  // The header is at the front, but how far in depends on how long the name and
  // description are — and those carry a translation key as well as the words. So
  // a generous slice first, and the whole file only if that missed, which is the
  // difference between reading four kilobytes and reading a quarter of a megabyte
  // seven hundred times.
  const look = (text: string) => {
    const end = /"endTick"\s*:\s*(\d+)/.exec(text);
    return end ? { end: Number(end[1]), loop: /"isLoop"\s*:\s*"?true"?/.test(text) } : null;
  };
  return look(body.subarray(0, 4096).toString('utf8')) ?? look(body.toString('utf8')) ?? {
    end: 0,
    loop: false,
  };
}

/** Colour codes are for the game's own text and mean nothing anywhere else. */
function plainName(name: string): string {
  return (name ?? '').replace(/§./g, '').replace(/\s+/g, ' ').trim();
}
