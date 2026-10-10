/**
 * What a skin is here, and how the filters decide what to show.
 *
 * Kept apart from anything that draws, so the sifting can be checked by a test
 * rather than by clicking. That matters more than it usually does: a filter panel
 * has a dozen controls that combine, and the combinations are exactly what nobody
 * clicks through by hand.
 */

/** Who a skin is drawn as. The wardrobe in the mod wants the same three. */
export type Gender = 'girl' | 'boy' | 'neutral';

/** How tall the skin is in sixty-fourths: 64, or 32 for the layout before 1.8. */
export type Layout = 64 | 32;

/**
 * What is known about who drew a skin — which is usually nothing.
 *
 * Kept as a state rather than a name because the difference is the point. A PNG
 * carries no proof of authorship and no outside anchor is worth much either, so
 * the site never says "автор" as though it knew. It says who uploaded it; it says
 * who was named, if anybody; and it marks the difference between somebody having
 * said a thing and somebody having shown it.
 *
 * Draw `claimed` and `confirmed` the same way and saying "it's mine" costs
 * nothing, which is exactly how a catalogue ends up crediting whoever asked first.
 */
export interface Author {
  state: 'none' | 'first' | 'named';
  name: string | null;
  url: string | null;
}

export const NOBODY_KNOWN: Author = { state: 'none', name: null, url: null };

export interface Skin {
  id: string;
  name: string;
  /** Who put it here. Always known, and claims nothing. */
  uploader: string;
  author: Author;
  /** SHA-256 of the PNG, first thirty-two hex digits — the same one the mod uses. */
  fingerprint: string;
  url: string;
  width: number;
  layout: Layout;
  gender: Gender;
  tags: string[];
  /** The encoded face mask, or null where nobody has marked the eyes yet. */
  mask: string | null;
  /** Whether anything is drawn on the outer layer over the face. */
  hasOverlay: boolean;
  uploaded: string;
  stars: number;
}

export type Sort = 'new' | 'popular' | 'name' | 'marked';

/** Where a search looks. Chosen by a button rather than guessed at. */
export type Scope = 'all' | 'name' | 'author' | 'tag';

/**
 * How detailed a skin is.
 *
 * Its own control rather than a size in a list, because "HD" is the question
 * people actually ask — a 64-wide skin and a 1024-wide one are different things to
 * work with, and nobody thinks in pixel widths until they have already decided
 * which of the two they want.
 */
export type Quality = 'any' | 'plain' | 'hd';

/** At and above this width a skin is drawn with more detail than vanilla holds. */
export const HD_FROM = 128;

export interface Filters {
  search: string;
  scope: Scope;
  quality: Quality;
  genders: Gender[];
  sort: Sort;
  /** Newest first, in days; null is "any age at all". */
  within: number | null;
  tags: string[];
  /** Whether a skin must carry every chosen tag or merely one of them. */
  tagsAll: boolean;
  without: string[];
  /** Native widths to keep: 64, 128, 256, 512, 1024, 2048. Empty is all of them. */
  widths: number[];
  /** Only skins whose eyes somebody has marked. */
  markedOnly: boolean;
  /** Only skins that draw something on the outer layer over the face. */
  overlayOnly: boolean;
}

export const NO_FILTERS: Filters = {
  search: '',
  scope: 'all',
  quality: 'any',
  genders: [],
  sort: 'new',
  within: null,
  tags: [],
  tagsAll: false,
  without: [],
  widths: [],
  markedOnly: false,
  overlayOnly: false,
};

/** How many chosen tags a person can hold in their head, and the panel on screen. */
export const MOST_TAGS = 10;

/**
 * Whether one skin survives the filters.
 *
 * Every clause is "empty means everything", so a fresh panel shows the whole
 * catalogue and each control only ever narrows. A filter that silently excludes
 * when it was never touched is the sort of thing people report as missing skins.
 */
export function matches(skin: Skin, filters: Filters, now = Date.now()): boolean {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    // Where to look is chosen rather than guessed. A search that quietly covers
    // everything is the one that returns a skin whose name has nothing to do with
    // what was typed, and leaves nobody able to say why.
    // Both names, because somebody looking for a person means either "who drew
    // this" or "who put it here" and cannot be expected to know which the site
    // happens to know.
    const people = `${skin.uploader} ${skin.author.name ?? ''}`;
    const where: Record<Scope, string> = {
      all: `${skin.name} ${people} ${skin.tags.join(' ')}`,
      name: skin.name,
      author: people,
      tag: skin.tags.join(' '),
    };
    const haystack = where[filters.scope].toLowerCase();
    // Every word, anywhere — so "рыжая девушка" finds a skin tagged both, in
    // either order, which is how people actually type.
    if (!search.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }

  if (filters.quality === 'hd' && skin.width < HD_FROM) return false;
  if (filters.quality === 'plain' && skin.width >= HD_FROM) return false;

  if (filters.genders.length && !filters.genders.includes(skin.gender)) return false;
  if (filters.widths.length && !filters.widths.includes(skin.width)) return false;
  if (filters.markedOnly && !skin.mask) return false;
  if (filters.overlayOnly && !skin.hasOverlay) return false;

  if (filters.within !== null) {
    const age = (now - Date.parse(skin.uploaded)) / 86_400_000;
    if (!(age <= filters.within)) return false;
  }

  if (filters.tags.length) {
    const has = (tag: string) => skin.tags.includes(tag);
    if (!(filters.tagsAll ? filters.tags.every(has) : filters.tags.some(has))) return false;
  }

  // Exclusion always means "none of these", whatever the include mode is. Making
  // it follow the OR/AND switch would mean "exclude all of these together", which
  // reads as nonsense and is never what anybody wants.
  if (filters.without.some((tag) => skin.tags.includes(tag))) return false;

  return true;
}

/** The catalogue, sifted and put in order. */
export function sift(skins: Skin[], filters: Filters, now = Date.now()): Skin[] {
  const kept = skins.filter((skin) => matches(skin, filters, now));
  const order: Record<Sort, (a: Skin, b: Skin) => number> = {
    new: (a, b) => Date.parse(b.uploaded) - Date.parse(a.uploaded),
    popular: (a, b) => b.stars - a.stars,
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    // Ours, and nobody else's: marked faces first, because a marked face is one
    // that will actually blink and look at you.
    marked: (a, b) => Number(Boolean(b.mask)) - Number(Boolean(a.mask)) || b.stars - a.stars,
  };
  return kept.sort(order[filters.sort]);
}

/** Every tag in the catalogue, commonest first, for the panel to offer. */
export function tagsOf(skins: Skin[]): { tag: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const skin of skins) {
    for (const tag of skin.tags) tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }
  return [...tally]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
}

/** Whether anything has been narrowed, which is what the reset button lights up on. */
export function narrowed(filters: Filters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.quality !== 'any' ||
    filters.genders.length > 0 ||
    filters.within !== null ||
    filters.tags.length > 0 ||
    filters.without.length > 0 ||
    filters.widths.length > 0 ||
    filters.markedOnly ||
    filters.overlayOnly
  );
}

/** Adds or removes one value from a list, which is what every chip in the panel does. */
export function toggle<T>(list: T[], value: T, most = Infinity): T[] {
  if (list.includes(value)) return list.filter((each) => each !== value);
  if (list.length >= most) return list;
  return [...list, value];
}
