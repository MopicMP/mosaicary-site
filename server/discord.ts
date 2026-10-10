/**
 * Signing in with Discord, which is where the people who use the mod already are.
 *
 * <h2>Why an outside login at all</h2>
 *
 * Because the alternative is holding passwords. Storing other people's passwords
 * means hashing them properly, resetting them by e-mail, rate-limiting the attempts
 * and being the reason somebody's other accounts fall when this one does. None of
 * that is work this project wants, and all of it is work that has to be done
 * perfectly. Discord already did it.
 *
 * <h2>What is asked for, and what is not</h2>
 *
 * Only `identify`: an id, a name and an avatar. Not `email`, not the list of
 * servers, not anything else — the consent screen says exactly what it takes, and a
 * short screen is one people read. Nothing here would ever send an e-mail, so
 * asking for an address would mean holding a column of other people's addresses for
 * no reason at all.
 */

const API = 'https://discord.com/api/v10';

export interface Wiring {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Whether the login can work at all, so it can say so instead of falling over.
 *
 * Two spellings of the same two things are accepted. Discord's own portal calls
 * them "application id" and "application secret", and writing them down that way
 * is the obvious thing to do — a login that silently does not work because a
 * variable is called something reasonable is a bad half-hour for no reason.
 */
export function wiringOf(env: NodeJS.ProcessEnv = process.env): Wiring | null {
  const clientId = env.DISCORD_CLIENT_ID || env.DISCORD_APP_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET || env.DISCORD_APP_CLIENT_SECRET;
  const redirectUri = env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** Where to send somebody to be asked whether they agree. */
export function authorizeUrl(wiring: Wiring, state: string): string {
  const query = new URLSearchParams({
    client_id: wiring.clientId,
    redirect_uri: wiring.redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
    // Ask every time rather than waving through anybody who agreed once. This is
    // the difference between "sign in" and "sign in as somebody else", and without
    // it a shared machine has no way to be a second person.
    prompt: 'consent',
  });
  return `${API}/oauth2/authorize?${query.toString()}`;
}

export interface Person {
  id: string;
  /** What they are called now. Discord lets this change, so it is never a key. */
  handle: string;
  /** The hash of their picture, or nothing. */
  avatar: string | null;
}

/**
 * The code from the return trip, exchanged for a token, exchanged for a person.
 *
 * The token is used once, here, and thrown away. Keeping it would mean being able
 * to act as somebody on Discord for as long as it lasts, which is a thing worth
 * being able to say this site cannot do.
 */
export async function whoCame(wiring: Wiring, code: string, fetching = fetch): Promise<Person> {
  const got = await fetching(`${API}/oauth2/token`, {
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

  const mine = await fetching(`${API}/users/@me`, {
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

  return {
    id: user.id,
    // The display name if there is one, the account name otherwise. Both can
    // change; the id cannot, and the id is what everything here hangs off.
    handle: (user.global_name || user.username || 'кто-то').slice(0, 40),
    avatar: user.avatar ?? null,
  };
}

/** Where their picture lives, or nothing if they have not got one. */
export function faceUrl(id: string, avatar: string | null, size = 64): string | null {
  if (!avatar) return null;
  const kind = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${kind}?size=${size}`;
}
