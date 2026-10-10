/**
 * The animation catalogue, as the page sees it.
 *
 * Kept beside the skin one rather than folded into it: they look alike and they
 * are not. A skin is a picture whose author is a question; an animation arrives in
 * a pack, from a named person, and the only sorting anybody wants is by what kind
 * of thing it is.
 */

export interface Animation {
  id: string;
  pack: string;
  slug: string;
  name: string;
  author: string;
  authorUrl: string | null;
  supportUrl: string | null;
  description: string;
  loop: boolean;
  /** How long it runs, in the game's twentieths of a second. */
  ticks: number;
  tags: string[];
  icon: string | null;
  /** Where the keyframes are, asked for only when something is going to play. */
  emote: string;
}

export async function animationsFromApi(): Promise<Animation[]> {
  const answer = await fetch('/api/animations', { credentials: 'same-origin' });
  if (!answer.ok) throw new Error(`каталог анимаций не отвечает (${answer.status})`);
  return (await answer.json()) as Animation[];
}

/**
 * The categories the pack labels its own animations with.
 *
 * Taken from the entries rather than invented: this pack writes them in brackets
 * after the name, which is a ready-made taxonomy for seven hundred entries and
 * beats asking anybody to sort them by hand. Commonest first, because that is the
 * order somebody scanning a list needs them in.
 */
export function kindsOf(all: Animation[]): { tag: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const one of all) {
    for (const tag of one.tags) tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }
  return [...tally]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

/**
 * Which labels are categories and which are subdivisions of one.
 *
 * Not a judgement call — the pack answers it, by containment. Every one of the
 * thirteen "JoJo" animations is also "Мульти вселенная", so JoJo sits inside it;
 * only a sixth of "Мульти вселенная" is JoJo, so it does not sit inside JoJo. A
 * label almost entirely swallowed by another is a subdivision of it.
 *
 * This is the same rule the mod's own extractor uses, and it is here rather than
 * in a column because it is a fact about the labels rather than about any one
 * animation — computed from the list the page already has, so there is one rule
 * and not two that agree until somebody edits one.
 *
 * Counting how often a label appears alone was the first attempt and it was wrong
 * in an instructive way: "Мульти вселенная" never appears alone, because it always
 * has one of its own franchises beside it. That made the parent look like a child
 * of its children.
 */
export interface Kind {
  tag: string;
  count: number;
  under: { tag: string; count: number }[];
}

/** The pack's own tree, when the server has it. */
export interface TagKind {
  tag: string;
  parent: string | null;
}

export async function kindsFromApi(): Promise<TagKind[]> {
  try {
    const answer = await fetch('/api/animations/kinds', { credentials: 'same-origin' });
    if (!answer.ok) return [];
    return (await answer.json()) as TagKind[];
  } catch {
    return [];
  }
}

/**
 * The pack's tree, filled in with how many animations are actually under each.
 *
 * Preferred over working it out again: the game's picker shows this tree, and a
 * catalogue that groups the same animations differently is a second answer to a
 * question that has one. Falls back to {@link hierarchyOf} when the server has
 * nothing to say — a pack without categories still has labels.
 */
export function treeOf(all: Animation[], said: TagKind[]): Kind[] {
  if (!said.length) return hierarchyOf(all);
  const total = new Map<string, number>();
  for (const one of all) {
    for (const tag of one.tags) total.set(tag, (total.get(tag) ?? 0) + 1);
  }
  const parentOf = new Map(said.map((one) => [one.tag, one.parent]));

  const kinds: Kind[] = [];
  for (const [tag, count] of total) {
    if (parentOf.get(tag)) continue;
    const under = [...total]
      .filter(([child]) => parentOf.get(child) === tag)
      .map(([child, n]) => ({ tag: child, count: n }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
    kinds.push({ tag, count, under });
  }
  return kinds.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

export function hierarchyOf(all: Animation[]): Kind[] {
  const total = new Map<string, number>();
  const beside = new Map<string, Map<string, number>>();
  for (const one of all) {
    for (const tag of one.tags) {
      total.set(tag, (total.get(tag) ?? 0) + 1);
      const others = beside.get(tag) ?? new Map<string, number>();
      for (const also of one.tags) {
        if (also !== tag) others.set(also, (others.get(also) ?? 0) + 1);
      }
      beside.set(tag, others);
    }
  }

  const parentOf = new Map<string, string>();
  for (const [tag, count] of total) {
    let best: string | null = null;
    let bestCount = 0;
    for (const [other, together] of beside.get(tag) ?? []) {
      // Nearly always seen with it, and the other is the bigger of the two.
      if (together >= count * 0.9 && (total.get(other) ?? 0) > count && (total.get(other) ?? 0) > bestCount) {
        best = other;
        bestCount = total.get(other)!;
      }
    }
    if (best) parentOf.set(tag, best);
  }

  const kinds: Kind[] = [];
  for (const [tag, count] of total) {
    if (parentOf.has(tag)) continue;
    const under = [...total]
      .filter(([child]) => parentOf.get(child) === tag)
      .map(([child, n]) => ({ tag: child, count: n }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
    kinds.push({ tag, count, under });
  }
  return kinds.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

/** Everybody whose work is in here. One name today; the schema never assumed that. */
export function authorsOf(all: Animation[]): { author: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const one of all) tally.set(one.author, (tally.get(one.author) ?? 0) + 1);
  return [...tally]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count);
}

export interface AnimationFilters {
  search: string;
  tags: string[];
  authors: string[];
  /** Only the ones that repeat, which is what a standing character wants. */
  loopOnly: boolean;
  /** Only the ones short enough to be a gesture rather than a performance. */
  shortOnly: boolean;
}

export const NO_ANIMATION_FILTERS: AnimationFilters = {
  search: '',
  tags: [],
  authors: [],
  loopOnly: false,
  shortOnly: false,
};

/** Under this many ticks it is a gesture; over it, a performance. */
export const SHORT = 60;

export function siftAnimations(all: Animation[], filters: AnimationFilters): Animation[] {
  const search = filters.search.trim().toLowerCase();
  return all.filter((one) => {
    if (filters.loopOnly && !one.loop) return false;
    if (filters.shortOnly && one.ticks > SHORT) return false;
    if (filters.authors.length && !filters.authors.includes(one.author)) return false;
    // Every chosen label, because choosing two means wanting both — a dance from
    // JoJo, not everything that is either.
    if (filters.tags.length && !filters.tags.every((tag) => one.tags.includes(tag))) return false;
    if (!search) return true;
    // Every word, anywhere, across name and description — which is how people
    // type when they half remember what a thing was called.
    const haystack = `${one.name} ${one.description}`.toLowerCase();
    return search.split(/\s+/).every((word) => haystack.includes(word));
  });
}

export function narrowedAnimations(filters: AnimationFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.tags.length > 0 ||
    filters.authors.length > 0 ||
    filters.loopOnly ||
    filters.shortOnly
  );
}

/** How many to a page. Enough to scan, few enough that they all draw. */
export const PER_PAGE = 60;

/** How long it runs, in words. Ticks are the game's unit and mean nothing here. */
export function howLong(ticks: number): string {
  const seconds = ticks / 20;
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 10) return `${seconds.toFixed(1).replace('.', ',')} с`;
  return `${Math.round(seconds)} с`;
}
