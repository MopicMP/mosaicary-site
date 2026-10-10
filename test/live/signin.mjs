/**
 * Signs a browser session in as one of the seeded accounts, for looking at the site.
 *
 * Signing in for real needs Discord or GitHub, which a local Worker cannot be given.
 * The cookie the site reads is just `${user}~${until}` signed with SESSION_SECRET, so
 * this bakes one and hands it to the browser:
 *
 *   node test/live/signin.mjs owner            # into the `mosaic` browser session
 *   node test/live/signin.mjs site mosaic2     # into another one
 *
 * The roles are the ones seed.sql puts in; see talk.mjs. The cookie is never printed:
 * it goes from a variable straight into the browser's arguments.
 */

import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const WHO = {
  owner: 'liveowner001',
  said: 'livesaid0001',
  other: 'liveother001',
  site: 'livesite0001',
};

const HOME = process.env.LIVE_HOME ?? 'http://localhost:5173';
const role = process.argv[2];
const where = process.argv[3] ?? 'mosaic';

if (!WHO[role]) {
  console.error(`Роли «${role ?? ''}» нет. Есть: ${Object.keys(WHO).join(', ')}.`);
  process.exit(1);
}

const secret = (() => {
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
})();

const text = `${WHO[role]}~${Date.now() + 86_400_000}`;
const mac = createHmac('sha256', secret)
  .update(text)
  .digest('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

// On Windows the CLI is a .cmd, which Node will only start through a shell. A shell
// means quoting, so the cookie is held to an alphabet that has nothing a shell reads:
// base64url, the tilde and the digits of the time.
const cookie = `${text}.${mac}`;
if (!/^[A-Za-z0-9~._-]+$/.test(cookie)) {
  throw new Error('в cookie оказался знак, который оболочка прочтёт по-своему');
}

execFileSync(
  process.platform === 'win32' ? 'agent-browser.cmd' : 'agent-browser',
  ['--session', where, 'cookies', 'set', 'session', cookie, '--url', HOME, '--path', '/'],
  { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' },
);

console.log(`Браузерная сессия «${where}» теперь ${role}. Перезагрузи страницу.`);
