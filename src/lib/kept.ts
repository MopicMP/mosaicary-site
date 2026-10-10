import { useEffect, useState } from 'react';

/**
 * A setting that is still there next time.
 *
 * How many skins to a row, whether they walk, which way they face: all of them are
 * decisions about how somebody likes to look at a catalogue, and a catalogue that
 * forgets them on every visit is one where they get made once and never again.
 *
 * <h2>Why every read is guarded</h2>
 *
 * Because `localStorage` throws rather than fails quietly — in a private window on
 * some browsers, with storage turned off, and when it is full. An unguarded read is
 * a blank page for the small number of people it happens to, and they are exactly
 * the people who cannot tell anybody what went wrong.
 *
 * The stored value is checked against what is expected rather than trusted. It was
 * written by an older version of this page, or by hand, and "the number of columns
 * is the string `banana`" is a layout nobody can debug from a screenshot.
 */
export function useKept<T>(name: string, fallback: T, fine: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => readKept(name, fallback, fine));

  useEffect(() => {
    writeKept(name, value);
  }, [name, value]);

  return [value, setValue] as const;
}

/**
 * The same read, outside React.
 *
 * The chosen language is wanted before the first component exists — it decides which
 * dictionary is loaded — so the reading and the guarding live here, where the name
 * prefix is already known, rather than being written a second time.
 */
export function readKept<T>(name: string, fallback: T, fine: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(`npc.${name}`);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return fine(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeKept(name: string, value: unknown): void {
  try {
    localStorage.setItem(`npc.${name}`, JSON.stringify(value));
  } catch {
    // Full, or not allowed. The setting still works for this visit, which is
    // the part that matters; being unable to remember it is not worth a word
    // on the page.
  }
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
