import { REPORT_SAID_MAX, cleanDescription } from '../shared/modelRules.js';
import { citing, isBreakable } from '../shared/paperText.js';
import {
  COMMENTS_PER_HOUR,
  COMMENT_GAP_MS,
  TAKE_WHY_MIN,
  TALK_SHOWN,
  isCommentReportKind,
  readWriting,
} from '../shared/talkRules.js';
import type { Comment, GoneBy, Talk } from '../shared/talkWire.js';
import { accountOf, mustBe, type Account } from './auth.js';
import { APPEAL, seenRow } from './models.js';
import { bodyOf, json, now, refuse, type Ctx } from './reply.js';
import { freshId } from './sign.js';

/**
 * The talk under a model: comments, hearts on them, and taking them off.
 *
 * <h2>Shown at once, and what makes that safe</h2>
 *
 * A comment appears the moment it is written. A catalogue where an answer to "which
 * version is this rig for?" turns up tomorrow is a catalogue where nobody asks. What
 * holds the line is the other direction instead: anybody can report a comment, the
 * person a model belongs to can take one off their own page, and whoever runs the site
 * can take any of them off — and every removal that was not the author's own carries a
 * reason and the way to object to it, which article 17 of Regulation (EU) 2022/2065
 * asks for.
 *
 * <h2>As absent as the model</h2>
 *
 * Every route here goes through `seenRow` first. A comment thread that answers while
 * the model itself says "there is no such model" would tell a stranger that a private
 * model exists, who is talking about it, and how much — so the talk is reachable
 * exactly when the model is.
 *
 * <h2>Rows that stay after they are gone</h2>
 *
 * Taking a comment off empties what was written and keeps the row: the replies hang
 * from it, and a decision about somebody's words has to be answerable afterwards. A
 * row with nothing hanging from it is not shown at all — that is decided by the page,
 * in `threadsOf`, because it is the page that knows what else is on the screen.
 */

interface SaidRow {
  id: string;
  user_id: string;
  /** Null for a review of the work, which hangs under no model. */
  model_id: string | null;
  said: string;
  made: string;
  reply_to: string | null;
  gone: number;
  gone_by: GoneBy | null;
  likes: number;
  by_handle: string;
  by_face: string | null;
  mine_like: number;
}

const SAID = `
  select c.id, c.user_id, c.model_id, c.said, c.made, c.reply_to, c.gone, c.gone_by, c.likes,
         u.handle as by_handle, u.face as by_face`;

/** The routes under `/api/models/<id>/talk`, `/api/talk` and `/api/admin/talk`, or null. */
export async function talkRoute(c: Ctx, path: string): Promise<Response | null> {
  const method = c.request.method;

  const under = /^\/api\/models\/([0-9A-Za-z]{12})\/talk$/.exec(path);
  if (under) {
    const id = under[1]!;
    if (method === 'GET') return talkOf(c, id);
    if (method === 'POST') return write(c, id);
    return null;
  }

  if (path === '/api/admin/talk' && method === 'GET') return queue(c);

  const one = /^\/api\/talk\/([0-9A-Za-z]{12})(?:\/([a-z]+))?$/.exec(path);
  if (!one) return null;
  const id = one[1]!;
  switch (`${method} ${one[2] ?? ''}`) {
    case 'DELETE ':
      return take(c, id);
    case 'POST like':
      return heart(c, id, true);
    case 'DELETE like':
      return heart(c, id, false);
    case 'POST report':
      return report(c, id);
    default:
      return null;
  }
}

/**
 * Whether this person may take this comment off, and under which name.
 *
 * Three different acts wearing one button. The author deleting their own words is not
 * moderation and needs no reason; the person a model belongs to clearing their own
 * page, and whoever runs the site clearing anything, both are — and both are told to
 * the author with what they said and how to object.
 */
function removerOf(account: Account, comment: { user_id: string }, owner: string): GoneBy | null {
  if (account.id === comment.user_id) return 'author';
  if (account.admin) return 'site';
  if (account.id === owner) return 'owner';
  return null;
}

function commentOf(row: SaidRow, account: Account | null, owner: string): Comment {
  const gone = row.gone ? (row.gone_by ?? 'site') : null;
  return {
    id: row.id,
    by: { id: row.user_id, handle: row.by_handle, face: row.by_face },
    said: row.said,
    made: row.made,
    replyTo: row.reply_to,
    likes: row.likes,
    liked: row.mine_like > 0,
    mayRemove: !gone && !!account && removerOf(account, row, owner) !== null,
    gone,
  };
}

async function talkOf(c: Ctx, id: string): Promise<Response> {
  const account = await accountOf(c);
  const row = await seenRow(c, id, account);
  if (row instanceof Response) return row;
  const { results } = await c.env.DB.prepare(
    `${SAID}, (select count(*) from comment_likes l where l.comment_id = c.id and l.user_id = ?) as mine_like
       from comments c join users u on u.id = c.user_id
      where c.model_id = ?
      order by c.made limit ?`,
  )
    .bind(account?.id ?? '', id, TALK_SHOWN)
    .all<SaidRow>();
  const said: Talk = {
    comments: results.map((one) => commentOf(one, account, row.owner)),
    count: row.comments,
    // Barred by hand means barred from writing as well. Somebody who may not put a
    // model up has no business leaving a hundred comments in the meantime.
    mayWrite: !!account && !(account.barredUntil && account.barredUntil > now()),
  };
  // Never cached: a comment written a second ago has to be on the page of the person
  // who wrote it, and whether `mayRemove` is true depends on who is asking.
  return json(said, 200, { 'cache-control': 'no-store' });
}

/**
 * How long until this person may write again, or null.
 *
 * Two numbers, both about scripts rather than about people: a few seconds between
 * comments, and a ceiling for the hour. The second is what a loop runs into; the first
 * is what a double-tapped button runs into.
 */
async function waitFor(c: Ctx, account: Account): Promise<string | null> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const seen = await c.env.DB.prepare(
    'select count(*) as n, max(made) as last from comments where user_id = ? and made > ?',
  )
    .bind(account.id, hourAgo)
    .first<{ n: number; last: string | null }>();
  if (!seen) return null;
  if (seen.n >= COMMENTS_PER_HOUR) return 'на этот час комментариев достаточно, продолжи позже';
  if (seen.last && Date.now() - Date.parse(seen.last) < COMMENT_GAP_MS) {
    return 'подожди пару секунд перед следующим комментарием';
  }
  return null;
}

/** The first line of a comment, short, for a notice about it. */
function excerpt(said: string): string {
  const line = said.replace(/\s+/g, ' ').trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

async function write(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await seenRow(c, id, account);
  if (row instanceof Response) return row;
  if (account.barredUntil && account.barredUntil > now()) {
    return refuse(403, `писать пока нельзя. ${APPEAL}`, { barredUntil: account.barredUntil });
  }

  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const writing = readWriting(body);
  if ('error' in writing) return refuse(400, writing.error);

  const wait = await waitFor(c, account);
  if (wait) return refuse(429, wait);

  // One level of replies. Answering an answer attaches to the same root rather than
  // being refused: the person pressed "reply" under the words they were reading, and
  // telling them off for it would be telling them off for the layout.
  let root: string | null = null;
  let answered: string | null = null;
  if (writing.replyTo) {
    const parent = await c.env.DB.prepare('select id, user_id, model_id, reply_to, gone from comments where id = ?')
      .bind(writing.replyTo)
      .first<{ id: string; user_id: string; model_id: string; reply_to: string | null; gone: number }>();
    if (!parent || parent.model_id !== id) return refuse(404, 'этого комментария уже нет');
    if (parent.gone) return refuse(410, 'этот комментарий снят, на него нельзя ответить');
    root = parent.reply_to ?? parent.id;
    answered = parent.user_id;
  }

  const cid = freshId();
  const at = now();
  const notices: D1PreparedStatement[] = [];
  const tell = (who: string, kind: 'comment' | 'reply', what: string) =>
    notices.push(
      c.env.DB.prepare('insert into notices (id, who, kind, about, said, made) values (?, ?, ?, ?, ?, ?)').bind(
        freshId(),
        who,
        kind,
        id,
        what,
        at,
      ),
    );
  // At most one notice per person about one comment. An answer to the owner of the
  // model under their own model is one event, not two, and the more exact word for it
  // is "answered you".
  // The name is in quotes, like the model's: one dropped bare into a Russian sentence
  // is read as part of it, and "Ответ от Автор модели" asks it to take a case a name
  // somebody chose for themselves cannot be put into.
  if (answered && answered !== account.id) {
    tell(
      answered,
      'reply',
      `Ответ от «${account.handle}» под моделью «${row.name}»: «${excerpt(writing.said)}»`,
    );
  }
  if (row.owner !== account.id && row.owner !== answered) {
    tell(
      row.owner,
      'comment',
      `Комментарий от «${account.handle}» под моделью «${row.name}»: «${excerpt(writing.said)}»`,
    );
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      'insert into comments (id, model_id, user_id, reply_to, said, made) values (?, ?, ?, ?, ?, ?)',
    ).bind(cid, id, account.id, root, writing.said, at),
    countOn(c, id),
    ...notices,
  ]);

  // The catalogue list keeps its count for up to a minute, and is left alone on
  // purpose: dropping the whole edge cache on every comment would make the cache
  // useless on exactly the models people talk about most.
  const said: Comment = {
    id: cid,
    by: { id: account.id, handle: account.handle, face: account.face },
    said: writing.said,
    made: at,
    replyTo: root,
    likes: 0,
    liked: false,
    mayRemove: true,
    gone: null,
  };
  return json(said, 201, { 'cache-control': 'no-store' });
}

/** The model's own count, recounted from the comments rather than added to. */
function countOn(c: Ctx, model: string): D1PreparedStatement {
  return c.env.DB.prepare(
    'update models set comments = (select count(*) from comments where model_id = ? and gone = 0) where id = ?',
  ).bind(model, model);
}

interface Kept {
  id: string;
  user_id: string;
  model_id: string | null;
  /** 'model', or which thing this is a review of: see `wall.ts`. */
  about: string;
  said: string;
  gone: number;
  model_owner: string | null;
  model_name: string | null;
}

/**
 * One comment with the model it hangs under, if it hangs under one.
 *
 * Joined on the left, because a review of the plugin or of the site is a comment with
 * no model — and an inner join would quietly answer "there is no such comment" for
 * every review, which is the kind of refusal nobody can debug.
 */
async function keptOne(c: Ctx, cid: string): Promise<Kept | null> {
  return c.env.DB.prepare(
    `select c.id, c.user_id, c.model_id, c.about, c.said, c.gone, m.owner as model_owner, m.name as model_name
       from comments c left join models m on m.id = c.model_id
      where c.id = ?`,
  )
    .bind(cid)
    .first<Kept>();
}

/**
 * The refusal to hand back when the model this comment hangs under is not for this
 * person's eyes, or null when there is nothing in the way.
 *
 * A review has no model and so has nothing to hide behind: the wall it is on is public,
 * and everything about it is as visible as the wall.
 */
async function hiddenWith(c: Ctx, kept: Kept, account: Account | null): Promise<Response | null> {
  if (!kept.model_id) return null;
  const row = await seenRow(c, kept.model_id, account);
  return row instanceof Response ? row : null;
}

/** What was taken off, in the words of a notice to the person who wrote it. */
function wordFor(kept: Kept): string {
  if (kept.about === 'plugin') return 'отзыв о плагине';
  if (kept.about === 'site') return 'отзыв о сайте';
  return `комментарий под моделью «${kept.model_name}»`;
}

async function take(c: Ctx, cid: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const kept = await keptOne(c, cid);
  if (!kept) return refuse(404, 'такого комментария нет');
  const hidden = await hiddenWith(c, kept, account);
  if (hidden) return hidden;
  // On the wall of reviews there is no owner's hand: a review comes off by its
  // author's or by the site's, never by the hand of whoever is being reviewed.
  const by = removerOf(account, kept, kept.model_owner ?? '');
  if (!by) return refuse(403, 'этот комментарий не твой');
  // With a key, only one's own words. Clearing somebody else's comment off one's model
  // is a decision with a reason that its author is told; a key that got out should not
  // be able to wipe a page of other people's comments.
  if (account.byKey && by !== 'author') return refuse(403, 'чужие комментарии снимают на сайте, после входа');
  if (kept.gone) return json({ ok: true });

  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const why = cleanDescription(body.said).slice(0, REPORT_SAID_MAX);
  // A reason is asked for whenever the words being taken off are somebody else's.
  // Article 17 wants the grounds, not the fact alone, and "removed" with no grounds is
  // also what makes a person think they were silenced for disagreeing.
  if (by !== 'author' && why.length < TAKE_WHY_MIN) {
    return refuse(400, 'напиши, за что снимается комментарий');
  }
  // The site names the clause, as with a model. The model's owner may and need not:
  // their page is theirs, and not every comment they take off broke a rule of ours.
  let rule: string | null = null;
  if (body.rule !== undefined && body.rule !== null && body.rule !== '') {
    if (!isBreakable(body.rule)) return refuse(400, 'такого пункта в правилах нет');
    rule = body.rule;
  }
  if (by === 'site' && rule === null) return refuse(400, 'выбери пункт правил, который нарушен');

  const at = now();
  const work: D1PreparedStatement[] = [
    c.env.DB.prepare("update comments set gone = 1, gone_by = ?, why = ?, said = '' where id = ?").bind(by, why, cid),
    // The decision answers every report about this comment; what comes after is a new
    // question about a comment that is already gone.
    c.env.DB.prepare('delete from comment_reports where comment_id = ?').bind(cid),
  ];
  // A model keeps a count of its comments so a page of cards is one query. A review
  // belongs to no model and there is nothing to recount.
  if (kept.model_id) work.push(countOn(c, kept.model_id));
  if (by !== 'author') {
    work.push(
      c.env.DB.prepare('insert into notices (id, who, kind, about, said, made, rule) values (?, ?, ?, ?, ?, ?, ?)').bind(
        freshId(),
        kept.user_id,
        'commentgone',
        kept.model_id,
        `Твой ${wordFor(kept)} снят ${by === 'site' ? 'тем, кто ведёт сайт' : 'автором модели'}.${
          rule ? ` ${citing(rule)}` : ''
        } ${why} ${APPEAL}`,
        at,
        rule,
      ),
    );
  }
  await c.env.DB.batch(work);
  return json({ ok: true, gone: by });
}

async function heart(c: Ctx, cid: string, on: boolean): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const kept = await keptOne(c, cid);
  if (!kept) return refuse(404, 'такого комментария нет');
  const hidden = await hiddenWith(c, kept, account);
  if (hidden) return hidden;
  if (kept.gone) return refuse(410, 'этот комментарий снят');
  const [, , counted] = await c.env.DB.batch([
    on
      ? c.env.DB.prepare('insert or ignore into comment_likes (comment_id, user_id, made) values (?, ?, ?)').bind(
          cid,
          account.id,
          now(),
        )
      : c.env.DB.prepare('delete from comment_likes where comment_id = ? and user_id = ?').bind(cid, account.id),
    c.env.DB.prepare(
      'update comments set likes = (select count(*) from comment_likes where comment_id = ?) where id = ?',
    ).bind(cid, cid),
    c.env.DB.prepare('select likes from comments where id = ?').bind(cid),
  ]);
  const likes = (counted?.results[0] as { likes: number } | undefined)?.likes ?? 0;
  return json({ likes, liked: on });
}

async function report(c: Ctx, cid: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const kept = await keptOne(c, cid);
  if (!kept) return refuse(404, 'такого комментария нет');
  const hidden = await hiddenWith(c, kept, account);
  if (hidden) return hidden;
  if (kept.gone) return refuse(410, 'этот комментарий снят');
  if (kept.user_id === account.id) return refuse(400, 'это твой комментарий');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  if (!isCommentReportKind(body.kind)) return refuse(400, 'выбери, что не так');
  const said = cleanDescription(body.said).slice(0, REPORT_SAID_MAX);
  // One report per person per comment, the latest standing: saying it twice is not
  // two people saying it.
  await c.env.DB.prepare(
    `insert into comment_reports (id, comment_id, user_id, kind, said, made) values (?, ?, ?, ?, ?, ?)
     on conflict (comment_id, user_id) do update set kind = excluded.kind, said = excluded.said, made = excluded.made`,
  )
    .bind(freshId(), cid, account.id, body.kind, said, now())
    .run();
  return json({ ok: true });
}

/**
 * Comments somebody reported, for whoever runs the site.
 *
 * Kept apart from the queue of models: a reported comment is answered by taking the
 * comment off, and a reported model by taking the model down, so mixing them into one
 * list would mean a list where half the buttons do nothing.
 */
async function queue(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (!account.admin) return refuse(403, 'это может только тот, кто ведёт сайт');
  const [said, reports] = await c.env.DB.batch([
    // The models joined on the left: a reported review has no model, and an inner join
    // would leave exactly those reports out of the only list that answers them.
    c.env.DB.prepare(
      `${SAID}, 0 as mine_like, c.about, m.name as model_name, m.owner as model_owner
         from comments c join users u on u.id = c.user_id left join models m on m.id = c.model_id
        where c.gone = 0 and exists (select 1 from comment_reports r where r.comment_id = c.id)
        order by c.made desc limit 200`,
    ),
    c.env.DB.prepare(
      `select r.comment_id, r.kind, r.said, r.made, u.handle
         from comment_reports r left join users u on u.id = r.user_id
        order by r.made desc limit 1000`,
    ),
  ]);
  const about = new Map<string, { kind: string; said: string; made: string; by: string | null }[]>();
  for (const one of (reports?.results ?? []) as {
    comment_id: string;
    kind: string;
    said: string;
    made: string;
    handle: string | null;
  }[]) {
    const list = about.get(one.comment_id) ?? [];
    list.push({ kind: one.kind, said: one.said, made: one.made, by: one.handle });
    about.set(one.comment_id, list);
  }
  return json(
    (
      (said?.results ?? []) as (SaidRow & { about: string; model_name: string | null; model_owner: string | null })[]
    ).map((row) => ({
      comment: commentOf(row, account, row.model_owner ?? ''),
      // Null for a review: there is no model to open, and the list says what it is
      // about instead.
      model: row.model_id && row.model_name ? { id: row.model_id, name: row.model_name } : null,
      about: row.about,
      reports: about.get(row.id) ?? [],
    })),
    200,
    { 'cache-control': 'no-store' },
  );
}
