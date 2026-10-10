/**
 * Putting a model up with a key, the four steps in order, asked of a Worker that is
 * running.
 *
 * This is the half of the plugin's publishing that belongs to the server. The rules on
 * their own are in test/modelRules.test.ts and test/models.test.ts; what only a running
 * site can be wrong about is here: that R2 checks the hash as the bytes land, that a
 * picture which is not a picture is refused, that the same model published by somebody
 * else is refused to the key and not to a page, and that a repaint is let through and
 * named.
 *
 * Against the same database as keys.mjs and link.mjs, put in by seed.sql, then:
 *
 *   wrangler d1 migrations apply models-site --local --persist-to .wrangler/live-state
 *   node test/live/publish.mjs
 *
 * Or elsewhere:
 *   LIVE_API=http://127.0.0.1:8790 LIVE_HOME=http://localhost:5173 LIVE_OWNER=<id>
 *   LIVE_OTHER=<id> node test/live/publish.mjs
 *
 * It needs a Node that reads TypeScript by itself (22.18 and up; 25 here), because the
 * numbers and the counting come from `shared/`, imported as they are. Nothing is copied
 * into this file: a check against a copy of `prepare()` would prove the copy.
 *
 * It makes eighteen changing requests with the key, inside the thirty a minute a key is
 * allowed, so two runs in the same minute will end in 429: wait a minute between runs.
 *
 * Every model it uploads it deletes again, with the cookie of whoever owns it — a key
 * cannot delete, which is the point of the key. What is left behind on purpose: the row
 * in `attempts` and the notice that a refused copy writes, because the site itself never
 * removes those. They are harmless as long as each run has its own fingerprints, which
 * is what the mark is for; if a run is ever told «уже не первая», a model from an
 * earlier run was left in the catalogue, and the week-long bar it describes is real.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PREVIEW_MAX_BYTES } from '../../shared/modelRules.ts';
import { prepare, sha256Hex } from '../../shared/bbmodel.ts';
import { pointerProject } from './model.mjs';

const API = process.env.LIVE_API ?? 'http://127.0.0.1:8787';
const HOME = process.env.LIVE_HOME ?? 'http://localhost:5173';

const WHO = {
  owner: process.env.LIVE_OWNER ?? 'liveowner001',
  other: process.env.LIVE_OTHER ?? 'liveother001',
};

/**
 * What makes this run's models nobody else's.
 *
 * A cube off to one side, in one of thirty-two thousand places, so that the shape and
 * both fingerprints are this run's own. Drawn at random rather than from the clock: two
 * runs a minute apart would otherwise be a minute apart in the number as well, and the
 * copy check needs a fingerprint the catalogue has never seen.
 */
const MARK = Number(process.env.LIVE_MARK) || 1 + Math.floor(Math.random() * 32_767);

function secret() {
  const env = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (at < 0 || line.trimStart().startsWith('#')) continue;
    if (line.slice(0, at).trim() !== 'SESSION_SECRET') continue;
    return line
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  throw new Error('в ../.env нет SESSION_SECRET: без него сессию не подписать');
}

const SECRET = secret();

function cookieFor(user) {
  const text = `${user}~${Date.now() + 86_400_000}`;
  const mac = createHmac('sha256', SECRET)
    .update(text)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `session=${encodeURIComponent(`${text}.${mac}`)}`;
}

const COOKIES = Object.fromEntries(Object.entries(WHO).map(([role, id]) => [role, cookieFor(id)]));

/**
 * One request: a cookie or a key, and what the request says it came from.
 *
 * `body` is sent as JSON unless it is already bytes, which is how the file and the
 * picture go. A request with a key says `Origin: null`, which is what desktop
 * Blockbench sends and what the plugin will send.
 */
async function call(path, { as = null, key = null, method = 'GET', body, type, origin } = {}) {
  const headers = {};
  if (as) headers.cookie = COOKIES[as];
  if (key) headers.authorization = `Bearer ${key}`;
  const raw = body instanceof Uint8Array;
  if (body !== undefined) headers['content-type'] = type ?? (raw ? 'application/octet-stream' : 'application/json');
  const from = origin === undefined ? (key ? 'null' : method === 'GET' ? null : HOME) : origin;
  if (from !== null && from !== false) headers.origin = from;
  const answer = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const kind = answer.headers.get('content-type') ?? '';
  const out = {
    status: answer.status,
    said: null,
    bytes: null,
    kind,
    open: answer.headers.get('access-control-allow-origin'),
    length: Number(answer.headers.get('content-length')) || null,
  };
  if (kind.startsWith('image/') || kind.includes('octet-stream')) {
    out.bytes = new Uint8Array(await answer.arrayBuffer());
    return out;
  }
  const text = await answer.text();
  try {
    out.said = text ? JSON.parse(text) : null;
  } catch {
    out.said = { error: text.slice(0, 200) };
  }
  if (out.bytes === null && kind.includes('json')) out.bytes = new TextEncoder().encode(text);
  return out;
}

let bad = 0;
let done = 0;

function ok(what, how, extra) {
  if (how) {
    done += 1;
    console.log(`  ок    ${what}`);
  } else {
    bad += 1;
    console.log(`  НЕТ   ${what}`);
    if (extra !== undefined) console.log(`        ${JSON.stringify(extra)}`);
  }
}

function part(what) {
  console.log(`\n${what}`);
}

/** The models this run made, each with whoever can delete it. */
const made = [];
/** The keys this run made. */
const keys = [];

const bytesOf = (project) => new TextEncoder().encode(JSON.stringify(project));

/** The picture a card gets: the model's own texture, which is already a small PNG. */
function pngOf(project) {
  const source = project.textures[0].source;
  return new Uint8Array(Buffer.from(source.slice(source.indexOf(',') + 1), 'base64'));
}

/** What the plugin will send about a file, said once and the same way every time. */
function declaredOf(ready, name, extra = {}) {
  return {
    name,
    description: 'Модель для живой проверки публикации ключом.',
    tags: ['проверка', 'указатель'],
    sha256: ready.sha256,
    bytes: ready.bytes.length,
    print: ready.print,
    shape: ready.shape,
    facts: ready.facts,
    background: '#1b2733',
    look: { spin: 0.6, tilt: 0.4 },
    ...extra,
  };
}

/** The whole upload in one go, for the models a check only needs to exist. */
async function upload(ready, name, how) {
  const begun = await call('/api/models', { ...how, method: 'POST', body: declaredOf(ready, name) });
  const id = begun.said?.id;
  if (!id) return { id: null, begun };
  made.push({ id, as: how.as ?? 'owner' });
  const sent = await call(`/api/models/${id}/file`, { ...how, method: 'PUT', body: ready.bytes });
  return { id, begun, sent };
}

async function run() {
  part('Сессии, которыми подписан прогон');
  for (const role of Object.keys(WHO)) {
    const me = await call('/api/auth/me', { as: role });
    ok(`${role}: вошёл как ${me.said?.handle ?? '—'}`, me.said?.signedIn === true && me.said?.id === WHO[role], me.said);
  }
  if (bad > 0) {
    console.log('\nБез сессий дальше смысла нет: проверь, что seed.sql поставлен в ту же базу, что у wrangler dev.');
    return;
  }

  part('Ключ, каким ходит плагин');
  const born = await call('/api/keys', { as: 'owner', method: 'POST', body: { name: `Публикация ${MARK}` } });
  ok('ключ создан на сайте', born.status === 201 && typeof born.said?.key === 'string', born.status);
  const key = born.said?.key;
  if (!key) {
    console.log('\nБез ключа дальше смысла нет.');
    return;
  }
  keys.push(born.said.id);
  const byKey = { key };
  const me = await call('/api/auth/me', byKey);
  ok('ключ знает хозяина', me.said?.id === WHO.owner, me.said);

  part('Что плагин посчитал в файле');
  const own = await prepare(bytesOf(pointerProject({ mark: MARK })));
  const twin = await prepare(bytesOf(pointerProject({ mark: MARK, repaint: true })));
  ok(`метка прогона ${MARK}: 4 куба, 1 кость, 1 анимация`, own.facts.cubes === 4 && own.facts.bones === 1 && own.facts.animations === 1, own.facts);
  ok('текстура внутри файла, путей на диске нет', own.facts.embedded === 1 && own.stripped === 0, { embedded: own.facts.embedded, stripped: own.stripped });
  ok('предупреждений о модели нет', own.warnings.length === 0, own.warnings);
  ok('перекраска — та же форма, другой отпечаток', twin.shape === own.shape && twin.print !== own.print, { shape: twin.shape === own.shape, print: twin.print === own.print });

  part('Другой человек выложил перекрашенную, со страницы');
  const theirs = await upload(twin, `Перекраска ${MARK}`, { as: 'other' });
  ok('файл принят', theirs.sent?.status === 200, { begun: theirs.begun?.status, sent: theirs.sent?.status });
  const theirPublish = await call(`/api/models/${theirs.id}/publish`, {
    as: 'other',
    method: 'POST',
    body: { license: 'cc-by', adult: false },
  });
  ok('опубликована', theirPublish.status === 200, theirPublish);

  part('Начало загрузки');
  const wrongPrint = await call('/api/models', {
    ...byKey,
    method: 'POST',
    body: declaredOf(own, `Указатель ${MARK}`, { print: 'не отпечаток' }),
  });
  ok('отпечаток не того вида: 400', wrongPrint.status === 400, wrongPrint);
  const begun = await call('/api/models', { ...byKey, method: 'POST', body: declaredOf(own, `Указатель ${MARK}`) });
  ok('201 и номер модели', begun.status === 201 && typeof begun.said?.id === 'string', begun);
  ok('ответ читается с любого адреса', begun.open === '*', begun.open);
  const id = begun.said?.id;
  if (!id) {
    console.log('\nБез начатой загрузки дальше смысла нет.');
    return;
  }
  made.push({ id, as: 'owner' });
  const again = await call('/api/models', { ...byKey, method: 'POST', body: declaredOf(own, `Указатель ${MARK}`) });
  ok('тот же файл второй раз — та же недогруженная модель', again.said?.id === id && again.said?.already === false, again.said);

  part('Файл');
  const short = await call(`/api/models/${id}/file`, { ...byKey, method: 'PUT', body: own.bytes.slice(0, -5) });
  ok('размер не тот, что заявлен: 400', short.status === 400, short);
  const changed = own.bytes.slice();
  changed[changed.length - 1] = 0x20;
  const other = await call(`/api/models/${id}/file`, { ...byKey, method: 'PUT', body: changed });
  ok('тот же размер, но не те байты: 400 от R2', other.status === 400, other);
  const sent = await call(`/api/models/${id}/file`, { ...byKey, method: 'PUT', body: own.bytes });
  ok('файл принят', sent.status === 200 && sent.said?.ok === true, sent);
  const twice = await call(`/api/models/${id}/file`, { ...byKey, method: 'PUT', body: own.bytes });
  ok('второй раз тот же файл: 409', twice.status === 409, twice);
  const known = await call('/api/models', { ...byKey, method: 'POST', body: declaredOf(own, `Указатель ${MARK}`) });
  ok('загруженный файл узнаётся: already', known.said?.id === id && known.said?.already === true, known.said);

  part('Картинка карточки');
  const png = pngOf(pointerProject({ mark: MARK }));
  const notPicture = await call(`/api/models/${id}/preview`, {
    ...byKey,
    method: 'PUT',
    body: new TextEncoder().encode('{"это":"не картинка"}'),
    type: 'image/png',
  });
  ok('не картинка, хоть и названа картинкой: 400', notPicture.status === 400, notPicture);
  const huge = new Uint8Array(PREVIEW_MAX_BYTES + 1);
  huge.set(png.subarray(0, Math.min(png.length, huge.length)));
  const big = await call(`/api/models/${id}/preview`, { ...byKey, method: 'PUT', body: huge, type: 'image/png' });
  ok(`больше ${PREVIEW_MAX_BYTES / 1024} КБ: 413`, big.status === 413, big);
  const picture = await call(`/api/models/${id}/preview`, { ...byKey, method: 'PUT', body: png, type: 'image/png' });
  ok('картинка принята', picture.status === 200, picture);

  part('Публикация');
  const noLicence = await call(`/api/models/${id}/publish`, { ...byKey, method: 'POST', body: { adult: false } });
  ok('без лицензии: 400', noLicence.status === 400, noLicence);
  const adult = await call(`/api/models/${id}/publish`, {
    ...byKey,
    method: 'POST',
    body: { license: 'cc-by', adult: true, over18: true },
  });
  ok('возраст ключом не подтвердить: 403', adult.status === 403, adult);
  const out = await call(`/api/models/${id}/publish`, {
    ...byKey,
    method: 'POST',
    body: { license: 'cc-by', adult: false, author: 'Проверка', url: 'https://example.org/автор' },
  });
  ok('опубликована', out.status === 200 && out.said?.ok === true, out);
  ok('и названа та, у которой та же форма', out.said?.near === theirs.id, { near: out.said?.near, theirs: theirs.id });

  part('Что видно всем');
  const seen = await call(`/api/models/${id}`, { origin: 'null' });
  ok('сведения открыты без ключа', seen.status === 200 && seen.said?.id === id, seen.status);
  ok('и читаются с любого адреса', seen.open === '*', seen.open);
  ok('имя, лицензия, автор на месте', seen.said?.name === `Указатель ${MARK}` && seen.said?.license === 'cc-by' && seen.said?.author?.name === 'Проверка', {
    name: seen.said?.name,
    license: seen.said?.license,
    author: seen.said?.author,
  });
  ok('теги сохранены', JSON.stringify(seen.said?.tags) === JSON.stringify(['проверка', 'указатель']), seen.said?.tags);
  ok('отпечатки те, что посчитал плагин', seen.said?.print === own.print && seen.said?.shape === own.shape, {
    print: seen.said?.print === own.print,
    shape: seen.said?.shape === own.shape,
  });
  ok('ракурс и фон запомнены', seen.said?.background === '#1b2733' && seen.said?.look?.tilt === 0.4, { background: seen.said?.background, look: seen.said?.look });
  const card = await call(`/api/models/${id}/preview`, { origin: 'null' });
  ok('картинка отдаётся как PNG', card.status === 200 && card.kind === 'image/png', { status: card.status, kind: card.kind });

  part('Файл обратно');
  const back = await call(`/api/models/${id}/file`, { origin: 'null' });
  ok('файл открыт всем', back.status === 200, back.status);
  ok('байты те самые, что ушли', back.bytes?.length === own.bytes.length && (await sha256Hex(back.bytes)) === own.sha256, {
    length: back.bytes?.length,
    was: own.bytes.length,
  });
  const counted = await call(`/api/models/${id}`, { origin: 'null' });
  ok('скачивание посчитано', counted.said?.downloads === 1, counted.said?.downloads);
  await call(`/api/models/${id}/file?for=view`, { origin: 'null' });
  const looked = await call(`/api/models/${id}`, { origin: 'null' });
  ok('наведение с ?for=view скачиванием не считается', looked.said?.downloads === 1, looked.said?.downloads);
  const mineFile = await call(`/api/models/${id}/file`, byKey);
  ok('свой файл по ключу тоже открыт', mineFile.status === 200, mineFile.status);
  const stillOne = await call(`/api/models/${id}`, { origin: 'null' });
  ok('и хозяин себе скачиваний не накручивает', stillOne.said?.downloads === 1, stillOne.said?.downloads);

  part('Правка после публикации');
  const edited = await call(`/api/models/${id}`, {
    ...byKey,
    method: 'PATCH',
    body: { name: `Указатель ${MARK}, поправлен`, description: 'Описание переписано из плагина.', tags: ['проверка'] },
  });
  ok('правка ключом принята', edited.status === 200, edited);
  const after = await call(`/api/models/${id}`, { origin: 'null' });
  ok('новое имя и описание на месте', after.said?.name === `Указатель ${MARK}, поправлен` && after.said?.description === 'Описание переписано из плагина.', {
    name: after.said?.name,
    description: after.said?.description,
  });
  ok('теги заменены, а не добавлены', JSON.stringify(after.said?.tags) === JSON.stringify(['проверка']), after.said?.tags);

  part('Свои модели, как их увидит профиль');
  const mine = await call('/api/models?mine', byKey);
  const row = (mine.said ?? []).find((one) => one.id === id);
  ok('модель в списке своих', !!row, (mine.said ?? []).length);
  ok('с размером, по которому считается занятое место', row?.bytes === own.bytes.length, { said: row?.bytes, was: own.bytes.length });
  ok('и с картинкой', typeof row?.preview === 'string', row?.preview);

  part('Та же модель, уже выложенная другим');
  const copy = await upload(twin, `Чужая перекраска ${MARK}`, byKey);
  ok('черновик с чужим отпечатком заводится', copy.begun?.status === 201 && copy.sent?.status === 200, {
    begun: copy.begun?.status,
    sent: copy.sent?.status,
  });
  const refused = await call(`/api/models/${copy.id}/publish`, {
    ...byKey,
    method: 'POST',
    body: { license: 'cc-by', adult: false },
  });
  ok('публиковать её нельзя: 409', refused.status === 409, refused.status);
  ok('и сказано, против какой модели', refused.said?.against === theirs.id, { against: refused.said?.against, theirs: theirs.id });
  ok('первый раз — отказ без запрета на неделю', refused.said?.again === false, refused.said);
  if (refused.said?.again === true) {
    console.log('        Модель прошлого прогона осталась в каталоге: публикация этому аккаунту закрыта на неделю.');
  }
}

try {
  await run();
} finally {
  for (const { id, as } of made) {
    const gone = await call(`/api/models/${id}`, { as, method: 'DELETE' });
    if (gone.status !== 200) console.log(`не убралась модель ${id}: ${gone.status}`);
  }
  for (const id of keys) await call(`/api/keys/${id}`, { as: 'owner', method: 'DELETE' });
  if (made.length || keys.length) console.log(`\nУбрано: моделей ${made.length}, ключей ${keys.length}`);
}
console.log(`\n${done} проверок прошло, ${bad} нет`);
process.exitCode = bad ? 1 : 0;
