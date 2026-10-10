import { FALLBACK, type Lang } from '../../shared/langs.js';
import type { Words } from '../words/ru.js';

/**
 * The dictionary in force, and how it gets here.
 *
 * <h2>One language in the bundle, not fourteen</h2>
 *
 * Each dictionary is its own module, reached by a dynamic import, so the build gives
 * each one its own file and a visitor downloads the one they are reading. Written as
 * fourteen separate imports rather than one with the name in it, because that is what
 * a bundler can see: a computed path leaves it guessing, and it answers by packing all
 * of them.
 *
 * <h2>Why a function and not a value</h2>
 *
 * `words()` throws when it is asked too early. A plain exported object would have to
 * start as something, and that something would be read by any module that builds a
 * list of labels while it loads — showing a blank, or the wrong language, in a way no
 * screenshot explains. The dictionary is settled once in `main.tsx`, before anything is
 * drawn, and never changes afterwards: choosing a language is a visit to another
 * address, not a redraw.
 */

const BOOKS: Record<Lang, () => Promise<{ default: Words }>> = {
  en: () => import('../words/en.js'),
  ru: () => import('../words/ru.js'),
  zh: () => import('../words/zh.js'),
  es: () => import('../words/es.js'),
  pt: () => import('../words/pt.js'),
  de: () => import('../words/de.js'),
  fr: () => import('../words/fr.js'),
  ja: () => import('../words/ja.js'),
  ko: () => import('../words/ko.js'),
  uk: () => import('../words/uk.js'),
  tr: () => import('../words/tr.js'),
  pl: () => import('../words/pl.js'),
  it: () => import('../words/it.js'),
  nl: () => import('../words/nl.js'),
};

let book: Words | null = null;

/** The words, in the language settled for this visit. */
export function words(): Words {
  if (!book) throw new Error('the words were asked for before a language was chosen');
  return book;
}

/** Reads one dictionary. Called once, before the first thing is drawn. */
export async function loadWords(code: Lang): Promise<void> {
  const open = BOOKS[code] ?? BOOKS[FALLBACK];
  book = (await open()).default;
}
