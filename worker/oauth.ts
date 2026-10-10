import type { Env } from './env.js';

/**
 * Signing in through somebody else: Discord or GitHub.
 *
 * <h2>Why these two</h2>
 *
 * Discord is where the people who make Minecraft models talk; GitHub is where the
 * ones who make mods keep their code. Between them they cover nearly everybody who
 * would upload here, and neither asks this site to hold a password.
 *
 * <h2>What is asked for, and what is not</h2>
 *
 * An id, a name and a picture. From Discord that is the `identify` scope; from GitHub
 * it is no scope at all, which grants public profile data and nothing else — not the
 * e-mail address, not the repositories. The token is used once to read the profile
 * and thrown away, so this site cannot act as anybody anywhere.
 */

export type Provider = 'discord' | 'github';

export const PROVIDERS: Provider[] = ['discord', 'github'];

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

export interface Wiring {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Whether signing in with this provider can work at all.
 *
 * The callback is built from the site's own address rather than configured beside it,
 * so the two cannot disagree. Both spellings of Discord's pair are accepted: its
 * portal calls them "application id" and "application secret".
 */
export function wiringOf(env: Env, provider: Provider): Wiring | null {
  const origin = env.PUBLIC_ORIGIN?.replace(/\/+$/, '');
  if (!origin) return null;
  const clientId =
    provider === 'discord' ? env.DISCORD_CLIENT_ID || env.DISCORD_APP_CLIENT_ID : env.GITHUB_CLIENT_ID;
  const clientSecret =
    provider === 'discord'
      ? env.DISCORD_CLIENT_SECRET || env.DISCORD_APP_CLIENT_SECRET
      : env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${origin}/api/auth/${provider}/callback` };
}

/** Where to send somebody to be asked whether they agree. */
export function authorizeUrl(provider: Provider, wiring: Wiring, state: string): string {
  if (provider === 'discord') {
    const query = new URLSearchParams({
      client_id: wiring.clientId,
      redirect_uri: wiring.redirectUri,
      response_type: 'code',
      scope: 'identify',
      state,
      // Asked every time, so a shared machine has a way to be a second person.
      prompt: 'consent',
    });
    return `https://discord.com/api/v10/oauth2/authorize?${query.toString()}`;
  }
  const query = new URLSearchParams({
    client_id: wiring.clientId,
    redirect_uri: wiring.redirectUri,
    state,
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${query.toString()}`;
}

export interface Person {
  /** The provider's own id for them. Never the name: names change. */
  subject: string;
  handle: string;
  face: string | null;
}

/** The code from the return trip, exchanged for a token, exchanged for a person. */
export async function whoCame(
  provider: Provider,
  wiring: Wiring,
  code: string,
  fetching: typeof fetch = fetch,
): Promise<Person> {
  return provider === 'discord' ? fromDiscord(wiring, code, fetching) : fromGitHub(wiring, code, fetching);
}

async function fromDiscord(wiring: Wiring, code: string, fetching: typeof fetch): Promise<Person> {
  const got = await fetching('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: wiring.clientId,
      client_secret: wiring.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: wiring.redirectUri,
    }),
  });
  if (!got.ok) throw new Error(`discord отказал в обмене кода: ${got.status}`);
  const token = (await got.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('discord вернул обмен без токена');

  const mine = await fetching('https://discord.com/api/v10/users/@me', {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!mine.ok) throw new Error(`discord не отдал профиль: ${mine.status}`);
  const user = (await mine.json()) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  if (!user.id) throw new Error('discord вернул профиль без id');
  const face = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`
    : null;
  return {
    subject: user.id,
    handle: (user.global_name || user.username || 'кто-то').slice(0, 40),
    face,
  };
}

async function fromGitHub(wiring: Wiring, code: string, fetching: typeof fetch): Promise<Person> {
  const got = await fetching('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: wiring.clientId,
      client_secret: wiring.clientSecret,
      code,
      redirect_uri: wiring.redirectUri,
    }),
  });
  if (!got.ok) throw new Error(`github отказал в обмене кода: ${got.status}`);
  // GitHub answers a bad code with 200 and an `error` field, not with a 4xx.
  const token = (await got.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`github вернул обмен без токена: ${token.error ?? ''}`);

  const mine = await fetching('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      accept: 'application/vnd.github+json',
      // Required by GitHub's API; a request without one is refused outright.
      'user-agent': 'bbmodel-catalogue',
    },
  });
  if (!mine.ok) throw new Error(`github не отдал профиль: ${mine.status}`);
  const user = (await mine.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  if (!user.id) throw new Error('github вернул профиль без id');
  return {
    subject: String(user.id),
    handle: (user.name || user.login || 'кто-то').slice(0, 40),
    face: user.avatar_url ?? null,
  };
}
