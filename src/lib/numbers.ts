import { lang } from './lang.js';

/**
 * Numbers as the language on screen writes them.
 *
 * <h2>Why none of this is in the dictionary</h2>
 *
 * Because the browser already knows it, in every language, and better than we would.
 * A thousand is `1 234 567` in Russian, `1.234.567` in German and `1,234,567` in
 * English; a megabyte is `МБ` in Russian and `Mo` in French, which is the sort of
 * thing a translator gets wrong and `Intl` gets right. Asked and checked across all
 * fourteen before this was written — `tools/intl-probe.mjs` prints the table.
 *
 * Each formatter is kept rather than built per call: these run once per card, and a
 * catalogue is hundreds of cards.
 */

const keep = new Map<string, Intl.NumberFormat>();

function formatter(kind: string, how: Intl.NumberFormatOptions): Intl.NumberFormat {
  const name = `${lang()}/${kind}`;
  const had = keep.get(name);
  if (had) return had;
  const made = new Intl.NumberFormat(lang(), how);
  keep.set(name, made);
  return made;
}

/** A plain count: grouped, no decimals. */
export function num(n: number): string {
  return formatter('plain', { maximumFractionDigits: 0 }).format(n);
}

/** A number that may have a fraction, to one decimal at most. */
export function fine(n: number): string {
  return formatter('fine', { maximumFractionDigits: 1 }).format(n);
}

/**
 * How big a file is, in the unit that suits it.
 *
 * Kilobytes below a megabyte, megabytes above, and never both: "0,03 МБ" is a number
 * nobody pictures. The unit comes from `Intl`, so French reads «Mo» and Korean has no
 * space before it, neither of which we would have known to write.
 */
export function size(bytes: number): string {
  const small = bytes < 1024 * 1024;
  return formatter(small ? 'kb' : 'mb', {
    style: 'unit',
    unit: small ? 'kilobyte' : 'megabyte',
    unitDisplay: 'short',
    maximumFractionDigits: small ? 0 : 1,
  }).format(small ? bytes / 1024 : bytes / 1024 / 1024);
}

/** Megabytes exactly, for a limit that is written as one: "25 МБ", not "25,0 МБ". */
export function megabytes(bytes: number): string {
  return formatter('mb_round', {
    style: 'unit',
    unit: 'megabyte',
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  }).format(bytes / 1024 / 1024);
}

/** A country by its two letters, named in the language on screen. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames([lang()], { type: 'region' }).of(code) ?? code;
  } catch {
    // An invalid code, or a runtime without the data: the code itself is still
    // readable, and a blank where a country should be is not.
    return code;
  }
}
