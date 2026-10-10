import { FALLBACK, bestLang, isLang, type Lang } from '../../shared/langs.js';
import { readKept, writeKept } from './kept.js';

/**
 * Which language the site is in, and where that is written down.
 *
 * <h2>Why the address and not a setting</h2>
 *
 * Because a link somebody sends has to open what they were looking at, words
 * included. With the language kept only in storage, `/models/abc` is a different page
 * for the person who sends it and the person who opens it, and neither can tell why
 * they are talking past each other. In the address it is also one thing a search
 * engine can index fourteen times instead of once.
 *
 * <h2>Why a reload and not a redraw</h2>
 *
 * Changing the language is a visit to another address. The dictionary is then read
 * once, before anything is drawn, and no component can be left holding the old one —
 * which also means no context, no hook and no re-render to get wrong. It costs one
 * page load on an action somebody takes once.
 */

/** The name under which a deliberate choice is remembered. */
const KEPT = 'lang';

/** The language segment at the front of a path, when there is one. */
export function langInPath(path: string): Lang | null {
  const found = /^\/([A-Za-z]{2})(?=\/|$)/.exec(path);
  const code = found?.[1]?.toLowerCase();
  return isLang(code) ? code : null;
}

/** The path without its language segment: `/de/models/abc` is `/models/abc`. */
export function withoutLang(path: string): string {
  if (!langInPath(path)) return path;
  return path.slice(3) || '/';
}

/** The same path in a language. The home page keeps a trailing slash; nothing else has one. */
export function withLang(path: string, code: Lang): string {
  const rest = withoutLang(path);
  return rest === '/' ? `/${code}/` : `/${code}${rest}`;
}

let chosen: Lang = FALLBACK;

/** The language in force. Settled by `startLang` before the first thing is drawn. */
export function lang(): Lang {
  return chosen;
}

/**
 * Settles the language for this visit, and puts it in the address if it was missing.
 *
 * The order is the address, then a choice made here before, then the browser's own
 * languages, then English. A remembered choice loses to the address on purpose: a
 * link to `/ja/models/abc` is somebody showing somebody else a model, and it has to
 * open in the language it names.
 *
 * Visiting an address does not become a choice. Otherwise one German link from a
 * friend would leave the site in German for a reader of Russian, who would then have
 * to find the picker in a language they cannot read.
 */
export function startLang(): Lang {
  const inPath = langInPath(location.pathname);
  const asked = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  chosen = inPath ?? readKept(KEPT, null, isLangOrNone) ?? bestLang(asked.filter(Boolean));
  if (!inPath) {
    // replaceState rather than a redirect: the language was not in the address, so
    // there is nothing to go back to, and a visit should not cost a second round trip.
    history.replaceState(null, '', withLang(location.pathname, chosen) + location.search + location.hash);
  }
  sayItOnThePage(chosen);
  return chosen;
}

/**
 * Settles the language without touching the address.
 *
 * For the skins mode, which is the site as it was and has no language in its
 * addresses: its pages share the header and the dropdowns with the models site, so
 * they need a dictionary, but writing `/ru/skins/…` would leave its own reader of the
 * address unable to find the skin.
 */
export function fixLang(code: Lang): void {
  chosen = code;
  sayItOnThePage(code);
}

/**
 * Writes the language on the page itself, where there is a page.
 *
 * `<html lang>` is how a screen reader knows which voice to read in and how the
 * browser knows where to break a word. The check is for the tests: the modules that
 * count, sift and word things are deliberately readable without a browser, and a
 * language has to be settled before any of them can be asked anything.
 */
function sayItOnThePage(code: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = code;
}

/** A language somebody picked: remembered, then opened. */
export function goToLang(code: Lang): void {
  if (code === chosen) return;
  writeKept(KEPT, code);
  location.assign(withLang(location.pathname, code) + location.search + location.hash);
}

const isLangOrNone = (value: unknown): value is Lang | null => value === null || isLang(value);
