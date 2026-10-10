/**
 * The languages the site is written in, and how to choose one.
 *
 * The same fourteen the Blockbench plugin carries, in the same order, because a
 * person who reads the catalogue in the plugin and then opens it in a browser is
 * one person. Two lists would have drifted on the first language either side added.
 *
 * Plain data and no imports, so the page, the Worker and a build script can all ask.
 */

export const LANGS = [
  'en',
  'ru',
  'zh',
  'es',
  'pt',
  'de',
  'fr',
  'ja',
  'ko',
  'uk',
  'tr',
  'pl',
  'it',
  'nl',
] as const;

export type Lang = (typeof LANGS)[number];

/**
 * What to fall back to.
 *
 * English rather than Russian, although Russian is the language the site is written
 * in: somebody whose language we do not have is far more likely to read English than
 * Cyrillic. Which text governs where a translation disagrees is a separate question,
 * and there the answer is Russian — see the papers.
 */
export const FALLBACK: Lang = 'en';

/**
 * Each language named in itself.
 *
 * Not "German, French, Chinese" in the language currently on screen: somebody who
 * opened the site in a language they cannot read has to find their own in the list,
 * and the only word they are sure to recognise is the one their own language uses.
 */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어',
  uk: 'Українська',
  tr: 'Türkçe',
  pl: 'Polski',
  it: 'Italiano',
  nl: 'Nederlands',
};

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * The best of ours for somebody who asks for these, in their order of preference.
 *
 * Takes the part before the dash, so `de-AT`, `pt-BR` and `zh-Hant` land on the
 * language rather than falling through to English for want of a region. A browser
 * lists its languages best-first, so the first of ours to appear wins.
 */
export function bestLang(wanted: readonly string[]): Lang {
  for (const one of wanted) {
    const code = one.toLowerCase().split('-')[0];
    if (isLang(code)) return code;
  }
  return FALLBACK;
}
