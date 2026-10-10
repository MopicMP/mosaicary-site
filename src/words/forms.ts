import type { Lang } from '../../shared/langs.js';

/**
 * The right word after a number, in whichever language is asking.
 *
 * Fourteen languages do this four different ways: English and nine others need two
 * forms, Russian and Ukrainian need three, Polish needs three by another rule — 21 is
 * "one" in Russian and "many" in Polish — and Chinese, Japanese and Korean need one.
 * Written out by hand, each dictionary would carry a different near-miss of the same
 * arithmetic. `Intl.PluralRules` holds all of it and is in every browser.
 *
 * A dictionary names the forms its own language has and leaves out the rest:
 *
 * ```
 * models: (n) => `${num(n)} ${ends('ru', n, { one: 'модель', few: 'модели', other: 'моделей' })}`
 * ```
 */

/**
 * The forms a language has, of the six `Intl` knows: zero, one, two, few, many, other.
 *
 * Written against the list `Intl` itself uses rather than against the forms our
 * fourteen need. None of them has a `zero` form — that is Latvian, Welsh and Arabic —
 * but `Intl.PluralRules` can name it, and a type that cannot say so is a type the
 * compiler has to be lied to about. `other` is the only one that cannot be left out.
 */
export type Forms = Partial<Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>> & { other: string };

const keep = new Map<Lang, Intl.PluralRules>();

export function ends(lang: Lang, n: number, forms: Forms): string {
  let rules = keep.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    keep.set(lang, rules);
  }
  return forms[rules.select(n)] ?? forms.other;
}
