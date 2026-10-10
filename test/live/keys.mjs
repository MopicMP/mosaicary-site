/**
 * API keys, asked of a Worker that is actually running.
 *
 * test/keys.test.ts checks the rules on their own: how a header is read, what a key
 * may reach. None of that touches the routes, the database or the one thing that is
 * easiest to get wrong here — that a request carrying a key, a wrong one included,
 * never falls back to the cookie that came along with it. This asks the running
 * Worker over HTTP, the way the plugin does: from another origin, desktop Blockbench
 * sending `Origin: null`.
 *
 * Against the same database as talk.mjs, put in by seed.sql (see its header for the
 * three commands), then:
 *
 *   wrangler d1 migrations apply models-site --local --persist-to .wrangler/live-state
 *   node test/live/keys.mjs
 *
 * Or against any other local state with its own accounts:
 *   LIVE_API=http://127.0.0.1:8790 LIVE_OWNER=<id> LIVE_OTHER=<id> LIVE_SHUT=<private model of OWNER>
 *   LIVE_PUBLIC=<public model of OWNER> LIVE_THEIRS=<public model of OTHER>
 *   LIVE_ADULT=<public model for adults> node test/live/keys.mjs
 *
 * It runs into the key's own limits on purpose, near the end, so a second run within
 * the same minute starts out already limited: wait a minute between runs.
 *
 * Every key it makes it takes away again, and the owner's showing of models for adults
 * is put back to hidden at the end.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API = process.env.LIVE_API ?? 'http://127.0.0.1:8787';
const HOME = process.env.LIVE_HOME ?? 'http://localhost:5173';

const WHO = {
  owner: process.env.LIVE_OWNER ?? 'liveowner001',
  other: process.env.LIVE_OTHER ?? 'liveother001',
};
/** One of the owner's models nobody else may see, and, if there is one, a public model for adults. */
const SHUT = process.env.LIVE_SHUT ?? 'LiveShut0001';
const ADULT = process.env.LIVE_ADULT ?? null;
/** A public model of the owner's, for comments under it, and a public model of anybody's, for hearts. */
const PUBLIC = process.env.LIVE_PUBLIC ?? 'LiveModel001';
const THEIRS = process.env.LIVE_THEIRS ?? PUBLIC;

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

/** The same cookie `makeSession` bakes: who, until when, signed. */
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
 * One request. `as` brings a cookie, `key` an Authorization header, `origin` is what
 * the request says it came from: the site's own page by default for changes, `null`
 * for the plugin, false for nothing at all.
 */
async function call(path, { as = null, key = null, method = 'GET', body, origin } = {}) {
  const headers = {};
  if (as) headers.cookie = COOKIES[as];
  if (key !== null) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const from = origin === undefined ? (method !== 'GET' && key === null ? HOME : null) : origin;
  if (from !== null && from !== false) headers.origin = from;
  const answer = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await answer.text();
  let said = null;
  try {
    said = text ? JSON.parse(text) : null;
  } catch {
    said = { error: text.slice(0, 200) };
  }
  return { status: answer.status, said, open: answer.headers.get('access-control-allow-origin') };
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

const pause = (ms) => new Promise((wake) => setTimeout(wake, ms));
const made = [];

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

  part('Управление ключами: только со страницы сайта, после входа');
  ok('без входа список не отдаётся', (await call('/api/keys')).status === 401);
  const none = await call('/api/keys', { as: 'owner' });
  ok('список своих ключей', none.status === 200 && Array.isArray(none.said), none);
  const before = none.said?.length ?? 0;
  ok('без Origin сайта ключ не создаётся', (await call('/api/keys', { as: 'owner', method: 'POST', body: { name: 'x' }, origin: false })).status === 403);
  ok('с чужим Origin тоже', (await call('/api/keys', { as: 'owner', method: 'POST', body: { name: 'x' }, origin: 'https://evil.example' })).status === 403);
  ok('без имени не создаётся', (await call('/api/keys', { as: 'owner', method: 'POST', body: { name: '   ' } })).status === 400);
  ok('слишком длинное имя тоже', (await call('/api/keys', { as: 'owner', method: 'POST', body: { name: 'x'.repeat(41) } })).status === 400);

  const first = await call('/api/keys', { as: 'owner', method: 'POST', body: { name: 'Blockbench  дома' } });
  ok('ключ создан', first.status === 201 && typeof first.said?.key === 'string', first);
  const key = first.said?.key ?? '';
  if (first.said?.id) made.push(first.said.id);
  ok('ключ показан целиком, с приставкой mos_ и 40 знаками', /^mos_[0-9A-Za-z]{40}$/.test(key), key.length);
  ok('подсказка — его последние четыре знака', first.said?.hint === key.slice(-4), first.said);
  ok('пробелы в имени сжаты', first.said?.name === 'Blockbench дома', first.said);
  ok('хеша в ответе нет', !('hash' in (first.said ?? {})));

  const listed = await call('/api/keys', { as: 'owner' });
  const row = listed.said?.find?.((one) => one.id === first.said?.id);
  ok('новый ключ в списке', listed.said?.length === before + 1 && !!row, listed.said);
  ok('в списке ни самого ключа, ни хеша', row && !('key' in row) && !('hash' in row), row);
  ok('ещё не использован', row?.used === null, row);

  part('Ключ вместо cookie, как его шлёт плагин: Origin: null');
  const me = await call('/api/auth/me', { key, origin: 'null' });
  ok('ключ узнаёт хозяина', me.status === 200 && me.said?.signedIn === true && me.said?.id === WHO.owner, me.said);
  ok('ответ читается с любого адреса', me.open === '*', me.open);
  ok('админом ключ не делает', me.said?.admin === false, me.said);
  const mine = await call('/api/models?mine=1', { key, origin: 'null' });
  ok('свои модели видны, и приватная среди них', mine.status === 200 && mine.said?.some?.((one) => one.id === SHUT), mine.status);
  ok('и они тоже читаются с любого адреса', mine.open === '*', mine.open);
  const theirs = await call(`/api/models/${SHUT}`, { as: 'other' });
  ok('чужому приватная модель не видна', theirs.status === 404, theirs.status);
  await pause(400);
  const usedRow = (await call('/api/keys', { as: 'owner' })).said?.find?.((one) => one.id === first.said?.id);
  ok('час использования записан', typeof usedRow?.used === 'string' && usedRow.used.endsWith(':00:00.000Z'), usedRow);

  part('Чего ключ не может');
  const keys = await call('/api/keys', { key, origin: 'null' });
  ok('управлять ключами: 403', keys.status === 403, keys);
  ok('и отказ тоже читается с любого адреса', keys.open === '*', keys.open);
  ok('создать ключ ключом: 403', (await call('/api/keys', { key, method: 'POST', body: { name: 'y' }, origin: 'null' })).status === 403);
  ok('подтвердить возраст: 403', (await call('/api/auth/adult', { key, method: 'POST', body: { view: 'open', over18: true }, origin: 'null' })).status === 403);
  ok('выйти: 403', (await call('/api/auth/leave', { key, method: 'POST', origin: 'null' })).status === 403);
  ok('удалить модель: 403', (await call(`/api/models/${SHUT}`, { key, method: 'DELETE', origin: 'null' })).status === 403);
  ok('снять с каталога: 403', (await call(`/api/models/${SHUT}/hide`, { key, method: 'POST', origin: 'null' })).status === 403);

  // Публикация ключу открыта, и проверяется это отказом не того вида: тело пустое, так
  // что до самой публикации дело не доходит, но и «ключом нельзя» в ответ уже не приходит.
  const letIn = await call(`/api/models/${SHUT}/publish`, { key, method: 'POST', body: {}, origin: 'null' });
  ok('опубликовать ключ может: отказ не от прав', letIn.status !== 403, letIn);

  part('Неверный ключ никогда не пускает к cookie');
  const garbage = await call('/api/auth/me', { as: 'owner', key: 'mos_notakey', origin: 'null' });
  ok('мусорный ключ вместе с cookie хозяина: никто', garbage.status === 200 && garbage.said?.signedIn === false, garbage.said);
  const notBearer = await fetch(`${API}/api/auth/me`, { headers: { cookie: COOKIES.owner, authorization: 'Basic abc' } });
  ok('Authorization не того вида вместе с cookie: никто', (await notBearer.json()).signedIn === false);
  const wrongMine = await call('/api/models?mine=1', { as: 'owner', key: 'mos_' + 'A'.repeat(40), origin: 'null' });
  ok('ключ правильного вида, но чужой для базы: свои модели не отдаются', wrongMine.status === 401, wrongMine.status);

  part('Предварительный запрос CORS');
  const pre = await fetch(`${API}/api/models`, {
    method: 'OPTIONS',
    headers: { origin: 'null', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
  });
  ok('204', pre.status === 204, pre.status);
  ok('разрешён заголовок authorization', /authorization/i.test(pre.headers.get('access-control-allow-headers') ?? ''));
  ok('credentials не разрешены', pre.headers.get('access-control-allow-credentials') === null);

  if (ADULT) {
    part('Модели 18+ по уровню хозяина ключа');
    const hidden = await call('/api/models', { key, origin: 'null' });
    ok('пока «Скрывать», модели 18+ нет', hidden.status === 200 && !hidden.said.some((one) => one.id === ADULT), hidden.status);
    const opened = await call('/api/auth/adult', { as: 'owner', method: 'POST', body: { view: 'open', over18: true } });
    ok('хозяин на сайте выбрал «Открытый»', opened.status === 200, opened.said);
    const shown = await call('/api/models', { key, origin: 'null' });
    ok('теперь модель 18+ в ответе на ключ', shown.status === 200 && shown.said.some((one) => one.id === ADULT), shown.status);
    ok('и этот ответ тоже читается с любого адреса', shown.open === '*', shown.open);
    const file = await call(`/api/models/${ADULT}/file`, { key, origin: 'null' });
    ok('файл модели 18+ отдаётся ключу', file.status === 200, file.status);
    const anon = await call('/api/models');
    ok('без ключа её по-прежнему нет', !anon.said.some((one) => one.id === ADULT));
    await call('/api/auth/adult', { as: 'owner', method: 'POST', body: { view: 'hide' } });
  }

  part('Сердечки, комментарии и уведомления ключом');
  const heartOn = await call(`/api/models/${THEIRS}/like`, { key, method: 'POST', origin: 'null' });
  ok('сердечко модели ставится ключом', heartOn.status === 200 && heartOn.said?.liked === true, heartOn);
  const loved = await call('/api/models/liked', { key, origin: 'null' });
  ok('и модель в «Любимом»', loved.status === 200 && JSON.stringify(loved.said).includes(THEIRS), loved.said);
  const heartOff = await call(`/api/models/${THEIRS}/like`, { key, method: 'DELETE', origin: 'null' });
  ok('и снимается', heartOff.status === 200 && heartOff.said?.liked === false, heartOff);
  ok('комментарии читаются', (await call(`/api/models/${PUBLIC}/talk`, { key, origin: 'null' })).status === 200);
  const written = await call(`/api/models/${PUBLIC}/talk`, {
    key,
    method: 'POST',
    body: { said: 'Проверка ключа: комментарий из плагина' },
    origin: 'null',
  });
  ok('комментарий пишется ключом', written.status === 201 && typeof written.said?.id === 'string', written);
  ok('и подписан хозяином ключа', written.said?.by?.id === WHO.owner, written.said?.by);
  const cHeart = await call(`/api/talk/${written.said?.id}/like`, { key, method: 'POST', origin: 'null' });
  ok('сердечко комментарию', cHeart.status === 200, cHeart);
  const foreign = await call(`/api/models/${PUBLIC}/talk`, {
    as: 'other',
    method: 'POST',
    body: { said: 'Проверка ключа: чужой комментарий' },
  });
  ok('(чужой комментарий под моделью хозяина написан по cookie)', foreign.status === 201, foreign);
  const wipe = await call(`/api/talk/${foreign.said?.id}`, {
    key,
    method: 'DELETE',
    body: { said: 'Снимаю ключом, это должно не пройти' },
    origin: 'null',
  });
  ok('чужой комментарий ключом не снять, даже под своей моделью', wipe.status === 403, wipe);
  const own = await call(`/api/talk/${written.said?.id}`, { key, method: 'DELETE', body: {}, origin: 'null' });
  ok('свой снимается', own.status === 200, own);
  await call(`/api/talk/${foreign.said?.id}`, { as: 'other', method: 'DELETE', body: {} });
  const reported = await call(`/api/models/${THEIRS}/report`, {
    key,
    method: 'POST',
    body: { kind: 'junk', said: 'проверка' },
    origin: 'null',
  });
  ok('жалоба ключом: 403', reported.status === 403, reported);
  ok('уведомления читаются', (await call('/api/notices', { key, origin: 'null' })).status === 200);
  ok('и отмечаются прочитанными', (await call('/api/notices/seen', { key, method: 'POST', body: {}, origin: 'null' })).status === 200);

  part('Предел частоты для ключа');
  let tries = 0;
  let hit = null;
  do {
    hit = await call(`/api/models/${THEIRS}/like`, { key, method: tries % 2 ? 'DELETE' : 'POST', origin: 'null' });
    tries += 1;
  } while (hit.status !== 429 && tries < 40);
  ok(`изменения: 429, запросов до отказа ${tries}`, hit.status === 429 && tries <= 31, { tries, status: hit.status });
  ok('отказ читается с любого адреса', hit.open === '*', hit.open);
  const byCookie = await call(`/api/models/${THEIRS}/like`, { as: 'owner', method: 'DELETE' });
  ok('на сайте по cookie предел ключа не действует', byCookie.status === 200, byCookie.status);
  let reads = 0;
  let read = null;
  do {
    read = await call('/api/auth/me', { key, origin: 'null' });
    reads += 1;
  } while (read.status !== 429 && reads < 320);
  ok(`чтение: 429, запросов до отказа ${reads}`, read.status === 429 && reads <= 301, { reads, status: read.status });

  part('Удаление');
  ok('чужой ключ не удалить', (await call(`/api/keys/${first.said?.id}`, { as: 'other', method: 'DELETE' })).status === 404);
  ok('без Origin сайта не удалить', (await call(`/api/keys/${first.said?.id}`, { as: 'owner', method: 'DELETE', origin: false })).status === 403);
  const gone = await call(`/api/keys/${first.said?.id}`, { as: 'owner', method: 'DELETE' });
  ok('свой удаляется', gone.status === 200, gone);
  if (gone.status === 200) made.splice(made.indexOf(first.said?.id), 1);
  const dead = await call('/api/auth/me', { key, origin: 'null' });
  ok('удалённый ключ сразу никто', dead.said?.signedIn === false, dead.said);
  ok('и своих моделей больше не видит', (await call('/api/models?mine=1', { key, origin: 'null' })).status === 401);

  part('Предел числа ключей');
  const now = (await call('/api/keys', { as: 'owner' })).said.length;
  let last = null;
  for (let i = now; i < 11; i += 1) {
    last = await call('/api/keys', { as: 'owner', method: 'POST', body: { name: `Проверка ${i + 1}` } });
    if (last.status === 201) made.push(last.said.id);
  }
  ok('одиннадцатый ключ не создаётся: 409', last?.status === 409, last);
}

try {
  await run();
} finally {
  for (const id of made) await call(`/api/keys/${id}`, { as: 'owner', method: 'DELETE' });
  if (made.length) console.log(`\nУбрано ключей, созданных прогоном: ${made.length}`);
}
console.log(`\n${done} проверок прошло, ${bad} нет`);
process.exitCode = bad ? 1 : 0;
