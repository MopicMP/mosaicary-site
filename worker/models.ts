import { viewFor, type AdultView } from '../shared/adult.js';
import { sameFacts, type Facts } from '../shared/bbmodel.js';
import {
  DAILY_UPLOADS,
  PENALTY_DAYS,
  PREVIEW_MAX_BYTES,
  QUOTA_BYTES,
  REPORT_SAID_MAX,
  cleanDescription,
  cleanName,
  cleanTags,
  cleanUrl,
  isLicense,
  isReportKind,
  cleanBackground,
  cleanLook,
  readDeclared,
  readFacts,
  useOf,
} from '../shared/modelRules.js';
import type { ModelDetail, ModelSummary, Notice } from '../shared/modelWire.js';
import { citing, isBreakable } from '../shared/paperText.js';
import { closedHere } from './adult.js';
import { accountOf, mustBe, type Account } from './auth.js';
import { OPEN, bodyOf, json, now, refuse, type Ctx } from './reply.js';
import { freshId } from './sign.js';

/**
 * Models: putting them up, finding them, taking them down.
 *
 * <h2>The Worker never opens a file</h2>
 *
 * A free Worker has ten milliseconds of processor time per request, and reading a
 * ten-megabyte model takes nearly a second. So everything that needs the inside of a
 * file — counting cubes, taking local paths out, the two fingerprints, the picture —
 * is done by the uploader's page, and the Worker keeps what it is told.
 *
 * What stops the page lying is two things. The bytes are handed to R2 with the
 * SHA-256 the page declared, and R2 refuses them if they do not hash to it, so the
 * file is the one that was described. And every page that opens the model counts
 * again from the file itself, shows its own numbers, and reports here when they
 * differ from the declared ones — which puts the model in front of whoever runs the
 * site.
 *
 * <h2>Two steps, and why</h2>
 *
 * The description goes first as JSON and makes a row; the file follows as itself to
 * that row's address. One request carrying both would mean a form, and a form means
 * parsing twenty-five megabytes inside the Worker to find where the JSON ends.
 */

interface Row {
  id: string;
  owner: string;
  name: string;
  description: string;
  format: string;
  version: string;
  box_uv: number;
  cubes: number;
  meshes: number;
  bones: number;
  animations: number;
  textures: number;
  embedded: number;
  texture_width: number;
  texture_height: number;
  density: number;
  sha256: string;
  print: string;
  shape: string;
  bytes: number;
  state: 'incoming' | 'ready';
  has_preview: number;
  visibility: 'private' | 'public';
  license: string | null;
  author_name: string | null;
  author_url: string | null;
  hidden: number;
  doubted: number;
  adult: number;
  adult_fixed: number;
  background: string | null;
  look_spin: number | null;
  look_tilt: number | null;
  published: string | null;
  created: string;
  updated: string;
  downloads: number;
  likes: number;
  comments: number;
  by_handle: string;
  by_face: string | null;
  tags: string | null;
}

const SELECT = `
  select m.*, u.handle as by_handle, u.face as by_face,
         (select group_concat(t.tag, ',') from model_tags t where t.model_id = m.id) as tags
    from models m
    join users u on u.id = m.owner`;

/**
 * A model anybody can see, in one place.
 *
 * Exported because the counts in the foot of the page have to mean the same thing as
 * the catalogue above them: a second copy of this condition would drift the day one of
 * the three words changes, and the page would say there are more models than it shows.
 */
export const PUBLIC = `m.visibility = 'public' and m.hidden = 0 and m.state = 'ready'`;

const fileKey = (id: string) => `models/${id}`;
const previewKey = (id: string) => `previews/${id}`;

/**
 * Said at the end of every decision an author is told about.
 *
 * Article 17 of Regulation (EU) 2022/2065 wants the reason and the ways of objecting
 * to it in the same message, not on a page somebody has to go looking for afterwards.
 * Only the decisions that go against an author carry it: being told a model is back in
 * the catalogue needs no way to object.
 */
export const APPEAL =
  'Если решение кажется ошибкой, напиши нам — адрес на странице «Контакты». Его можно оспорить.';

function summaryOf(row: Row): ModelSummary {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    use: useOf(row.format),
    version: row.version,
    boxUv: !!row.box_uv,
    cubes: row.cubes,
    meshes: row.meshes,
    bones: row.bones,
    animations: row.animations,
    textures: row.textures,
    textureWidth: row.texture_width,
    textureHeight: row.texture_height,
    density: row.density,
    bytes: row.bytes,
    tags: row.tags ? row.tags.split(',').sort() : [],
    license: row.license,
    author: row.author_name ? { name: row.author_name, url: row.author_url } : null,
    by: { id: row.owner, handle: row.by_handle, face: row.by_face },
    published: row.published,
    created: row.created,
    updated: row.updated,
    downloads: row.downloads,
    likes: row.likes,
    comments: row.comments,
    preview: row.has_preview ? `/api/models/${row.id}/preview?v=${encodeURIComponent(row.updated)}` : null,
    visibility: row.visibility,
    hidden: !!row.hidden,
    adult: !!row.adult,
    background: row.background,
    // Both numbers or no angle at all: half an angle is worse than none, and this
    // is the shape a row takes before the column holding it was added.
    look:
      typeof row.look_spin === 'number' && typeof row.look_tilt === 'number'
        ? { spin: row.look_spin, tilt: row.look_tilt }
        : null,
  };
}

function factsOfRow(row: Row): Facts {
  return {
    format: row.format,
    version: row.version,
    boxUv: !!row.box_uv,
    cubes: row.cubes,
    meshes: row.meshes,
    bones: row.bones,
    animations: row.animations,
    textures: row.textures,
    embedded: row.embedded,
    textureWidth: row.texture_width,
    textureHeight: row.texture_height,
    density: row.density,
  };
}

/** How this request is to be shown models for adults. */
async function viewOf(c: Ctx): Promise<AdultView> {
  return viewFor(await accountOf(c), closedHere(c));
}

/**
 * Whether this person may see this model at all.
 *
 * The owner always may, and so may whoever runs the site, wherever they are: nobody
 * is hidden their own upload, and nobody can look into a report about a model they
 * are not shown.
 */
function maySee(row: Row, account: Account | null, view: AdultView): boolean {
  if (account && (account.id === row.owner || account.admin)) return true;
  if (row.adult && view === 'hide') return false;
  return row.visibility === 'public' && !row.hidden && row.state === 'ready';
}

/**
 * Whether a shared cache may keep it and any page fetch it: public, and not for adults.
 *
 * A model for adults is never left in a cache between here and the browser, which
 * would hand it to the next person without asking who they are.
 */
function openToAll(row: Row): boolean {
  return row.visibility === 'public' && !row.hidden && !row.adult;
}

/**
 * The refusal for a model somebody is not shown.
 *
 * A model for adults that they would be shown once they said so says so, and what to
 * do, so that a link from a friend does not look broken — without its name or
 * anything else about it. Where models for adults are closed it is simply not there.
 */
function notShown(c: Ctx, row: Row | null, account: Account | null): Response {
  if (row?.adult && maySee(row, account, 'open') && !closedHere(c)) {
    if (!account) return refuse(403, 'эта модель для взрослых: чтобы её видеть, войди и подтверди, что тебе есть 18');
    if (!account.adultOk) {
      return refuse(403, 'эта модель для взрослых: чтобы её видеть, подтверди в меню аккаунта, что тебе есть 18');
    }
    return refuse(403, 'эта модель для взрослых, а они у тебя скрыты: это меняется в меню аккаунта');
  }
  return refuse(404, 'такой модели нет');
}

async function rowOf(c: Ctx, id: string): Promise<Row | null> {
  return c.env.DB.prepare(`${SELECT} where m.id = ?`).bind(id).first<Row>();
}

/**
 * The model this request is allowed to see, or the refusal to hand straight back.
 *
 * Exported for the talk under a model, which has to be exactly as absent as the model
 * is: a comment thread that answers while the model says "there is no such model"
 * tells a stranger that a private model exists and who is talking about it. One
 * decision in one place, not two copies drifting apart.
 */
export async function seenRow(c: Ctx, id: string, account: Account | null): Promise<Row | Response> {
  const row = await rowOf(c, id);
  if (!row || !maySee(row, account, await viewOf(c))) return notShown(c, row, account);
  return row;
}

export type { Row as ModelRow };

/**
 * The public list as the edge keeps it.
 *
 * One minute, per data centre. Long enough that a page opened by a crowd is one
 * query, short enough that a model somebody just published turns up while they are
 * still looking — and it is dropped outright whenever something public changes, so
 * in the data centre the change came through it is not even a minute.
 *
 * Two of them, with models for adults and without. Which one a request gets is
 * settled before the cache is asked, so the one with them never reaches somebody who
 * has them hidden.
 */
function listKey(c: Ctx, adult: boolean): Request {
  return new Request(new URL(adult ? '/api/models?adult=1' : '/api/models', c.url).toString());
}

function forgetList(c: Ctx): void {
  c.later(Promise.all([caches.default.delete(listKey(c, false)), caches.default.delete(listKey(c, true))]));
}

/** The routes under `/api/models`, `/api/notices` and `/api/admin`, or null. */
export async function modelRoute(c: Ctx, path: string): Promise<Response | null> {
  const method = c.request.method;

  if (path === '/api/models') {
    if (method === 'GET') return c.url.searchParams.has('mine') ? listMine(c) : listPublic(c);
    if (method === 'POST') return begin(c);
    return null;
  }
  if (path === '/api/models/liked' && method === 'GET') return liked(c);
  if (path === '/api/notices' && method === 'GET') return notices(c);
  if (path === '/api/notices/seen' && method === 'POST') return noticesSeen(c);
  if (path === '/api/admin/queue' && method === 'GET') return queue(c);
  if (path === '/api/admin/policy' && method === 'POST') return policyNotice(c);

  const match = /^\/api\/models\/([0-9A-Za-z]{12})(?:\/([a-z]+))?$/.exec(path);
  if (!match) return null;
  const id = match[1]!;
  const action = match[2] ?? '';

  switch (`${method} ${action}`) {
    case 'GET ':
      return detail(c, id);
    case 'PATCH ':
      return change(c, id);
    case 'DELETE ':
      return remove(c, id);
    case 'PUT file':
      return putFile(c, id);
    case 'GET file':
      return getFile(c, id);
    case 'PUT preview':
      return putPreview(c, id);
    case 'GET preview':
      return getPreview(c, id);
    case 'POST publish':
      return publish(c, id);
    case 'POST hide':
      return hide(c, id);
    case 'POST like':
      return like(c, id, true);
    case 'DELETE like':
      return like(c, id, false);
    case 'POST report':
      return report(c, id);
    case 'POST doubt':
      return doubt(c, id);
    case 'POST takedown':
      return takedown(c, id, true);
    case 'POST restore':
      return takedown(c, id, false);
    case 'POST settle':
      return settle(c, id);
    case 'POST adult':
      return markAdult(c, id);
    default:
      return null;
  }
}

async function listPublic(c: Ctx): Promise<Response> {
  const adult = (await viewOf(c)) !== 'hide';
  const key = listKey(c, adult);
  const kept = await caches.default.match(key);
  const body = kept
    ? await kept.text()
    : await (async () => {
        const { results } = await c.env.DB.prepare(
          `${SELECT} where ${PUBLIC}${adult ? '' : ' and m.adult = 0'} order by m.published desc`,
        ).all<Row>();
        const text = JSON.stringify(results.map(summaryOf));
        c.later(
          caches.default.put(
            key,
            new Response(text, {
              headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
            }),
          ),
        );
        return text;
      })();
  // The browser asks every time; the edge is what answers quickly. Only the list
  // without models for adults is open to pages elsewhere: a page elsewhere fetches
  // without the cookie, and that is the list it would be given anyway.
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
      ...(adult ? {} : OPEN),
    },
  });
}

async function listMine(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const { results } = await c.env.DB.prepare(
    `${SELECT} where m.owner = ? and m.state = 'ready' order by m.created desc`,
  )
    .bind(account.id)
    .all<Row>();
  return json(results.map(summaryOf), 200, { 'cache-control': 'no-store' });
}

async function liked(c: Ctx): Promise<Response> {
  const account = await accountOf(c);
  if (!account) return json([], 200, { 'cache-control': 'no-store' });
  const { results } = await c.env.DB.prepare('select model_id from likes where user_id = ?')
    .bind(account.id)
    .all<{ model_id: string }>();
  return json(
    results.map((one) => one.model_id),
    200,
    { 'cache-control': 'no-store' },
  );
}

async function detail(c: Ctx, id: string): Promise<Response> {
  const [row, account, view] = await Promise.all([rowOf(c, id), accountOf(c), viewOf(c)]);
  if (!row || !maySee(row, account, view)) return notShown(c, row, account);
  const mine = account?.id === row.owner;
  let isLiked = false;
  let reports: number | undefined;
  if (account) {
    const [hearts, counted] = await c.env.DB.batch([
      c.env.DB.prepare('select 1 as yes from likes where model_id = ? and user_id = ?').bind(id, account.id),
      c.env.DB.prepare('select count(*) as n from reports where model_id = ?').bind(id),
    ]);
    isLiked = (hearts?.results.length ?? 0) > 0;
    if (account.admin) reports = (counted?.results[0] as { n: number } | undefined)?.n ?? 0;
  }
  const said: ModelDetail = {
    ...summaryOf(row),
    description: row.description,
    sha256: row.sha256,
    print: row.print,
    shape: row.shape,
    mine,
    liked: isLiked,
    admin: !!account?.admin,
    adultFixed: !!row.adult_fixed,
  };
  if (account?.admin) {
    said.doubted = !!row.doubted;
    said.reports = reports;
  }
  return json(said, 200, { 'cache-control': 'no-cache', ...(openToAll(row) ? OPEN : {}) });
}

/**
 * Until when this person may not put anything new up, set by hand.
 *
 * Only the hand-set bar stops uploading. The automatic one after a second copied
 * model stops publishing and nothing else: anybody may keep anything privately, and
 * a private model is a copy on a shelf, not a claim about whose it is.
 */
function barredByHand(account: Account): string | null {
  return account.barredUntil && account.barredUntil > now() ? account.barredUntil : null;
}

async function barredFromPublishing(c: Ctx, account: Account): Promise<string | null> {
  let until = barredByHand(account);
  // Two refusals against the same model is the line. The first is carelessness and
  // is answered by a refusal; the second is a decision and is answered by a wait.
  const last = await c.env.DB.prepare(
    `select max(made) as made from attempts
      where who = ? and against is not null
      group by against having count(*) > 1
      order by max(made) desc limit 1`,
  )
    .bind(account.id)
    .first<{ made: string }>();
  if (last) {
    const ends = new Date(Date.parse(last.made) + PENALTY_DAYS * 86_400_000).toISOString();
    if (ends > now() && (!until || ends > until)) until = ends;
  }
  return until;
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

/**
 * Rows whose file never arrived.
 *
 * Swept when the same person starts the next upload, rather than on a timer: a
 * free Worker can have a timer, but a row that nobody can see costs nothing until
 * the person comes back, and that is exactly when it is in their way — it counts
 * against their quota.
 */
async function sweep(c: Ctx, owner: string): Promise<void> {
  const before = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { results } = await c.env.DB.prepare(
    "select id from models where owner = ? and state = 'incoming' and created < ?",
  )
    .bind(owner, before)
    .all<{ id: string }>();
  if (results.length === 0) return;
  const ids = results.map((one) => one.id);
  await c.env.DB.batch(ids.map((id) => c.env.DB.prepare('delete from models where id = ?').bind(id)));
  await c.env.FILES.delete(ids.flatMap((id) => [fileKey(id), previewKey(id)]));
}

/** The first step: the page's account of the file, and a row for it to arrive at. */
async function begin(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const barred = barredByHand(account);
  if (barred) return refuse(403, `загрузка закрыта до ${dayOf(barred)}. ${APPEAL}`, { barredUntil: barred });

  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const declared = readDeclared(body);
  if ('error' in declared) return refuse(400, declared.error);
  // Both may be said at upload, so the draft already carries them; neither is needed.
  // The licence is asked again when publishing, with this one already chosen.
  const license = body.license === undefined || body.license === null || body.license === '' ? null : body.license;
  if (license !== null && !isLicense(license)) return refuse(400, 'такой лицензии нет');
  const background = cleanBackground(body.background);
  if (background === undefined) return refuse(400, 'цвет фона — шесть цифр после решётки, как #f2f2f2');
  const look = cleanLook(body.look);
  if (look === undefined) return refuse(400, 'ракурс — два угла в радианах, наклон не больше 1.4');

  await sweep(c, account.id);

  const existing = await c.env.DB.prepare('select id, state from models where owner = ? and sha256 = ?')
    .bind(account.id, declared.sha256)
    .first<{ id: string; state: string }>();
  // The same file again is the model that is already here. Still incoming means the
  // last try stopped halfway, and the page can send the file to the same address.
  if (existing) return json({ id: existing.id, already: existing.state === 'ready' });

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [used, today] = await c.env.DB.batch([
    c.env.DB.prepare('select coalesce(sum(bytes), 0) as n from models where owner = ?').bind(account.id),
    c.env.DB.prepare('select count(*) as n from models where owner = ? and created > ?').bind(account.id, dayAgo),
  ]);
  const usedBytes = (used?.results[0] as { n: number } | undefined)?.n ?? 0;
  const todayCount = (today?.results[0] as { n: number } | undefined)?.n ?? 0;
  if (usedBytes + declared.bytes > QUOTA_BYTES) {
    return refuse(
      413,
      `место закончилось: занято ${megabytes(usedBytes)} из ${megabytes(QUOTA_BYTES)}, удали что-нибудь из своих моделей`,
    );
  }
  if (todayCount >= DAILY_UPLOADS) return refuse(429, 'на сегодня загрузок достаточно, продолжи завтра');

  const id = freshId();
  const at = now();
  const f = declared.facts;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `insert into models (id, owner, name, description, format, version, box_uv, cubes, meshes,
                           bones, animations, textures, embedded, texture_width, texture_height,
                           density, sha256, print, shape, bytes, license, background, look_spin,
                           look_tilt, created, updated)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      account.id,
      declared.name,
      declared.description,
      f.format,
      f.version,
      f.boxUv ? 1 : 0,
      f.cubes,
      f.meshes,
      f.bones,
      f.animations,
      f.textures,
      f.embedded,
      f.textureWidth,
      f.textureHeight,
      f.density,
      declared.sha256,
      declared.print,
      declared.shape,
      declared.bytes,
      license,
      background,
      look === null ? null : look.spin,
      look === null ? null : look.tilt,
      at,
      at,
    ),
    ...declared.tags.map((tag) =>
      c.env.DB.prepare('insert into model_tags (model_id, tag) values (?, ?)').bind(id, tag),
    ),
  ]);
  return json({ id, already: false }, 201);
}

/** The model's own row, if this person owns it, or the refusal to send back. */
async function owned(c: Ctx, id: string): Promise<{ row: Row; account: Account } | Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await rowOf(c, id);
  if (!row || row.owner !== account.id) return refuse(404, 'такой модели нет');
  return { row, account };
}

/**
 * The second step: the file itself, straight through to the bucket.
 *
 * Streamed and never read here. R2 is given the declared hash and checks it as the
 * bytes land; a file that is not the one described is refused by R2, not by us.
 */
async function putFile(c: Ctx, id: string): Promise<Response> {
  const found = await owned(c, id);
  if (found instanceof Response) return found;
  const { row } = found;
  if (row.state === 'ready') return refuse(409, 'файл уже загружен');

  const length = Number(c.request.headers.get('content-length'));
  // A stream of unknown length cannot go to R2 at all, and a length other than the
  // declared one is a file other than the declared one.
  if (!Number.isInteger(length) || length <= 0) return refuse(411, 'нужен размер файла');
  if (length !== row.bytes) return refuse(400, 'размер файла не совпал с заявленным');
  if (!c.request.body) return refuse(400, 'файл не пришёл');

  try {
    await c.env.FILES.put(fileKey(id), c.request.body, {
      sha256: row.sha256,
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (why) {
    console.warn(`модель ${id}: файл не принят`, why);
    return refuse(400, 'файл не совпал со своим отпечатком');
  }
  await c.env.DB.prepare("update models set state = 'ready', updated = ? where id = ?").bind(now(), id).run();
  return json({ ok: true });
}

function kindOfPicture(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((byte, i) => bytes[i] === byte)) return 'image/png';
  return null;
}

/**
 * The card's picture, drawn by the uploader's page.
 *
 * Small enough to read whole, and read whole for one reason: to look at its first
 * twelve bytes. Whatever is served from here is served from this site's address, and
 * an "image" that is really a page of HTML is a page of HTML on this site.
 */
async function putPreview(c: Ctx, id: string): Promise<Response> {
  const found = await owned(c, id);
  if (found instanceof Response) return found;
  const length = Number(c.request.headers.get('content-length') ?? '0');
  if (length > PREVIEW_MAX_BYTES) return refuse(413, 'картинка слишком большая');
  const bytes = new Uint8Array(await c.request.arrayBuffer());
  if (bytes.length === 0) return refuse(400, 'картинка не пришла');
  if (bytes.length > PREVIEW_MAX_BYTES) return refuse(413, 'картинка слишком большая');
  const type = kindOfPicture(bytes);
  if (!type) return refuse(400, 'картинка должна быть WebP или PNG');
  await c.env.FILES.put(previewKey(id), bytes, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare('update models set has_preview = 1, updated = ? where id = ?').bind(now(), id).run();
  if (found.row.visibility === 'public') forgetList(c);
  return json({ ok: true });
}

/**
 * A name a file can be saved under on any of the three systems people use.
 *
 * Two of them: the real one for every browser that reads `filename*`, and a plain
 * ASCII one for the rest. A Russian name has nothing left in ASCII, so the plain one
 * falls back to the id rather than to a row of underscores.
 */
function fileNameOf(name: string, id: string): { plain: string; full: string } {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'model';
  const ascii = safe.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, '_');
  return {
    plain: `${/[A-Za-z0-9]/.test(ascii) ? ascii : `model-${id}`}.bbmodel`,
    full: encodeURIComponent(`${safe}.bbmodel`),
  };
}

/**
 * The file, as a download.
 *
 * Open to any page anywhere, so that the plugin and other tools can fetch it. Sent as
 * an attachment with `nosniff`: it is a JSON file on this site's address, and no
 * browser may be allowed to decide it is something to run.
 */
async function getFile(c: Ctx, id: string): Promise<Response> {
  const [row, account, view] = await Promise.all([rowOf(c, id), accountOf(c), viewOf(c)]);
  if (!row || row.state !== 'ready' || !maySee(row, account, view)) return refuse(404, 'такой модели нет');
  const object = await c.env.FILES.get(fileKey(id));
  if (!object) return refuse(404, 'файла нет');

  // Opening a model to look at it is not downloading it, and neither is the owner
  // fetching their own.
  if (c.url.searchParams.get('for') !== 'view' && account?.id !== row.owner) {
    c.later(c.env.DB.prepare('update models set downloads = downloads + 1 where id = ?').bind(id).run());
  }

  const name = fileNameOf(row.name, id);
  const open = openToAll(row);
  return new Response(object.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(object.size),
      'content-disposition': `attachment; filename="${name.plain}"; filename*=UTF-8''${name.full}`,
      'x-content-type-options': 'nosniff',
      etag: object.httpEtag,
      // Ten minutes: a file never changes, but it can be taken down.
      'cache-control': open ? 'public, max-age=600' : 'private, no-cache',
      ...(open ? OPEN : {}),
    },
  });
}

async function getPreview(c: Ctx, id: string): Promise<Response> {
  const [row, account, view] = await Promise.all([rowOf(c, id), accountOf(c), viewOf(c)]);
  if (!row || !row.has_preview || !maySee(row, account, view)) return refuse(404, 'картинки нет');
  const object = await c.env.FILES.get(previewKey(id));
  if (!object) return refuse(404, 'картинки нет');
  const open = openToAll(row);
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/webp',
      'x-content-type-options': 'nosniff',
      etag: object.httpEtag,
      // The address carries the time of the last change, so it can be kept a long time.
      'cache-control': open ? 'public, max-age=86400' : 'private, no-cache',
      ...(open ? OPEN : {}),
    },
  });
}

async function change(c: Ctx, id: string): Promise<Response> {
  const found = await owned(c, id);
  if (found instanceof Response) return found;
  const body = await bodyOf(c);
  if (body instanceof Response) return body;

  const statements: D1PreparedStatement[] = [];
  const at = now();
  if ('name' in body) {
    const name = cleanName(body.name);
    if (!name) return refuse(400, 'у модели должно быть название');
    statements.push(c.env.DB.prepare('update models set name = ? where id = ?').bind(name, id));
  }
  if ('description' in body) {
    statements.push(
      c.env.DB.prepare('update models set description = ? where id = ?').bind(cleanDescription(body.description), id),
    );
  }
  if ('tags' in body) {
    statements.push(c.env.DB.prepare('delete from model_tags where model_id = ?').bind(id));
    for (const tag of cleanTags(body.tags)) {
      statements.push(c.env.DB.prepare('insert into model_tags (model_id, tag) values (?, ?)').bind(id, tag));
    }
  }
  if ('background' in body) {
    const background = cleanBackground(body.background);
    if (background === undefined) return refuse(400, 'цвет фона — шесть цифр после решётки, как #f2f2f2');
    statements.push(c.env.DB.prepare('update models set background = ? where id = ?').bind(background, id));
  }
  if ('look' in body) {
    const look = cleanLook(body.look);
    if (look === undefined) return refuse(400, 'ракурс — два угла в радианах, наклон не больше 1.4');
    statements.push(
      c.env.DB.prepare('update models set look_spin = ?, look_tilt = ? where id = ?').bind(
        look === null ? null : look.spin,
        look === null ? null : look.tilt,
        id,
      ),
    );
  }
  if ('adult' in body) {
    const adult = adultSaid(c, found.account, found.row, body);
    if (adult instanceof Response) return adult;
    statements.push(c.env.DB.prepare('update models set adult = ? where id = ?').bind(adult.adult ? 1 : 0, id));
    if (adult.confirm) statements.push(confirmAge(c, found.account));
  }
  if (statements.length === 0) return json({ ok: true });
  statements.push(c.env.DB.prepare('update models set updated = ? where id = ?').bind(at, id));
  await c.env.DB.batch(statements);
  if (found.row.visibility === 'public') forgetList(c);
  return json({ ok: true });
}

/**
 * Throwing a model away, file and all.
 *
 * The row goes first. A file left behind by a failure after that is storage nobody
 * can reach; a row left behind pointing at a file that is gone is a broken card in
 * front of everybody.
 */
async function remove(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await rowOf(c, id);
  if (!row || (row.owner !== account.id && !account.admin)) return refuse(404, 'такой модели нет');
  await c.env.DB.prepare('delete from models where id = ?').bind(id).run();
  await c.env.FILES.delete([fileKey(id), previewKey(id)]);
  if (row.visibility === 'public') forgetList(c);
  return json({ ok: true });
}

/**
 * Refusing, telling the person whose model it is, and remembering that it happened.
 *
 * The notice goes out whether or not anything is done to the person who tried. Being
 * told is the thing an author actually wants, and it is the only part of this that
 * is useful when the attempt was innocent.
 */
async function refuseCopy(c: Ctx, account: Account, row: Row, against: { id: string; owner: string; name: string }) {
  const before = await c.env.DB.prepare('select count(*) as n from attempts where who = ? and against = ?')
    .bind(account.id, against.id)
    .first<{ n: number }>();
  const again = (before?.n ?? 0) > 0;
  const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare('insert into attempts (id, who, model_id, against, made) values (?, ?, ?, ?, ?)').bind(
      freshId(),
      account.id,
      row.id,
      against.id,
      at,
    ),
    c.env.DB.prepare('insert into notices (id, who, kind, about, said, made) values (?, ?, ?, ?, ?, ?)').bind(
      freshId(),
      against.owner,
      'copy',
      against.id,
      `${account.handle}: попытка опубликовать «${against.name}» как свою модель. ` +
        (again ? 'Уже не первая, публикация закрыта на неделю.' : 'Публикация отклонена.'),
      at,
    ),
  ]);
  return refuse(
    409,
    again
      ? `Эта модель уже есть в каталоге, и ты пробуешь опубликовать её не в первый раз. Публиковать снова можно будет через ${PENALTY_DAYS} дней.`
      : 'Эта модель уже есть в каталоге. Опубликовать её второй раз нельзя, можно открыть ту, что есть.',
    { against: against.id, again },
  );
}

/**
 * What the owner says about who their model is for, checked.
 *
 * Asked every time a model is published, with nothing chosen beforehand, so that the
 * 18+ mark is something its owner decided rather than something they left alone.
 * Saying yes needs them to have said they are eighteen, now or once before, and
 * cannot be said at all from a country where models for adults are closed. Saying no
 * is refused on a model the site itself marked.
 *
 * A key marks a model 18+ only for somebody who has already said their age on the
 * site: saying it is a person's own statement, and a line in a plugin's request is not
 * a person. Checked here rather than in keyRules.ts because what a key may not do is
 * one field of two routes, not the routes themselves.
 */
function adultSaid(
  c: Ctx,
  account: Account,
  row: Row,
  body: Record<string, unknown>,
): { adult: boolean; confirm: boolean } | Response {
  if (typeof body.adult !== 'boolean') return refuse(400, 'выбери, для всех эта модель или только для взрослых');
  if (!body.adult) {
    if (row.adult_fixed) return refuse(403, 'пометку 18+ поставил тот, кто ведёт сайт, и снять её нельзя');
    return { adult: false, confirm: false };
  }
  if (account.adultOk) return { adult: true, confirm: false };
  if (account.byKey) return refuse(403, 'подтвердить, что тебе есть 18, можно только на сайте');
  if (closedHere(c)) return refuse(403, 'в твоей стране модели 18+ на сайте закрыты');
  if (body.over18 !== true) return refuse(400, 'чтобы пометить модель 18+, подтверди, что тебе есть 18');
  return { adult: true, confirm: true };
}

/** Remembering that they said they are eighteen, the first time they said it. */
function confirmAge(c: Ctx, account: Account): D1PreparedStatement {
  return c.env.DB.prepare('update users set adult_ok = coalesce(adult_ok, ?) where id = ?').bind(now(), account.id);
}

/**
 * Putting a model in front of everybody.
 *
 * The model is compared before anything the person said is read, because the
 * comparison is the only part that cannot be talked around. The same model with its
 * paint, published by somebody else, is refused. The same geometry painted
 * differently is let through and named, so the page can show the two side by side —
 * a retexture is often allowed and often the point, and only a person can tell.
 */
async function publish(c: Ctx, id: string): Promise<Response> {
  const found = await owned(c, id);
  if (found instanceof Response) return found;
  const { row, account } = found;
  if (row.state !== 'ready') return refuse(409, 'файл ещё не загружен');
  if (row.hidden) return refuse(403, 'модель снята с каталога, опубликовать её нельзя');
  const barred = await barredFromPublishing(c, account);
  if (barred) return refuse(403, `публиковать можно будет с ${dayOf(barred)}. ${APPEAL}`, { barredUntil: barred });

  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  if (!isLicense(body.license)) return refuse(400, 'выбери лицензию');
  const adult = adultSaid(c, account, row, body);
  if (adult instanceof Response) return adult;
  const authorName = cleanName(body.author) || null;
  const authorUrl = authorName ? cleanUrl(body.url) : null;

  const same = await c.env.DB.prepare(
    `select m.id, m.owner, m.name from models m
      where m.print = ? and m.owner <> ? and ${PUBLIC}
      order by m.published limit 1`,
  )
    .bind(row.print, account.id)
    .first<{ id: string; owner: string; name: string }>();
  if (same) return refuseCopy(c, account, row, same);

  const near = await c.env.DB.prepare(
    `select m.id from models m
      where m.shape = ? and m.owner <> ? and ${PUBLIC}
      order by m.published limit 1`,
  )
    .bind(row.shape, account.id)
    .first<{ id: string }>();

  const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `update models
          set visibility = 'public', license = ?, author_name = ?, author_url = ?, adult = ?,
              published = coalesce(published, ?), updated = ?
        where id = ?`,
    ).bind(body.license, authorName, authorUrl, adult.adult ? 1 : 0, at, at, id),
    ...(adult.confirm ? [confirmAge(c, account)] : []),
  ]);
  forgetList(c);
  return json({ ok: true, near: near?.id ?? null });
}

async function hide(c: Ctx, id: string): Promise<Response> {
  const found = await owned(c, id);
  if (found instanceof Response) return found;
  await c.env.DB.prepare("update models set visibility = 'private', updated = ? where id = ?").bind(now(), id).run();
  forgetList(c);
  return json({ ok: true });
}

async function like(c: Ctx, id: string, on: boolean): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await seenRow(c, id, account);
  if (row instanceof Response) return row;
  const [, , counted] = await c.env.DB.batch([
    on
      ? c.env.DB.prepare('insert or ignore into likes (model_id, user_id, made) values (?, ?, ?)').bind(
          id,
          account.id,
          now(),
        )
      : c.env.DB.prepare('delete from likes where model_id = ? and user_id = ?').bind(id, account.id),
    // Counted again rather than added to, so a double click cannot make two.
    c.env.DB.prepare('update models set likes = (select count(*) from likes where model_id = ?) where id = ?').bind(
      id,
      id,
    ),
    c.env.DB.prepare('select likes from models where id = ?').bind(id),
  ]);
  const likes = (counted?.results[0] as { likes: number } | undefined)?.likes ?? 0;
  return json({ likes, liked: on });
}

async function report(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await rowOf(c, id);
  if (!row || !maySee(row, account, await viewOf(c))) return notShown(c, row, account);
  if (row.owner === account.id) return refuse(400, 'это твоя модель');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  if (!isReportKind(body.kind)) return refuse(400, 'выбери, что не так');
  const said = cleanDescription(body.said).slice(0, REPORT_SAID_MAX);
  // One report per person per model, the latest standing: saying it twice is not
  // two people saying it.
  await c.env.DB.prepare(
    `insert into reports (id, model_id, user_id, kind, said, made) values (?, ?, ?, ?, ?, ?)
     on conflict (model_id, user_id) do update set kind = excluded.kind, said = excluded.said, made = excluded.made`,
  )
    .bind(freshId(), id, account.id, body.kind, said, now())
    .run();
  return json({ ok: true });
}

/**
 * A page that opened the model counted something else, or could not read it at all.
 *
 * The page sends this on its own the moment it notices. The Worker compares the two
 * accounts itself and marks the model only when they really differ; the mark is for
 * whoever runs the site and is never shown to the public.
 *
 * Only from somebody signed in, and only about a model they are shown. When anybody
 * could send it, one request a model put the whole catalogue in front of whoever runs
 * the site, and a private model could be marked by whoever had its address. A person
 * with an account can be barred for doing that; a loop of anonymous requests cannot.
 *
 * `unreadable` is the file failing the reading the upload page gives every file. The
 * Worker never opens a file, so without it a file that is no model at all would sit
 * in the catalogue as one, and no page would ever say so.
 */
async function doubt(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const row = await seenRow(c, id, account);
  if (row instanceof Response) return row;
  if (row.state !== 'ready') return refuse(404, 'такой модели нет');
  if (row.owner === account.id) return refuse(400, 'это твоя модель');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  let same = false;
  if (body.unreadable !== true) {
    const counted = readFacts(body.facts);
    if ('error' in counted) return refuse(400, counted.error);
    same = sameFacts(factsOfRow(row), counted);
  }
  if (!same && !row.doubted) {
    await c.env.DB.prepare('update models set doubted = 1 where id = ?').bind(id).run();
  }
  return json({ same });
}

async function takedown(c: Ctx, id: string, down: boolean): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (!account.admin) return refuse(403, 'это может только тот, кто ведёт сайт');
  const row = await rowOf(c, id);
  if (!row) return refuse(404, 'такой модели нет');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const why = cleanDescription(body.said).slice(0, REPORT_SAID_MAX);
  // Taking a model down names the clause it broke: article 17(3)(e) asks for the
  // contractual ground, and a clause number is that ground. Putting it back names none.
  const rule = down ? body.rule : null;
  if (down && !isBreakable(rule)) return refuse(400, 'выбери пункт правил, который нарушен');
  const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare('update models set hidden = ?, doubted = 0, updated = ? where id = ?').bind(down ? 1 : 0, at, id),
    // A decision answers every report made so far; what comes after is a new question.
    c.env.DB.prepare('delete from reports where model_id = ?').bind(id),
    c.env.DB.prepare('insert into notices (id, who, kind, about, said, made, rule) values (?, ?, ?, ?, ?, ?, ?)').bind(
      freshId(),
      row.owner,
      down ? 'takedown' : 'restore',
      id,
      down
        ? `Модель «${row.name}» снята с каталога. ${citing(rule as string)}${why ? ` ${why}` : ''} ${APPEAL}`
        : `Модель «${row.name}» снова в каталоге.`,
      at,
      rule,
    ),
  ]);
  forgetList(c);
  return json({ ok: true });
}

/**
 * Whoever runs the site marking a model 18+, or taking the mark off.
 *
 * Set this way the mark is fixed: the owner is told, and cannot take it off, nor get
 * round it by withdrawing the model and publishing it again. Taking it off unfixes it.
 * Either way the reports that the mark was missing are answered, and only those: the
 * rest were about something else and are still waiting.
 */
async function markAdult(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (!account.admin) return refuse(403, 'это может только тот, кто ведёт сайт');
  const row = await rowOf(c, id);
  if (!row) return refuse(404, 'такой модели нет');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  if (typeof body.adult !== 'boolean') return refuse(400, 'скажи, ставить пометку или снимать');
  const why = cleanDescription(body.said).slice(0, REPORT_SAID_MAX);
  const at = now();
  await c.env.DB.batch([
    c.env.DB.prepare('update models set adult = ?, adult_fixed = ?, updated = ? where id = ?').bind(
      body.adult ? 1 : 0,
      body.adult ? 1 : 0,
      at,
      id,
    ),
    c.env.DB.prepare("delete from reports where model_id = ? and kind = 'unmarked'").bind(id),
    // The mark is only ever set for one reason, so its clause is not asked for.
    c.env.DB.prepare('insert into notices (id, who, kind, about, said, made, rule) values (?, ?, ?, ?, ?, ?, ?)').bind(
      freshId(),
      row.owner,
      body.adult ? 'adult' : 'unadult',
      id,
      body.adult
        ? `Модель «${row.name}» помечена 18+ тем, кто ведёт сайт. Снять эту пометку нельзя. ${citing('unmarked')}${why ? ` ${why}` : ''} ${APPEAL}`
        : `С модели «${row.name}» снята пометка 18+.`,
      at,
      body.adult ? 'unmarked' : null,
    ),
  ]);
  forgetList(c);
  return json({ ok: true });
}

/**
 * Telling everybody that the rules changed.
 *
 * Article 14(2) of Regulation (EU) 2022/2065 wants significant changes to the terms
 * told to the people using the service. Told here and not mailed, because no address
 * of anybody is stored or even asked for: a notice on the site is the only channel
 * that exists. One statement whatever the number of accounts, with the ids made inside
 * the database, so a change of rules is not a thousand round trips.
 */
async function policyNotice(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (!account.admin) return refuse(403, 'это может только тот, кто ведёт сайт');
  const body = await bodyOf(c);
  if (body instanceof Response) return body;
  const said = cleanDescription(body.said).slice(0, REPORT_SAID_MAX);
  if (said.length < 10) return refuse(400, 'напиши, что именно изменилось');
  const done = await c.env.DB.prepare(
    `insert into notices (id, who, kind, about, said, made)
       select lower(hex(randomblob(6))), id, 'policy', null, ?, ? from users`,
  )
    .bind(said, now())
    .run();
  return json({ sent: done.meta.changes ?? 0 });
}

async function notices(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  const { results } = await c.env.DB.prepare(
    'select id, kind, about, said, made, seen, rule from notices where who = ? order by made desc limit 50',
  )
    .bind(account.id)
    .all<Omit<Notice, 'seen'> & { seen: number }>();
  return json(
    results.map((one) => ({ ...one, seen: !!one.seen })),
    200,
    { 'cache-control': 'no-store' },
  );
}

async function noticesSeen(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  await c.env.DB.prepare('update notices set seen = 1 where who = ?').bind(account.id).run();
  return json({ ok: true });
}

/** What needs a person's eye: models a page doubted, and models somebody reported. */
/**
 * Looked at, and nothing to do: the reports are answered and the model stays as it is.
 *
 * Without this the queue only ever grows, since the one way out of it would be
 * taking down a model that did not deserve it. Nobody is told; nothing changed.
 */
async function settle(c: Ctx, id: string): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (!account.admin) return refuse(403, 'это может только тот, кто ведёт сайт');
  const row = await rowOf(c, id);
  if (!row) return refuse(404, 'такой модели нет');
  await c.env.DB.batch([
    c.env.DB.prepare('update models set doubted = 0 where id = ?').bind(id),
    c.env.DB.prepare('delete from reports where model_id = ?').bind(id),
  ]);
  return json({ ok: true });
}

async function queue(c: Ctx): Promise<Response> {
  const account = await mustBe(c);
  if (account instanceof Response) return account;
  if (!account.admin) return refuse(403, 'это может только тот, кто ведёт сайт');
  const [models, reports] = await c.env.DB.batch([
    c.env.DB.prepare(
      `${SELECT} where m.doubted = 1 or exists (select 1 from reports r where r.model_id = m.id)
       order by m.updated desc limit 200`,
    ),
    c.env.DB.prepare(
      `select r.model_id, r.kind, r.said, r.made, u.handle
         from reports r left join users u on u.id = r.user_id
        order by r.made desc limit 1000`,
    ),
  ]);
  const said = new Map<string, { kind: string; said: string; made: string; by: string | null }[]>();
  for (const one of (reports?.results ?? []) as {
    model_id: string;
    kind: string;
    said: string;
    made: string;
    handle: string | null;
  }[]) {
    const list = said.get(one.model_id) ?? [];
    list.push({ kind: one.kind, said: one.said, made: one.made, by: one.handle });
    said.set(one.model_id, list);
  }
  return json(
    ((models?.results ?? []) as Row[]).map((row) => ({
      ...summaryOf(row),
      doubted: !!row.doubted,
      reports: said.get(row.id) ?? [],
    })),
    200,
    { 'cache-control': 'no-store' },
  );
}
