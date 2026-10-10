/**
 * What the Worker is given by Cloudflare: two bindings and a handful of secrets.
 *
 * The bindings are named in `wrangler.jsonc`. The secrets are set with
 * `wrangler secret put` in production and read from `.dev.vars` or `--env-file`
 * locally; none of them is ever written into the repository.
 */
export interface Env {
  /** The catalogue: people, models, tags, hearts, comments, reports. */
  DB: D1Database;
  /** The files themselves and their pictures. */
  FILES: R2Bucket;
  /**
   * How often an API key may read and change, per account per minute (wrangler.jsonc).
   * Optional so that a Worker started without them still answers; withKey then lets
   * requests through uncounted.
   */
  KEY_READS?: RateLimit;
  KEY_WRITES?: RateLimit;
  /**
   * How often one address may start a sign-in by code, and how often it may ask how
   * that sign-in went (worker/link.ts). Counted by address, not by account: these are
   * the two routes used before there is an account to count against.
   */
  LINK_STARTS?: RateLimit;
  LINK_POLLS?: RateLimit;

  /** What sessions are signed with. At least sixteen characters, or nobody can sign in. */
  SESSION_SECRET?: string;
  /**
   * Where the site is, as a browser sees it: `https://example.org`, or
   * `http://localhost:5173` while working on it. Callbacks are built from this, and
   * every request that changes something must come from it.
   */
  PUBLIC_ORIGIN?: string;

  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  /** The same two under the names Discord's own portal uses. */
  DISCORD_APP_CLIENT_ID?: string;
  DISCORD_APP_CLIENT_SECRET?: string;

  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;

  /**
   * Who may take models down: `discord:1234,github:5678`.
   *
   * By the provider's own id rather than by ours, because ours does not exist until
   * the first sign-in — and the first person who needs to be an admin is the one
   * setting this up.
   */
  ADMINS?: string;

  /**
   * Countries where models for adults are closed, `GB,XX`. Unset is the list in
   * `shared/adult.ts`; set, it replaces it.
   */
  ADULT_CLOSED?: string;

  /**
   * Where to write about anything on the site: one e-mail, read by a person.
   *
   * Set on the server rather than written down here, because the repository is public
   * and the address is a person's own — while the law asks for a way to reach us that
   * is easy, direct and permanently there. Until it is set, the contacts page says so
   * rather than showing an empty line.
   */
  OPERATOR_EMAIL?: string;
}
