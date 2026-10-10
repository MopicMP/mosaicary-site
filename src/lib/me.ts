/**
 * Who the browser is, as far as the page is concerned.
 *
 * <h2>Why the page asks rather than being told</h2>
 *
 * Because the thing that says who you are is a cookie the script cannot read — on
 * purpose, so that one cross-site script is not one stolen session. So the page has
 * to ask, once, when it loads, and everything that depends on being signed in waits
 * for that answer.
 *
 * <h2>Why the answer is never trusted for anything that matters</h2>
 *
 * It decides what to draw and nothing else. Every request that changes anything is
 * checked again on the other side, against the cookie rather than against what the
 * page believes. A page can be made to believe anything by anybody with the
 * developer tools open; the point of the check is not to stop them lying to
 * themselves.
 */

import type { AdultView } from '../../shared/adult.js';

/** The services somebody can sign in with. */
export type Provider = 'discord' | 'github';

export const PROVIDERS: Provider[] = ['discord', 'github'];

export const PROVIDER_NAMES: Record<Provider, string> = {
  discord: 'Discord',
  github: 'GitHub',
};

export interface Me {
  signedIn: boolean;
  id?: string;
  handle?: string;
  /** The address of their picture on whichever service the account was made with. */
  face?: string | null;
  /** When the account was made here, not on Discord or GitHub. */
  since?: string;
  /** Whether this person can take down and restore other people's models. */
  admin?: boolean;
  /** Which services are tied to this account. */
  providers?: Provider[];
  /** Until when uploading and publishing are closed to them, set by hand. */
  barredUntil?: string | null;
  /** Which ways of signing in can work at all — false before an application exists. */
  ready?: Partial<Record<Provider, boolean>>;
  /** The skin server's older answer to the same question, for Discord alone. */
  discordReady?: boolean;
  /** How models for adults are shown to them, as the far side decided it. */
  adult?: {
    /** What actually happens, taking the country and the confirmation into account. */
    view: AdultView;
    /** What they chose, which is only the same as `view` once they have confirmed. */
    chosen?: AdultView;
    /** Whether they have said they are eighteen. */
    confirmed: boolean;
    /** Whether models for adults are closed where they are. Then there is nothing to choose. */
    closed: boolean;
  };
}

/** How this browser is shown models for adults; hidden until the far side says otherwise. */
export function viewOfMe(me: Me): AdultView {
  return me.adult?.view ?? 'hide';
}

/** Whether signing in through a service can work, by either server's answer. */
export function canSignInWith(me: Me, provider: Provider): boolean {
  if (me.ready) return me.ready[provider] === true;
  return provider === 'discord' && me.discordReady !== false;
}

/** Where to send somebody to sign in, coming back to where they are now. */
export function signInPath(provider: Provider, back = location.pathname): string {
  return `/api/auth/${provider}?back=${encodeURIComponent(back)}`;
}

export const NOBODY: Me = { signedIn: false };

/**
 * How long the page keeps asking while nobody answers at all.
 *
 * After a restart the page is back before the API is: Vite is up in a second, the
 * Worker in several, and the page reloads the moment Vite is there. Its proxy then
 * answers 500 for the API, and taking that for "not signed in" showed the sign-in
 * button to somebody whose cookie was fine — signing in again only seemed to fix it
 * because the Worker had come up in the meantime. Silence is not an answer, so it is
 * asked again; twenty seconds covers a restart and gives up on an API that is off.
 */
const PATIENCE_MS = 20_000;

export async function askWhoIAm(): Promise<Me> {
  const until = Date.now() + PATIENCE_MS;
  for (let wait = 500; ; wait = Math.min(wait * 2, 4000)) {
    const said = await askOnce();
    if (said) return said;
    // Offline, or the API is not running while only the front end is. Not being
    // able to say who you are is not an error worth putting on the page.
    if (Date.now() + wait > until) return NOBODY;
    await new Promise((done) => setTimeout(done, wait));
  }
}

/** The answer, or null when there was none: no connection, or the server failing to give one. */
async function askOnce(): Promise<Me | null> {
  try {
    const answer = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (answer.status >= 500) return null;
    if (!answer.ok) return NOBODY;
    return (await answer.json()) as Me;
  } catch {
    return null;
  }
}

/**
 * Choosing how models for adults are shown, and saying one's age the first time.
 *
 * The answer is the far side's refusal in words, or null when it went through. The
 * choice is kept with the account rather than in this browser, because it is the far
 * side that has to honour it: a model for adults is not sent at all to somebody who
 * has them hidden, and a setting the server does not know cannot do that.
 */
export async function chooseAdult(view: AdultView, over18 = false): Promise<string | null> {
  try {
    const answer = await fetch('/api/auth/adult', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ view, over18 }),
    });
    if (answer.ok) return null;
    const said = (await answer.json().catch(() => null)) as { error?: string } | null;
    return said?.error ?? 'не получилось сохранить';
  } catch {
    return 'сервер не ответил';
  }
}

export async function leave(): Promise<void> {
  await fetch('/api/auth/leave', { method: 'POST', credentials: 'same-origin' });
}

/**
 * What went wrong on the way back from Discord or GitHub, in words.
 *
 * The far side says it in the address in ASCII so the bar stays readable; the
 * translation lives here rather than there. "Подделка" is the interesting one: it
 * means somebody was handed a link to our callback carrying a code that was not
 * theirs, and it was refused. "Занят" is the other: the outside account is already
 * tied to a different person here, and tying it to a second would let either of them
 * sign in as the other.
 */
export function loginTrouble(search: string): string | null {
  const said = new URLSearchParams(search).get('login');
  if (said === 'cancelled') return 'Вход отменён.';
  if (said === 'forged') return 'Вход отклонён: возврат не совпал с началом. Попробуй ещё раз.';
  if (said === 'failed') return 'Сервис входа не ответил как надо. Попробуй ещё раз.';
  if (said === 'taken') {
    return 'Этот аккаунт уже привязан к другому профилю здесь. Войди через него, чтобы им пользоваться.';
  }
  return null;
}
