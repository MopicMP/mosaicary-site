import { looksLikeCode } from '../../shared/linkWire.js';
import { lang, withLang, withoutLang } from './lang.js';

/**
 * What an address on this site means.
 *
 * <h2>Why there is no router</h2>
 *
 * Because there is one address with anything in it. A routing library would bring a
 * dependency, a set of concepts and a way of writing the rest of the site — bought
 * for a single regular expression. When there are five of these it will be worth
 * one; there is one.
 *
 * The address is what decides which skin is open, rather than a flag with the
 * address kept in step behind it. That is what makes a sent link open the same
 * thing as a press on a card, and the browser's own Back close the window rather
 * than leave the site.
 *
 * <h2>The language segment</h2>
 *
 * Every address of the models site begins with one: `/de/models/abc`. It is taken off
 * here, by the functions that read an address, and put back here, by the ones that
 * write it — so everything that asks what an address means goes on asking in the same
 * words, and `/models/abc` without a language still opens (`lang.ts` fills it in).
 *
 * The skin pages are left alone. They are the second version, kept working rather
 * than shipped, and they run in a mode of their own that has no dictionary.
 */

/** The skin an address names, if it names one. */
export function skinInPath(path: string): string | null {
  // Held to the shape of an id rather than taking whatever is there. What comes
  // out of this goes into a request, and "whatever was in the address" is the
  // oldest way for something outside to choose what a page asks for.
  const found = /^\/skins\/([\w-]{1,64})\/?$/.exec(path);
  return found ? found[1]! : null;
}

/** Where a skin lives, so the same rule writes the address and reads it. */
export function pathOfSkin(id: string): string {
  return `/skins/${id}`;
}

/** Which page an address is. A skin window can be open over any of them. */
export type Page = 'catalogue' | 'mine' | 'animations';

export function pageOf(path: string): Page {
  if (path.startsWith('/me')) return 'mine';
  if (path.startsWith('/animations')) return 'animations';
  return 'catalogue';
}

export function pathOfPage(page: Page): string {
  return page === 'mine' ? '/me' : page === 'animations' ? '/animations' : '/';
}

/*
 * The models site, which is the whole site in its first version.
 *
 * The skin functions above stay as they are: they belong to the skin pages, which
 * run whole in their own mode until skins open in the second version and move under
 * /skins with addresses of their own.
 */

/**
 * A path of ours as it has to be written now: with the language in force at the front.
 *
 * Every address the page puts in a link or in the bar goes through this. Written as
 * one function taking one path, rather than a helper for each kind of page, because
 * what it does is the same for all of them and it has to be hard to forget: a link
 * without the language opens, but opens in whatever language the reader last chose,
 * which for a link somebody sent is the wrong one.
 *
 * Idempotent, so a path that already carries a language can be handed to it again.
 */
export function here(path: string): string {
  return withLang(path, lang());
}

/** Which part of the site an address belongs to. */
export function sectionOf(path: string): 'models' | 'skins' | 'animations' {
  const rest = withoutLang(path);
  if (rest === '/skins' || rest.startsWith('/skins/')) return 'skins';
  if (rest === '/animations' || rest.startsWith('/animations/')) return 'animations';
  return 'models';
}

/** The model an address names, held to the shape the server gives ids. */
export function modelInPath(path: string): string | null {
  const found = /^\/models\/([0-9A-Za-z]{12})\/?$/.exec(withoutLang(path));
  return found ? found[1]! : null;
}

export function pathOfModel(id: string): string {
  return here(`/models/${id}`);
}

/** The two pages of the models section. A model window can be open over either. */
export type ModelPage = 'catalogue' | 'mine';

export function modelPageOf(path: string): ModelPage {
  const rest = withoutLang(path);
  return rest === '/me' || rest.startsWith('/me/') ? 'mine' : 'catalogue';
}

export function pathOfModelPage(page: ModelPage): string {
  return here(page === 'mine' ? '/me' : '/');
}

/**
 * The sign-in request an address carries, when it is one of those addresses.
 *
 * `/link/KXMP-7TRQ` is the one address on this site that something else opens: the
 * plugin builds it and hands it to the browser. Held to the shape of a code for the
 * same reason a model id is — what comes out of here goes into a request.
 */
export function linkInPath(path: string): string | null {
  const found = /^\/link\/([A-Z2-9]{4}-[A-Z2-9]{4})\/?$/.exec(withoutLang(path));
  return found && looksLikeCode(found[1]!) ? found[1]! : null;
}

/**
 * Where the plugin sends somebody to sign in.
 *
 * Built here so the plugin's own language decides which language the page opens in:
 * it is the window the person is looking at while they read it.
 */
export function pathOfLink(code: string): string {
  return here(`/link/${code}`);
}
