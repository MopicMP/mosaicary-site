/**
 * Signing a program into an account by short code, asked of a Worker that is running.
 *
 * test/link.test.ts checks the rules on their own: the shape of a code, the shape of a
 * secret, the name a device gives itself. None of that touches the two things that can
 * only be wrong once there are rows and sessions — that the code alone collects
 * nothing, and that the key is handed over exactly once.
 *
 * Against the same database as keys.mjs, put in by seed.sql (see its header), then:
 *
 *   wrangler d1 migrations apply models-site --local --persist-to .wrangler/live-state
 *   node test/live/link.mjs
 *
 * Or against any other local state with its own accounts:
 *   LIVE_API=http://127.0.0.1:8790 LIVE_HOME=http://localhost:5173 LIVE_OWNER=<id>
 *   LIVE_OTHER=<id> LIVE_SHUT=<private model of OWNER> node test/live/link.mjs
 *
 * It runs into the limit on starting a request at the end, on purpose, so a second run
 * within the same minute starts out already limited: wait a minute between runs.
 *
 * Every key it collects it takes away again. The requests it starts are left to run
 * out: nothing on the site deletes one, and they are swept by the next person who
 * starts one after they expire.
 *
 * What is not here, and why: a request running out. It takes ten minutes, and a
 * waiting script proves less than the one line of SQL that does it.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The numbers from shared/linkWire.ts and shared/keyWire.ts, written out.
 *
 * Node runs this file as it is, and those are TypeScript. Written out rather than
 * built first, as in keys.mjs: a check that needs a build step is a check nobody runs.
 * They are held to their real values by test/link.test.ts, and the server says each of
 * them in its answers, so a number that drifts here fails the line that compares it.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEVICE_MAX = 40;
const LINK_POLL_SECONDS = 3;
const LINK_PREFIX = 'lnk_';
const KEYS_MAX = 10;

const API = process.env.LIVE_API ?? 'http://127.0.0.1:8787';
const HOME = process.env.LIVE_HOME ?? 'http://localhost:5173';

const WHO = {
  owner: process.env.LIVE_OWNER ?? 'liveowner001',
  other: process.env.LIVE_OTHER ?? 'liveother001',
};
/** One of the owner's models nobody else may see, for what a key may not do to it. */
const SHUT = process.env.LIVE_SHUT ?? 'LiveShut0001';

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

/** The same one request keys.mjs makes: a cookie, a key, and what the request says it came from. */
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

/** What the plugin does: no cookie, and `Origin: null`, which is what desktop Blockbench sends. */
const asPlugin = (path, body) => call(path, { method: 'POST', body, origin: 'null' });

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

const made = [];
const codeShape = new RegExp(`^[${CODE_ALPHABET}]{4}-[${CODE_ALPHABET}]{4}$`);
const secretShape = new RegExp(`^${LINK_PREFIX}[0-9A-Za-z]{40}$`);
const unknownSecret = LINK_PREFIX + 'z'.repeat(40);
/** Anything that is not a printable character: a line break among them. */
const CONTROL = /[\u0000-\u001f\u007f]/;
/** The characters that are not there and the ones that turn text around, by their numbers. */
const UNSEEN = new RegExp(
  `[${[0x200b, 0x200d, 0x200e, 0x200f, 0x202a, 0x202d, 0x202e, 0x2066, 0x2069, 0xfeff]
    .map((code) => String.fromCharCode(code))
    .join('')}]`,
);

/**
 * A name no device should be allowed to keep: a right-to-left override, which draws
 * what follows it backwards, a line break, a control character and more length than a
 * key name has room for.
 */
const NASTY = `Blockbench${String.fromCharCode(0x202e)}\ndlrow${String.fromCharCode(0x0007)} ${'x'.repeat(60)}`;

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
  const before = (await call('/api/keys', { as: 'owner' })).said?.length ?? 0;

  part('Плагин начинает вход');
  const start = await asPlugin('/api/link', { device: NASTY });
  ok('201', start.status === 201, start);
  ok('ответ читается с любого адреса', start.open === '*', start.open);
  const code = start.said?.code;
  const mine = start.said?.secret;
  ok('код в читаемом виде', codeShape.test(code ?? ''), code);
  ok('секрет свой, не похожий на ключ', secretShape.test(mine ?? ''), mine?.slice(0, 4));
  ok('страница названа адресом сайта, а не плагина', start.said?.url === `${HOME}/link/${code}`, start.said?.url);
  ok(`опрашивать раз в ${LINK_POLL_SECONDS} с`, start.said?.interval === LINK_POLL_SECONDS, start.said?.interval);
  const minutes = (Date.parse(start.said?.expires ?? 0) - Date.now()) / 60_000;
  ok(`ждёт около десяти минут (${minutes.toFixed(1)})`, minutes > 9 && minutes < 10.1, start.said?.expires);
  if (!code || !mine) {
    console.log('\nБез начатого входа дальше смысла нет.');
    return;
  }

  part('Пока никто не ответил');
  const waiting = await asPlugin('/api/link/poll', { secret: mine });
  ok('плагину говорят: ждём', waiting.said?.state === 'waiting', waiting);
  ok('ключа в ответе нет', waiting.said?.key === undefined, Object.keys(waiting.said ?? {}));
  const junk = await asPlugin('/api/link/poll', { secret: 'нет' });
  ok('секрет не того вида: 400, до базы дело не доходит', junk.status === 400, junk);
  const nobody = await asPlugin('/api/link/poll', { secret: unknownSecret });
  ok('чужой секрет не отличить от просроченного', nobody.said?.state === 'expired', nobody);

  part('Код сам по себе ничего не даёт');
  const byCode = await asPlugin('/api/link/poll', { secret: code });
  ok('кодом вместо секрета ключ не забрать: 400', byCode.status === 400, byCode);
  ok('и без секрета тоже: 400', (await asPlugin('/api/link/poll', { code })).status === 400);

  part('Разрешить можно только на сайте');
  const keyFirst = await call('/api/keys', { as: 'owner', method: 'POST', body: { name: 'Проверка входа' } });
  ok('свой ключ для проверки создан', keyFirst.status === 201, keyFirst.status);
  if (keyFirst.status === 201) made.push(keyFirst.said.id);
  const byKey = await call(`/api/link/${code}`, { key: keyFirst.said?.key, origin: 'null' });
  ok('ключом запрос на вход не посмотреть: 403', byKey.status === 403, byKey);
  const keyAllow = await call(`/api/link/${code}/allow`, { key: keyFirst.said?.key, method: 'POST', origin: 'null' });
  ok('и не разрешить: 403', keyAllow.status === 403, keyAllow);
  ok('без входа не посмотреть: 401', (await call(`/api/link/${code}`)).status === 401);
  const notHome = await call(`/api/link/${code}/allow`, { as: 'owner', method: 'POST', origin: false });
  ok('не с сайта не разрешить: 403', notHome.status === 403, notHome);

  part('Страница спрашивает');
  const asked = await call(`/api/link/${code}`, { as: 'owner' });
  ok('200', asked.status === 200, asked);
  const device = asked.said?.device ?? '';
  ok(`имя программы обрезано до ${DEVICE_MAX}`, device.length <= DEVICE_MAX, device.length);
  ok('в имени не осталось ни перевода строки, ни управляющих знаков', !CONTROL.test(device), device);
  ok('ни того, что переворачивает текст', !UNSEEN.test(device), device);
  ok('состояние: ждём ответа', asked.said?.state === 'waiting', asked.said?.state);
  ok(`сказано, сколько ключей уже есть из ${KEYS_MAX}`, asked.said?.keysMax === KEYS_MAX && typeof asked.said?.keys === 'number', asked.said);
  const theirs = await call(`/api/link/${code}`, { as: 'other' });
  ok('любой вошедший видит код, который у него перед глазами', theirs.status === 200, theirs.status);

  part('Ответ, и ключ, выданный один раз');
  const allowed = await call(`/api/link/${code}/allow`, { as: 'owner', method: 'POST' });
  ok('разрешено', allowed.status === 200, allowed);
  ok('отвечают один раз: второй ответ 404', (await call(`/api/link/${code}/deny`, { as: 'owner', method: 'POST' })).status === 404);
  const closed = await call(`/api/link/${code}`, { as: 'other' });
  ok('другому аккаунту закрытый запрос больше не виден: 404', closed.status === 404, closed.status);
  const got = await asPlugin('/api/link/poll', { secret: mine });
  ok('плагин забирает ключ', got.said?.state === 'taken' && typeof got.said?.key === 'string', { ...got.said, key: undefined });
  ok('и узнаёт, в чей аккаунт вошёл', got.said?.id === WHO.owner && typeof got.said?.handle === 'string', got.said?.handle);
  ok('ответ читается с любого адреса', got.open === '*', got.open);
  const again = await asPlugin('/api/link/poll', { secret: mine });
  ok('второй раз тот же ключ не выдаётся', again.said?.state === 'expired', again);

  const key = got.said?.key;
  const list = (await call('/api/keys', { as: 'owner' })).said ?? [];
  const row = list.find((one) => one.name === device);
  ok('ключ стоит в списке под именем программы', !!row, list.map((one) => one.name));
  if (row) made.push(row.id);
  ok('ключей стало на один больше', list.length === before + 2, { before, now: list.length });
  const me = await call('/api/auth/me', { key, origin: 'null' });
  ok('ключ работает и знает хозяина', me.said?.signedIn === true && me.said?.id === WHO.owner, me.said);
  ok('админом он не делает', me.said?.admin === false, me.said?.admin);

  part('Что может ключ, выданный входом');
  const begun = await call('/api/models', { key, method: 'POST', body: {}, origin: 'null' });
  ok('публикация ему открыта: отказ не от прав, а по делу', begun.status === 400, begun);
  const kill = await call(`/api/models/${SHUT}`, { key, method: 'DELETE', origin: 'null' });
  ok('удалять модели всё равно нельзя: 403', kill.status === 403, kill);
  const adult = await call(`/api/models/${SHUT}`, { key, method: 'PATCH', body: { adult: true, over18: true }, origin: 'null' });
  ok('и подтверждать возраст тоже: 403', adult.status === 403, adult);

  part('Отказ');
  const second = await asPlugin('/api/link', { device: 'Blockbench web' });
  ok('201', second.status === 201, second.status);
  const denied = await call(`/api/link/${second.said?.code}/deny`, { as: 'owner', method: 'POST' });
  ok('отказано', denied.status === 200, denied);
  const heard = await asPlugin('/api/link/poll', { secret: second.said?.secret });
  ok('плагину говорят: отказали', heard.said?.state === 'denied', heard);
  ok('после отказа разрешить нельзя: 404', (await call(`/api/link/${second.said?.code}/allow`, { as: 'owner', method: 'POST' })).status === 404);
  const after = (await call('/api/keys', { as: 'owner' })).said?.length ?? 0;
  ok('отказ ключа не создаёт', after === before + 2, { before, after });

  part('Предел на начало входа');
  let tries = 0;
  let hit = null;
  do {
    hit = await asPlugin('/api/link', { device: 'Предел' });
    tries += 1;
  } while (hit.status !== 429 && tries < 20);
  ok(`429, запросов до отказа ${tries}`, hit.status === 429 && tries <= 11, { tries, status: hit.status });
  ok('отказ читается с любого адреса', hit.open === '*', hit.open);
}

try {
  await run();
} finally {
  for (const id of made) await call(`/api/keys/${id}`, { as: 'owner', method: 'DELETE' });
  if (made.length) console.log(`\nУбрано ключей, созданных прогоном: ${made.length}`);
}
console.log(`\n${done} проверок прошло, ${bad} нет`);
process.exitCode = bad ? 1 : 0;
