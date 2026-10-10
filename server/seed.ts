import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Db } from './db.js';
import { refuse, shapeOf } from './png.js';

/**
 * The shipped samples, put into the database the first time it comes up empty.
 *
 * <h2>Why they go in rather than being served beside it</h2>
 *
 * Because otherwise the front end has two kinds of skin: the real ones from the
 * API and the sample ones from a file, each with its own address, its own shape and
 * its own path through every list, filter and window. That second path is where the
 * bugs live — it is exercised constantly while there is no real content and never
 * again afterwards, so it rots exactly when it starts to matter.
 *
 * Put in, they are ordinary rows that happen to belong to nobody. Nothing else in
 * the site knows they are special.
 *
 * <h2>Why they belong to nobody</h2>
 *
 * They were not drawn by whoever runs this. An owner of null says so, and it also
 * makes them impossible to rename or delete through the ordinary routes, which all
 * ask for a row whose owner is you.
 */

interface Sample {
  id: string;
  name: string;
  author: string;
  url: string;
  gender: string;
  tags: string[];
  mask: string | null;
  uploaded: string;
}

export async function seed(db: Db, say: (line: string) => void = () => {}): Promise<number> {
  const already = await db.query<{ n: string }>(
    "select count(*)::text as n from skins where owner is null",
  );
  if (Number(already[0]?.n ?? 0) > 0) return 0;

  const here = dirname(fileURLToPath(import.meta.url));
  // Beside the built front in production, and up out of `server/` when running
  // from source. Tried in order rather than guessed from an environment variable.
  const roots = [join(here, '../web/samples'), join(here, '../public/samples')];

  let list: Sample[] | null = null;
  let root = '';
  for (const where of roots) {
    try {
      list = JSON.parse(await readFile(join(where, 'catalogue.json'), 'utf8')) as Sample[];
      root = where;
      break;
    } catch {
      // The next one, or none at all — a site with no samples is a site with an
      // empty catalogue, which is a state it has to survive anyway.
    }
  }
  if (!list) {
    say('образцы не найдены — каталог начнётся пустым');
    return 0;
  }

  let put = 0;
  for (const sample of list) {
    try {
      const bytes = await readFile(join(root, sample.url.split('/').pop()!));
      const wrong = refuse(bytes);
      if (wrong) {
        say(`образец ${sample.name}: ${wrong}`);
        continue;
      }
      const shape = shapeOf(bytes);
      const id = randomUUID();
      // Named rather than claimed: the sample list says who drew these and
      // nobody here has shown anything, so the site says exactly that — a name
      // with "со слов" beside it. Even for its own demo content it does not get
      // to assert authorship as fact.
      await db.query(
        `insert into skins (id, owner, author, name, fingerprint, width, layout, gender,
                            visibility, bytes, created, author_name, origin)
         values ($1, null, $2, $3, $4, $5, $6, $7, 'public', $8, $9, $2, 'someone')`,
        [
          id,
          sample.author,
          sample.name,
          shape.fingerprint,
          shape.width,
          shape.layout,
          sample.gender,
          bytes,
          sample.uploaded,
        ],
      );
      if (sample.mask) {
        await db.query('insert into masks (skin_id, encoded) values ($1, $2)', [id, sample.mask]);
      }
      for (const tag of sample.tags ?? []) {
        await db.query('insert into tags (skin_id, tag) values ($1, $2) on conflict do nothing', [
          id,
          tag,
        ]);
      }
      put++;
    } catch (why) {
      say(`образец ${sample.name} не лёг: ${String(why)}`);
    }
  }
  if (put) say(`каталог: положено образцов — ${put}`);
  return put;
}
