import { fileURLToPath } from 'node:url';

import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';

import { animationRoutes, seedAnimations } from './animations.js';
import { authRoutes } from './auth.js';
import { migrate, open } from './db.js';
import { wiringOf } from './discord.js';
import { LARGEST } from './png.js';
import { seed } from './seed.js';
import { secretOf } from './sign.js';
import { skinRoutes } from './skins.js';

/**
 * The whole back end: one process that answers `/api` and serves the built front.
 *
 * One service rather than two because Railway bills per service and per second,
 * and at five dollars a month a second process is a second bill and a second thing
 * that can be down at three in the morning. It is also one deploy, which is the
 * part that matters more often.
 *
 * The health check answers without touching anything, the database comes up before
 * the port opens, and the schema is brought forward at boot — one deploy, and never
 * a moment where the code is new and the tables are old.
 */

const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    // Railway collects stdout, so plain JSON is what actually gets read.
    transport: undefined,
  },
  // A skin is up to four megabytes and it arrives as one request. The mod's own
  // limit and this one are deliberately the same number: a limit that differs
  // between two ends of a transfer is a transfer that fails halfway.
  bodyLimit: 4 * 1024 * 1024,
});

/**
 * Whether the machine believes it is alive.
 *
 * Deliberately answers without touching the database. A health check that fails
 * when the database is slow takes the whole site down for a reason that was not
 * the site's fault, which is the commonest way a deploy becomes an outage.
 */
app.get('/api/health', async () => ({
  ok: true,
  service: 'mosaicary-site',
  version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  now: new Date().toISOString(),
}));

/**
 * The database is opened, and the schema brought forward, before the port opens.
 *
 * In that order deliberately. A process that starts answering and then migrates has
 * a window in which it is serving requests against tables that are not there yet,
 * and that window is exactly when a platform sends its first health check.
 */
const db = await open();
await migrate(db, (line) => app.log.info(line));
await seed(db, (line) => app.log.info(line));
await seedAnimations(db, (line) => app.log.info(line));
app.log.info(`база: ${db.kind}${db.kind === 'pglite' ? ' (в процессе, .data/db)' : ''}`);

/**
 * A PNG arrives as itself rather than as a field in a form.
 *
 * Fastify refuses a body whose type it has not been taught, and being taught this
 * one here means the bytes are never turned into a string on the way in — no
 * base64 a third larger than the file, and no four megabytes through a JSON parser.
 */
app.addContentTypeParser(
  ['image/png', 'application/octet-stream'],
  { parseAs: 'buffer', bodyLimit: LARGEST },
  (_request, body, done) => done(null, body),
);

/**
 * Cookies are read here and signed elsewhere.
 *
 * This plugin can sign them itself and is deliberately not asked to. What is in
 * them — who, until when — and how it is checked is worth having in one small file
 * that can be read and tested, rather than inside a dependency's options.
 */
await app.register(fastifyCookie);

// Locally there is no certificate, and a Secure cookie is one the browser will not
// send back over plain http — which would mean not being able to log in at all
// while working on the login.
const secure = process.env.NODE_ENV === 'production';
secretOf(); // refuses to start in production without one, and now rather than later
authRoutes(app, db, secure);
skinRoutes(app, db);
animationRoutes(app, db);

if (!wiringOf()) {
  app.log.warn('вход через Discord не настроен: DISCORD_CLIENT_ID/SECRET/REDIRECT_URI пусты');
}

const web = fileURLToPath(new URL('../web', import.meta.url));

await app.register(fastifyStatic, { root: web, index: ['index.html'] });

/**
 * Anything that is not the API is the front end.
 *
 * The site is one page with its own routing, so a link somebody pasted has to come
 * back with the page rather than with a 404 from the file server. `/api` is left
 * alone so that a mistyped endpoint says "no such endpoint" instead of quietly
 * handing back HTML — which is the error that costs an afternoon.
 */
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'no such endpoint' });
  }
  return reply.sendFile('index.html');
});

/**
 * Shutting down on purpose rather than being killed.
 *
 * Railway sends a signal and then waits a little. Closing the database in that
 * window is the difference between connections that are released and connections
 * the server has to time out on its own — which, on a plan with a small connection
 * limit, is a redeploy that cannot connect to its own database for a minute.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info(`${signal}: закрываюсь`);
    void app
      .close()
      .then(() => db.close())
      .finally(() => process.exit(0));
  });
}

try {
  await app.listen({ port, host });
} catch (broken) {
  app.log.error(broken);
  process.exit(1);
}
