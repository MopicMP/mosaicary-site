import { COMMENTS_PER_HOUR, COMMENT_GAP_MS, TALK_SHOWN } from '../shared/talkRules.js';
import type { GoneBy } from '../shared/talkWire.js';
import { WALL_SAID, isSubject, readReview, type Subject, type WallNo } from '../shared/wallRules.js';
import type { Review, Wall } from '../shared/wallWire.js';
import { accountOf, mustBe, type Account } from './auth.js';
import { APPEAL } from './models.js';
import { OPEN, bodyOf, json, now, type Ctx } from './reply.js';
import { freshId } from './sign.js';

/**
 * The wall of reviews: what people say about the plugin and about the site.
 *
 * <h2>Why this is in the comments table</h2>
 *
 * A review needs a heart, a report, removal with a reason its author is told, one
 * level of answers and a queue for whoever runs the site — which is, line for line,
 * what a comment under a model already has. So a review is a comment whose subject is
 * the plugin or the site instead of a model, and everything done to a single comment
 * is done to a review by the same routes in `talk.ts`. What is here is only the wall
 * itself: reading it, writing on it, and rewriting one's own.
 *
 * <h2>Why the owner's hand is not on this wall</h2>
 *
 * Under a model, the person the model belongs to may take a comment off their own
 * page. On a wall of reviews about our own work that same rule would make the wall
 * worthless: whoever made the thing would be quietly removing the bad reviews of it.
 * So a review comes off by its author's hand or by the site's, with a reason and the
 * way to object — never by the hand of the person being reviewed.
 *
 * <h2>One review per person per thing</h2>
 *
 * Kept by a unique index and not by a polite check, because two sent in the same
 * instant from a script would both pass a check. The one you have can be rewritten,
 * which is why `edited` exists: a review that was silently swapped for another is
 * worse than no reviews at all.
 */

interface ReviewRow {
  id: string;
  user_id: string;
  about: Subject;
  said: string;
  made: string;
  edited: string | null;
  reply_to: string | null;
  gone: number;
  gone_by: GoneBy | null;
  likes: number;
  by_handle: string;
  by_face: string | null;
  mine_like: number;
}

const SAID = `
  select c.id, c.user_id, c.about, c.said, c.made, c.edited, c.reply_to, c.gone, c.gone_by, c.likes,
         u.handle as by_handle, u.face as by_face`;

/** A refusal with a code, which the page and the plugin each say in their own words. */
function no(status: number, code: WallNo, extra: Record<string, unknown> = {}): Response {
  return json({ no: code, error: WALL_SAID[code], ...extra }, status, { ...OPEN });
}

/** The routes under `/api/feedback`, and rewriting one's own review, or null. */
export async function wallRoute(c: Ctx, path: string): Promise<Response | null> {
  const method = c.request.method;
  if (path === '/api/feedback') {
    if (method === 'GET') return wall(c);
    if (method === 'POST') return write(c);
    return null;
  }
  const one = /^\/api\/talk\/([0-9A-Za-z]{12})$/.exec(path);
  if (one && method === 'PATCH') return rewrite(c, one[1]!);
  return null;
}

function reviewOf(row: ReviewRow, account: Account | null): Review {
  const gone = row.gone ? (row.gone_by ?? 'site') : null;
  return {
    id: row.id,
    by: { id: row.user_id, handle: row.by_handle, face: row.by_face },
    about: row.about,
    said: row.said,
    made: row.made,
    edited: row.edited,
    replyTo: row.reply_to,
    likes: row.likes,
    liked: row.mine_like > 0,
    // The author's own, or the site's. Never the hand of whoever is being reviewed.
    mayRemove: !gone && !!account && (account.id === row.user_id || account.admin),
    gone,
  };
}

/**
 * The wall, narrowed to one thing or not narrowed at all.
 *
 * Read by anybody, signed in or not: a wall of reviews that only shows itself to
 * people who signed in is a wall that answers the one question it exists for —
 * "is this any good?" — with "sign in first".
 */
async function wall(c: Ctx): Promise<Response> {
  const account = await accountOf(c);
  const asked = c.url.searchParams.get('about');
  const only = isSubject(asked) ? asked : null;
  const me = account?.id ?? '';

  const [said, counted, mine] = await c.env.DB.batch([
    // Numbered places, not bare ones: a bare `?` after a numbered one starts counting
    // again from the largest number used, and the narrowing is asked about twice.
    // An answer carries the subject of the review it answers, so narrowing by subject
    // keeps the answers with it and needs nothing said about `reply_to`.
    c.env.DB.prepare(
      `${SAID}, (select count(*) from comment_likes l where l.comment_id = c.id and l.user_id = ?1) as mine_like
         from comments c join users u on u.id = c.user_id
        where c.about <> 'model' and (?2 = '' or c.about = ?2)
        order by c.made desc limit ?3`,
    ).bind(me, only ?? '', TALK_SHOWN),
    c.env.DB.prepare(
      `select about, count(*) as n from comments
        where about <> 'model' and reply_to is null and gone = 0 group by about`,
    ),
    c.env.DB.prepare(
      `${SAID}, 0 as mine_like from comments c join users u on u.id = c.user_id
        where c.about <> 'model' and c.reply_to is null and c.gone = 0 and c.user_id = ?`,
    ).bind(me),
  ]);

  const counts = { plugin: 0, site: 0 } as Record<Subject, number>;
  for (const row of (counted?.results ?? []) as { about: string; n: number }[]) {
    if (isSubject(row.about)) counts[row.about] = row.n;
  }

  const answer: Wall = {
    reviews: ((said?.results ?? []) as ReviewRow[]).map((row) => reviewOf(row, account)),
    counts,
    mine: me ? ((mine?.results ?? []) as ReviewRow[]).map((row) => reviewOf(row, account)) : [],
    // Barred by hand means barred from the wall as well: somebody who may not put a
    // model up has no business leaving reviews in the meantime.
    mayWrite: !!account && !(account.barredUntil && account.barredUntil > now()),
  };
  // Never cached: a review written a second ago has to be on the page of the person
  // who wrote it, and `mayRemove` depends on who is asking.
  return json(answer, 200, { 'cache-control': 'no-store', ...OPEN });
}

/**
 * How long until this person may write again, or null.
 *
 * The same two numbers as the talk under a model, counted over the same table — a
 * script does not care which wall it is flooding. Asked here rather than borrowed from
 * `talk.ts` because that one answers in a sentence and this one answers in a code.
 */
async function waitFor(c: Ctx, account: Account): Promise<WallNo | null> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const seen = await c.env.DB.prepare(
    'select count(*) as n, max(made) as last from comments where user_id = ? and made > ?',
  )
    .bind(account.id, hourAgo)
    .first<{ n: number; last: string | null }>();
  if (!seen) return null;
  if (seen.n >= COMMENTS_PER_HOUR) return 'wall_hour';
  if (seen.last && Date.now() - Date.parse(seen.last) < COMMENT_GAP_MS) return 'wall_often';
  return null;
}

/** The first line of a review, short, for a notice about it. */
function excerpt(said: string): string {
  const line = said.replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

const THING: Record<Subject, string> = { plugin: 'плагине', site: 'сайте' };

/**
 * Who runs the site, by their accounts.
 *
 * `ADMINS` names people by the provider's id, which is not the id a notice is
 * addressed to, so the identities are asked. Empty when nobody is named: the site
 * works without an operator set, and nothing is told to nobody.
 */
async function runnersOf(c: Ctx): Promise<string[]> {
  const listed = (c.env.ADMINS ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);
  if (listed.length === 0) return [];
  const holes = listed.map(() => '?').join(', ');
  const { results } = await c.env.DB.prepare(
    `select distinct user_id from identities where provider || ':' || subject in (${holes})`,
  )
    .bind(...listed)
    .all<{ user_id: string }>();
  return results.map((row) => row.user_id);
}

async function write(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (account.barredUntil && account.barredUntil > now()) {
    // `APPEAL` travels along: a refusal naming no way to object to it is the one thing
    // article 17 does not allow, and the code alone names none.
    return no(403, 'wall_barred', { barredUntil: account.barredUntil, appeal: APPEAL });
  }

  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const writing = readReview(body);
  if ('no' in writing) return no(400, writing.no);

  const waiting = await waitFor(c, account);
  if (waiting) return no(429, waiting);

  // One level of answers. Answering an answer attaches to the same review, as under a
  // model: the press happened under the words being read, and refusing it would be
  // refusing somebody for the layout.
  let about: Subject;
  let root: string | null = null;
  let answered: string | null = null;
  if (writing.replyTo) {
    const parent = await c.env.DB.prepare(
      'select id, user_id, about, reply_to, gone from comments where id = ?',
    )
      .bind(writing.replyTo)
      .first<{ id: string; user_id: string; about: string; reply_to: string | null; gone: number }>();
    if (!parent || !isSubject(parent.about)) return no(404, 'wall_gone');
    if (parent.gone) return no(410, 'wall_gone');
    about = parent.about;
    root = parent.reply_to ?? parent.id;
    answered = parent.user_id;
  } else {
    about = writing.about!;
    const already = await c.env.DB.prepare(
      "select id from comments where about = ? and user_id = ? and reply_to is null and gone = 0",
    )
      .bind(about, account.id)
      .first<{ id: string }>();
    // Said before the insert for the sentence it gives, and again by the unique index
    // for the two that arrive in the same instant.
    if (already) return no(409, 'wall_already', { already: already.id });
  }

  const id = freshId();
  const at = now();
  const telling: D1PreparedStatement[] = [];
  const tell = (who: string, kind: 'comment' | 'reply', what: string) =>
    telling.push(
      c.env.DB.prepare('insert into notices (id, who, kind, about, said, made) values (?, ?, ?, ?, ?, ?)').bind(
        freshId(),
        who,
        kind,
        // Null, and not the review's own id: `notices.about` points into the models
        // table, and a review is not a model. The bell shows such a notice without a
        // link, which is the truth — there is no model to open.
        null,
        what,
        at,
      ),
    );
  // The name in quotes, like a model's: one dropped bare into a Russian sentence is
  // read as part of it.
  if (answered && answered !== account.id) {
    tell(answered, 'reply', `Ответ от «${account.handle}» на твой отзыв: «${excerpt(writing.said)}»`);
  }
  // A review of our own work is told to whoever runs the site, because otherwise it is
  // found only by somebody opening the page. An answer is not: it is told to the person
  // it answers, and a wall where every exchange rings the bell is a bell nobody reads.
  if (!writing.replyTo) {
    for (const runner of await runnersOf(c)) {
      if (runner !== account.id) {
        tell(runner, 'comment', `Отзыв от «${account.handle}» о ${THING[about]}: «${excerpt(writing.said)}»`);
      }
    }
  }

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        'insert into comments (id, model_id, about, user_id, reply_to, said, made) values (?, ?, ?, ?, ?, ?, ?)',
      ).bind(id, null, about, account.id, root, writing.said, at),
      ...telling,
    ]);
  } catch (why) {
    // The unique index, almost certainly: two sent at once, or two windows open.
    if (String(why).includes('comments_once')) return no(409, 'wall_already');
    throw why;
  }

  const made: Review = {
    id,
    by: { id: account.id, handle: account.handle, face: account.face },
    about,
    said: writing.said,
    made: at,
    edited: null,
    replyTo: root,
    likes: 0,
    liked: false,
    mayRemove: true,
    gone: null,
  };
  return json(made, 201, { 'cache-control': 'no-store', ...OPEN });
}

/**
 * One's own review, rewritten.
 *
 * Only a review, and only one's own. A comment under a model is not rewritable: it is
 * part of a conversation, and changing it changes what the answers under it answer. A
 * review is one person's standing opinion about something they went on using, so it
 * has to be allowed to change — and `edited` says that it did.
 */
async function rewrite(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const kept = await c.env.DB.prepare('select id, user_id, about, reply_to, gone from comments where id = ?')
    .bind(id)
    .first<{ id: string; user_id: string; about: string; reply_to: string | null; gone: number }>();
  if (!kept || !isSubject(kept.about) || kept.reply_to !== null) return no(404, 'wall_gone');
  if (kept.user_id !== account.id) return no(403, 'wall_not_mine');
  if (kept.gone) return no(410, 'wall_gone');

  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const writing = readReview({ ...body, about: kept.about, replyTo: null });
  if ('no' in writing) return no(400, writing.no);

  const at = now();
  await c.env.DB.prepare('update comments set said = ?, edited = ? where id = ?').bind(writing.said, at, id).run();
  return json({ ok: true, said: writing.said, edited: at }, 200, { 'cache-control': 'no-store', ...OPEN });
}
