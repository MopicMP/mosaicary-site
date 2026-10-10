import { randomUUID } from 'node:crypto';

import type { Db } from './db.js';
import {
  BLOCKS_ENOUGH,
  blocksApart,
  compare,
  printOf,
  verdictOf,
  type Print,
  type Verdict,
} from './pixels.js';

/**
 * Publishing, and what stands between somebody and publishing another person's work.
 *
 * <h2>What this can and cannot do</h2>
 *
 * It cannot establish who drew anything. Nothing can: a PNG carries no proof, and
 * every outside anchor — a name, an account, a link to somewhere it appeared
 * earlier — can be arranged by anybody willing to spend ten minutes. Pretending
 * otherwise would be worse than doing nothing, because a site that says "author"
 * as though it knew is a site that lends its credibility to whoever asked first.
 *
 * What it can do is three things, and together they are most of the way there:
 *
 * <ul>
 *   <li>make the same drawing impossible to publish twice, however it is edited;
 *   <li>never state authorship as a fact when all it has is somebody's word;
 *   <li>tell the person whose work it is, immediately, every time.
 * </ul>
 *
 * <h2>Why the first attempt is refused and not punished</h2>
 *
 * Because on a small site the common case is not theft, it is a person who
 * collected skins for five years and does not know where they came from. Punishing
 * that teaches nothing and drives away the people the site is for.
 *
 * And because an automatic punishment on a first attempt is a weapon: publish
 * somebody's work before they do, and they are penalised for publishing their own.
 * The refusal stands from the first moment; the penalty waits for the second, when
 * carelessness has been ruled out.
 *
 * <h2>Private is not touched by any of this</h2>
 *
 * Anybody may keep anything. A private skin is a copy on a shelf and making a copy
 * is not a claim about anything. All of this begins at the moment somebody asks the
 * site to put their name on something in front of other people.
 */

export type Origin = 'mine' | 'someone' | 'unknown';

export interface Blocked {
  ok: false;
  /** Which existing record this is the same as, so the person can be sent there. */
  against: string;
  verdict: Verdict;
  said: string;
  /** Whether this is the second time, which is what a penalty hangs on. */
  again: boolean;
}

export interface Allowed {
  ok: true;
  /** Set when it is close but not the same: worth a person's eye, not a refusal. */
  near?: { against: string; apart: number };
}

/** How long somebody cannot publish for, after a second attempt at the same thing. */
export const PENALTY_DAYS = 7;

/**
 * Everything that has to be true before a skin appears in front of other people.
 *
 * The order matters: the drawing is compared before anybody's claims are read,
 * because the comparison is the only part that cannot be talked around.
 */
export async function mayPublish(
  db: Db,
  skinId: string,
  who: string,
): Promise<Blocked | Allowed> {
  const mine = await printFor(db, skinId);
  if (!mine) return { ok: true };

  // Everything already public, cheapest signature first. Sixty-four blocks each,
  // so the whole catalogue is swept before anything larger is read.
  const rest = await db.query<{ skin_id: string; blocks: Uint8Array; exact: string }>(
    `select p.skin_id, p.blocks, p.exact
       from prints p
       join skins s on s.id = p.skin_id
      where s.visibility = 'public' and s.id <> $1`,
    [skinId],
  );

  const worthLooking: string[] = [];
  for (const other of rest) {
    if (other.exact === mine.print.exact) {
      // The same drawing exactly, whatever the file said. No need to look closer.
      return await refuse(db, who, skinId, other.skin_id, 'same');
    }
    if (blocksApart(Buffer.from(other.blocks), mine.print.blocks) <= BLOCKS_ENOUGH) {
      worthLooking.push(other.skin_id);
    }
  }

  let nearest: { against: string; apart: number } | null = null;
  for (const id of worthLooking) {
    const other = await printFor(db, id);
    if (!other) continue;
    const likeness = compare(mine.print, other.print);
    const verdict = verdictOf(likeness);
    if (verdict === 'same') return await refuse(db, who, skinId, id, 'same');
    if (verdict === 'close' && (!nearest || likeness.apart < nearest.apart)) {
      nearest = { against: id, apart: likeness.apart };
    }
  }

  return nearest ? { ok: true, near: nearest } : { ok: true };
}

/**
 * Refusing, telling the person whose work it is, and remembering that it happened.
 *
 * The notice goes out whether or not anything is done to the person who tried. Being
 * told is the thing an author actually wants, and it is the only part of this that
 * is useful when the attempt was innocent.
 */
async function refuse(
  db: Db,
  who: string,
  skinId: string,
  against: string,
  verdict: Verdict,
): Promise<Blocked> {
  const before = await db.query<{ id: string }>(
    'select id from attempts where who = $1 and against = $2',
    [who, against],
  );
  const again = before.length > 0;

  await db.query(
    'insert into attempts (id, who, skin_id, against, verdict) values ($1, $2, $3, $4, $5)',
    [randomUUID(), who, skinId, against, verdict],
  );

  const owner = await db.query<{ owner: string | null; name: string }>(
    'select owner, name from skins where id = $1',
    [against],
  );
  const told = owner[0];
  if (told?.owner && told.owner !== who) {
    const trying = await db.query<{ handle: string }>('select handle from users where id = $1', [
      who,
    ]);
    await db.query(
      'insert into notices (id, who, kind, about, said) values ($1, $2, $3, $4, $5)',
      [
        randomUUID(),
        told.owner,
        'copy',
        against,
        `${trying[0]?.handle ?? 'кто-то'} пробовал опубликовать «${told.name}» как своё. ` +
          (again ? 'Это уже не первый раз.' : 'Публикация отклонена.'),
      ],
    );
  }

  return {
    ok: false,
    against,
    verdict,
    again,
    said: again
      ? 'Этот рисунок уже есть на витрине, и ты пробуешь опубликовать его не в первый раз.'
      : 'Этот рисунок уже есть на витрине. Опубликовать его второй раз нельзя — можно открыть тот, что есть.',
  };
}

/** Whether somebody is currently barred from publishing, and until when. */
export async function barredUntil(db: Db, who: string): Promise<Date | null> {
  // Two refusals against the same work is the line. The first is carelessness and
  // is answered by a refusal; the second is a decision and is answered by a wait.
  const rows = await db.query<{ made: Date | string; n: string }>(
    `select max(made) as made, count(*)::text as n
       from attempts
      where who = $1 and verdict = 'same'
      group by against
      having count(*) > 1
      order by max(made) desc
      limit 1`,
    [who],
  );
  const last = rows[0];
  if (!last) return null;
  const until = new Date(new Date(last.made).getTime() + PENALTY_DAYS * 86_400_000);
  return until > new Date() ? until : null;
}

/** The prepared drawing for a skin, worked out and kept the first time it is needed. */
export async function printFor(db: Db, skinId: string): Promise<{ print: Print } | null> {
  const kept = await db.query<{ exact: string; blocks: Uint8Array; pixels: Uint8Array; ink: number }>(
    'select exact, blocks, pixels, ink from prints where skin_id = $1',
    [skinId],
  );
  if (kept[0]) {
    return {
      print: {
        exact: kept[0].exact,
        blocks: Buffer.from(kept[0].blocks),
        pixels: Buffer.from(kept[0].pixels),
        ink: kept[0].ink,
      },
    };
  }

  const rows = await db.query<{ bytes: Uint8Array }>('select bytes from skins where id = $1', [
    skinId,
  ]);
  if (!rows[0]) return null;
  try {
    const print = printOf(Buffer.from(rows[0].bytes));
    await db.query(
      `insert into prints (skin_id, exact, blocks, pixels, ink) values ($1, $2, $3, $4, $5)
       on conflict (skin_id) do nothing`,
      [skinId, print.exact, print.blocks, print.pixels, print.ink],
    );
    return { print };
  } catch {
    // A file that passed the header check and still will not decode. It cannot be
    // compared, so it cannot be shown to be a copy — and refusing everything that
    // cannot be checked would be a way of refusing anything unusual.
    return null;
  }
}
