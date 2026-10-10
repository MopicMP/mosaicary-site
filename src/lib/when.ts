import { lang } from './lang.js';
import { words } from './words.js';

/**
 * Saying when something was, in the language on screen.
 *
 * <h2>Why none of the wording is ours</h2>
 *
 * This file used to count one thing, two things and five things in Russian by hand,
 * with a note about eleven to fourteen taking the many-form. `Intl.RelativeTimeFormat`
 * does that for all fourteen languages, including the three that need few and many
 * (Russian, Ukrainian, Polish) and the three that need no plural at all (Chinese,
 * Japanese, Korean), and it says "yesterday" and "today" rather than "1 day ago".
 * Checked across every language before this was written: `tools/intl-probe.mjs`.
 *
 * What is left here is the arithmetic, which is the part that is ours: where days stop
 * being useful and months begin. "Четыреста двенадцать дней назад" is a number nobody
 * converts in their head; "год назад" is what was being asked.
 */

const keep = new Map<string, Intl.RelativeTimeFormat>();

function sayer(): Intl.RelativeTimeFormat {
  const had = keep.get(lang());
  if (had) return had;
  const made = new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' });
  keep.set(lang(), made);
  return made;
}

/** How long ago, in the shortest form that is still true. */
export function ago(when: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(when)) / 86_400_000);
  // Not a date, or a date still to come: a clock out by a minute either way is the
  // ordinary case, and "in 0 days" is not an answer.
  if (!Number.isFinite(days) || days < 0) return words().when.just_now;
  const say = sayer();
  if (days < 31) return say.format(-days, 'day');
  if (days < 365) return say.format(-Math.max(1, Math.round(days / 30)), 'month');
  return say.format(-Math.floor(days / 365), 'year');
}

/** A date written out, for the one or two places that show one rather than an interval. */
export function onDay(when: string): string {
  const day = new Date(when);
  if (Number.isNaN(day.getTime())) return when;
  return day.toLocaleDateString(lang(), { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * One, two, or five, for the languages that need it.
 *
 * Kept because the Russian papers are written by hand and count things in their own
 * sentences. Eleven to fourteen are the trap: they end in one, two, three and four and
 * take the many-form anyway.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const two = n % 100;
  if (two >= 11 && two <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
