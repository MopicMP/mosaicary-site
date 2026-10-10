/**
 * The talk routes, asked of a Worker that is actually running.
 *
 * Everything in `test/` else is the rules on their own: `cleanComment` given a string,
 * `threadsOf` given a list. None of it touches the four routes under `/api/talk`, the
 * batch that writes a comment and its notices, or the cookie those routes read — so
 * none of it would notice if a column were misnamed or a reason were never asked for.
 * This asks the running thing, over HTTP, with a session cookie it signs itself.
 *
 * Runs against a database of its own, put in by seed.sql, so that writing comments and
 * taking them off does not touch whatever is on screen in the browser. Three commands,
 * where the second env file is what makes one seeded account the admin:
 *
 *   wrangler d1 migrations apply models-site --local --persist-to .wrangler/live-state
 *   wrangler d1 execute models-site --local --persist-to .wrangler/live-state \
 *     --file test/live/seed.sql --yes
 *   wrangler dev --local --port 8787 --persist-to .wrangler/live-state \
 *     --env-file ../.env --env-file test/live/admin.env \
 *     --var PUBLIC_ORIGIN:http://localhost:5173
 *   node test/live/talk.mjs
 *
 * The --persist-to has to be spelled out and the same in all three: without it the dev
 * server and the CLI keep separate local state, and the accounts put in by one are not
 * there for the other. Which state either picks is decided by how it was started, so
 * naming one directory is the only way they meet.
 *
 * SESSION_SECRET is read out of ../.env into a variable and never printed: the cookies
 * are built here, inside the script.
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API = process.env.LIVE_API ?? 'http://127.0.0.1:8787';
const HOME = process.env.LIVE_HOME ?? 'http://localhost:5173';

// The accounts seed.sql puts in. The last one holds the discord:admin-subject identity
// that admin.env names, so it is whoever runs the site.
const WHO = {
  owner: 'liveowner001',
  said: 'livesaid0001',
  other: 'liveother001',
  site: 'livesite0001',
};

/** A public model owned by `owner`, and one of theirs that is private. */
const MODEL = process.env.LIVE_MODEL ?? 'LiveModel001';
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
 * One request as one of them, or as nobody.
 *
 * Origin goes on everything that changes something, because the Worker refuses it
 * otherwise — that refusal is itself checked below, by leaving it off once.
 */
async function call(path, { as = null, method = 'GET', body, origin = true } = {}) {
  const headers = {};
  if (as) headers.cookie = COOKIES[as];
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (origin && method !== 'GET') headers.origin = HOME;
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
  return { status: answer.status, said };
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

/** The comment with this id, as the thread is sent to the page. */
function find(talk, id) {
  return talk.comments.find((one) => one.id === id);
}

async function run() {
  part('Сессии, которыми подписан прогон');
  for (const role of Object.keys(WHO)) {
    const me = await call('/api/auth/me', { as: role });
    ok(`${role}: вошёл как ${me.said?.handle ?? '—'}`, me.said?.signedIn === true && me.said?.id === WHO[role], me.said);
    if (role === 'site') {
      ok('и он тот, кто ведёт сайт', me.said?.admin === true, me.said);
    }
  }
  if (bad > 0) {
    console.log('\nСессии не завелись: дальше проверять нечего.');
    console.log('Проверь, что Worker поднят с ../.env и test/live/admin.env, а база — локальная.');
    return;
  }

  part('Что видно, пока никто не вошёл');
  const cold = await call(`/api/models/${MODEL}/talk`);
  ok('обсуждение открыто всем', cold.status === 200, cold);
  ok('без входа писать нельзя', cold.said?.mayWrite === false, cold.said);
  const was = cold.said?.count ?? 0;

  part('Комментарий, ответ и ответ на ответ');
  const root = await call(`/api/models/${MODEL}/talk`, {
    as: 'said',
    method: 'POST',
    body: { said: 'Под какую версию Minecraft этот риг?' },
  });
  ok('комментарий записан', root.status === 201 && typeof root.said?.id === 'string', root);
  const rootId = root.said?.id;
  ok('свой комментарий можно удалить', root.said?.mayRemove === true, root.said);
  ok('у нового комментария нет сердечек', root.said?.likes === 0 && root.said?.liked === false, root.said);

  const answer = await call(`/api/models/${MODEL}/talk`, {
    as: 'owner',
    method: 'POST',
    body: { said: 'Для 1.21, но кости те же.', replyTo: rootId },
  });
  ok('автор модели ответил', answer.status === 201, answer);
  ok('ответ привязан к корню', answer.said?.replyTo === rootId, answer.said);

  const deep = await call(`/api/models/${MODEL}/talk`, {
    as: 'other',
    method: 'POST',
    body: { said: 'А в Bedrock заводится?', replyTo: answer.said?.id },
  });
  ok('ответ на ответ принят', deep.status === 201, deep);
  ok('и встал в ту же ветку, одним уровнем', deep.said?.replyTo === rootId, deep.said);

  const soon = await call(`/api/models/${MODEL}/talk`, {
    as: 'said',
    method: 'POST',
    body: { said: 'И ещё одно сразу же.' },
  });
  ok('второй комментарий подряд не проходит', soon.status === 429, soon);

  const empty = await call(`/api/models/${MODEL}/talk`, { as: 'said', method: 'POST', body: { said: '   ' } });
  ok('пустой комментарий не проходит', empty.status === 400, empty);

  // Asked as somebody who has not written yet: the pause between one person's comments
  // is checked before the comment being answered is looked for, so the same account
  // would be told to wait instead of being told there is nothing there.
  const nowhere = await call(`/api/models/${MODEL}/talk`, {
    as: 'site',
    method: 'POST',
    body: { said: 'Ответ в никуда.', replyTo: 'zzzzzzzzzzzz' },
  });
  ok('ответ на несуществующий комментарий не проходит', nowhere.status === 404, nowhere);

  part('Сердечко на комментарии');
  const liked = await call(`/api/talk/${rootId}/like`, { as: 'other', method: 'POST' });
  ok('сердечко поставлено', liked.status === 200 && liked.said?.likes === 1 && liked.said?.liked === true, liked);
  const twice = await call(`/api/talk/${rootId}/like`, { as: 'other', method: 'POST' });
  ok('второе нажатие ничего не удваивает', twice.said?.likes === 1, twice);
  const off = await call(`/api/talk/${rootId}/like`, { as: 'other', method: 'DELETE' });
  ok('сердечко снято', off.said?.likes === 0 && off.said?.liked === false, off);
  const back = await call(`/api/talk/${rootId}/like`, { as: 'other', method: 'POST' });
  ok('и ставится снова', back.said?.likes === 1, back);
  const cold2 = await call(`/api/talk/${rootId}/like`, { method: 'POST' });
  ok('без входа сердечко не поставить', cold2.status === 401, cold2);
  const outside = await call(`/api/talk/${rootId}/like`, { as: 'other', method: 'POST', origin: false });
  ok('запрос не с сайта отбит', outside.status === 403, outside);

  part('Жалоба на комментарий');
  const wrong = await call(`/api/talk/${rootId}/report`, {
    as: 'other',
    method: 'POST',
    body: { kind: 'что-то', said: '' },
  });
  ok('без выбранного вида жалоба не проходит', wrong.status === 400, wrong);
  const told = await call(`/api/talk/${rootId}/report`, {
    as: 'other',
    method: 'POST',
    body: { kind: 'spam', said: 'Это реклама своего сервера.' },
  });
  ok('жалоба принята', told.status === 200, told);
  const mine = await call(`/api/talk/${rootId}/report`, {
    as: 'said',
    method: 'POST',
    body: { kind: 'spam', said: '' },
  });
  ok('на свой комментарий пожаловаться нельзя', mine.status === 400, mine);

  part('Очередь жалоб');
  const shut = await call('/api/admin/talk', { as: 'other' });
  ok('очередь закрыта для остальных', shut.status === 403, shut);
  const queue = await call('/api/admin/talk', { as: 'site' });
  ok('очередь открыта тому, кто ведёт сайт', queue.status === 200, queue);
  const inQueue = Array.isArray(queue.said) ? queue.said.find((one) => one.comment.id === rootId) : null;
  ok('комментарий с жалобой в очереди', !!inQueue, queue.said);
  ok('видно, что в жалобе написано', inQueue?.reports?.[0]?.kind === 'spam', inQueue?.reports);
  ok('и под какой он моделью', inQueue?.model?.id === MODEL, inQueue?.model);

  part('Снятие комментария');
  const own = await call(`/api/talk/${deep.said?.id}`, { as: 'other', method: 'DELETE', body: {} });
  ok('свой комментарий снимается без причины', own.status === 200 && own.said?.gone === 'author', own);
  const notYours = await call(`/api/talk/${rootId}`, { as: 'other', method: 'DELETE', body: { said: 'просто так' } });
  ok('чужой комментарий посторонним не снять', notYours.status === 403, notYours);
  const noWhy = await call(`/api/talk/${rootId}`, { as: 'owner', method: 'DELETE', body: { said: '' } });
  ok('без причины автор модели снять не может', noWhy.status === 400, noWhy);
  const taken = await call(`/api/talk/${rootId}`, {
    as: 'owner',
    method: 'DELETE',
    body: { said: 'Реклама стороннего сервера.' },
  });
  ok('автор модели снял с причиной', taken.status === 200 && taken.said?.gone === 'owner', taken);

  const after = await call(`/api/models/${MODEL}/talk`, { as: 'said' });
  const goneRow = find(after.said, rootId);
  ok('строка снятого осталась', !!goneRow, after.said);
  ok('написанного в ней больше нет', goneRow?.said === '', goneRow);
  ok('и сказано, кто снял', goneRow?.gone === 'owner', goneRow);
  ok('снятый комментарий больше не снять', goneRow?.mayRemove === false, goneRow);

  const onGone = await call(`/api/models/${MODEL}/talk`, {
    as: 'site',
    method: 'POST',
    body: { said: 'Отвечаю снятому.', replyTo: rootId },
  });
  ok('на снятый комментарий не ответить', onGone.status === 410, onGone);
  const heartGone = await call(`/api/talk/${rootId}/like`, { as: 'other', method: 'POST' });
  ok('снятому комментарию не поставить сердечко', heartGone.status === 410, heartGone);

  const settled = await call('/api/admin/talk', { as: 'site' });
  ok(
    'жалоба ушла из очереди вместе с решением',
    Array.isArray(settled.said) && !settled.said.some((one) => one.comment.id === rootId),
    settled.said,
  );

  part('Уведомления');
  const toSaid = await call('/api/notices', { as: 'said' });
  const kinds = (toSaid.said ?? []).map((one) => one.kind);
  ok('автору комментария пришёл ответ', kinds.includes('reply'), kinds);
  ok('и слово о снятии', kinds.includes('commentgone'), kinds);
  const why = (toSaid.said ?? []).find((one) => one.kind === 'commentgone');
  ok('в нём есть причина', (why?.said ?? '').includes('Реклама стороннего сервера.'), why?.said);
  ok('и право оспорить решение', (why?.said ?? '').includes('оспорить'), why?.said);
  ok('и ссылка на модель', why?.about === MODEL, why);
  const toOwner = await call('/api/notices', { as: 'owner' });
  ok(
    'автору модели пришёл комментарий под ней',
    (toOwner.said ?? []).some((one) => one.kind === 'comment'),
    (toOwner.said ?? []).map((one) => one.kind),
  );

  part('То же, но снимает тот, кто ведёт сайт');
  console.log('        жду, пока пройдут пятнадцать секунд между комментариями одного человека…');
  await pause(15_500);
  const again = await call(`/api/models/${MODEL}/talk`, {
    as: 'said',
    method: 'POST',
    body: { said: 'Второй комментарий, для проверки снятия.' },
  });
  ok('комментарий записан после паузы', again.status === 201, again);
  const noRule = await call(`/api/talk/${again.said?.id}`, {
    as: 'site',
    method: 'DELETE',
    body: { said: 'Повтор одного и того же.' },
  });
  ok('без пункта правил сайт снять не может', noRule.status === 400, noRule);
  const badRule = await call(`/api/talk/${again.said?.id}`, {
    as: 'site',
    method: 'DELETE',
    body: { said: 'Повтор одного и того же.', rule: 'nonsense' },
  });
  ok('и с выдуманным пунктом тоже', badRule.status === 400, badRule);
  const bySite = await call(`/api/talk/${again.said?.id}`, {
    as: 'site',
    method: 'DELETE',
    body: { said: 'Повтор одного и того же.', rule: 'ads' },
  });
  ok('снят тем, кто ведёт сайт', bySite.status === 200 && bySite.said?.gone === 'site', bySite);
  const toSaidAgain = await call('/api/notices', { as: 'said' });
  const last = (toSaidAgain.said ?? []).find((one) => one.said.includes('Повтор одного и того же.'));
  ok('в уведомлении сказано, что снял сайт', (last?.said ?? '').includes('ведёт сайт'), last?.said);
  ok('и какой пункт правил нарушен', /Нарушен пункт \d+\.\d+ правил/.test(last?.said ?? ''), last?.said);
  ok('и пункт приходит отдельно, для ссылки', last?.rule === 'ads', last);

  part('Счётчик у модели');
  const detail = await call(`/api/models/${MODEL}`, { as: 'said' });
  const live = await call(`/api/models/${MODEL}/talk`, { as: 'said' });
  const alive = (live.said?.comments ?? []).filter((one) => !one.gone).length;
  ok('счётчик сошёлся с живыми комментариями', detail.said?.comments === alive, {
    счётчик: detail.said?.comments,
    живых: alive,
  });
  ok('снятые в нём не считаются', detail.said?.comments !== live.said?.comments, {
    счётчик: detail.said?.comments,
    всего: live.said?.comments,
  });
  ok('и он не остался тем, что был до проверки', detail.said?.comments !== was || alive === was, {
    было: was,
    стало: detail.said?.comments,
  });

  part('Закрытая модель');
  const hidden = await call(`/api/models/${SHUT}/talk`);
  ok('обсуждения закрытой модели не видно вовсе', hidden.status === 404, hidden);
  const hisOwn = await call(`/api/models/${SHUT}/talk`, { as: 'owner' });
  ok('а её автору видно', hisOwn.status === 200, hisOwn);
}

run().then(
  () => {
    console.log(`\nПроверок прошло: ${done}, не прошло: ${bad}`);
    process.exit(bad === 0 ? 0 : 1);
  },
  (why) => {
    console.error('\nПрогон оборвался:', why);
    process.exit(2);
  },
);
