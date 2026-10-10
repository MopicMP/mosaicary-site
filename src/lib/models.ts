import { isLicense, type License, type Use } from '../../shared/modelRules.js';
import type { ModelSummary } from '../../shared/modelWire.js';
import type { Scope } from './catalogue.js';
import { lang } from './lang.js';
import { formatName, licenseName } from './names.js';
import { size } from './numbers.js';

/**
 * How the filters decide which models to show.
 *
 * The same panel as the skins have, re-cut for what a model is. Skins are chosen by
 * who is drawn and how detailed the picture is; models by what they are for, how
 * detailed the texture is, and what is inside — whether it moves, whether it is all
 * cubes. The controls that mean the same thing in both (order, age, where to search,
 * tags, exclusions) work the same way in both, so somebody who has used one panel
 * has used the other.
 *
 * Kept apart from anything that draws, so the sifting is checked by a test rather
 * than by clicking: a dozen controls that combine are exactly the combinations
 * nobody clicks through by hand.
 */

export type ModelSort = 'new' | 'popular' | 'downloads' | 'talked' | 'name';

/**
 * How detailed the texture is, in the two groups people mean.
 *
 * Measured as texture pixels per unit at the densest texture: one is the game's own
 * sixteen pixels to a block, and anything above it is what people call HD. A model
 * with no texture to measure counts as plain.
 */
export type Detail = 'any' | 'plain' | 'hd';

/**
 * Whether models for adults are wanted among the rest.
 *
 * Only ever asked of somebody who is shown them at all: with them hidden the far side
 * does not send them, and there is nothing here to sift.
 */
export type AdultWanted = 'any' | 'without' | 'only';

export interface ModelFilters {
  search: string;
  scope: Scope;
  uses: Use[];
  detail: Detail;
  sort: ModelSort;
  /** Newest first, in days; null is any age at all. */
  within: number | null;
  tags: string[];
  /** Whether a model must carry every chosen tag or merely one of them. */
  tagsAll: boolean;
  without: string[];
  /** Blockbench's own format ids. Empty is all of them. */
  formats: string[];
  /** Widths of the widest texture. Empty is all of them; 0 is "no texture". */
  sizes: number[];
  licenses: License[];
  adult: AdultWanted;
  animatedOnly: boolean;
  /** Only models built of cubes alone, which is what every Minecraft format but free takes. */
  cubesOnly: boolean;
}

export const NO_MODEL_FILTERS: ModelFilters = {
  search: '',
  scope: 'all',
  uses: [],
  detail: 'any',
  sort: 'new',
  within: null,
  tags: [],
  tagsAll: false,
  without: [],
  formats: [],
  sizes: [],
  licenses: [],
  adult: 'any',
  animatedOnly: false,
  cubesOnly: false,
};

/** When a model came into the catalogue: when it was published, or made if never. */
export function cameAt(model: ModelSummary): number {
  return Date.parse(model.published ?? model.created);
}

/** Every clause is "empty means everything", so a fresh panel shows the whole catalogue. */
export function matchesModel(model: ModelSummary, filters: ModelFilters, now = Date.now()): boolean {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    // Both names, because somebody looking for a person means either "who made
    // this" or "who put it here" and cannot be expected to know which one the site
    // happens to know.
    const people = `${model.by.handle} ${model.author?.name ?? ''}`;
    const where: Record<Scope, string> = {
      all: `${model.name} ${people} ${model.tags.join(' ')}`,
      name: model.name,
      author: people,
      tag: model.tags.join(' '),
    };
    const haystack = where[filters.scope].toLowerCase();
    if (!search.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }

  if (filters.uses.length && !filters.uses.includes(model.use)) return false;
  if (filters.detail === 'hd' && !(model.density > 1)) return false;
  if (filters.detail === 'plain' && model.density > 1) return false;
  if (filters.formats.length && !filters.formats.includes(model.format)) return false;
  if (filters.sizes.length && !filters.sizes.includes(model.textureWidth)) return false;
  if (filters.licenses.length && !filters.licenses.includes(model.license as License)) return false;
  if (filters.adult === 'without' && model.adult) return false;
  if (filters.adult === 'only' && !model.adult) return false;
  if (filters.animatedOnly && model.animations === 0) return false;
  if (filters.cubesOnly && model.meshes > 0) return false;

  if (filters.within !== null) {
    const age = (now - cameAt(model)) / 86_400_000;
    if (!(age <= filters.within)) return false;
  }

  if (filters.tags.length) {
    const has = (tag: string) => model.tags.includes(tag);
    if (!(filters.tagsAll ? filters.tags.every(has) : filters.tags.some(has))) return false;
  }
  // Exclusion always means "none of these", whatever the include mode is.
  if (filters.without.some((tag) => model.tags.includes(tag))) return false;

  return true;
}

export function siftModels(models: ModelSummary[], filters: ModelFilters, now = Date.now()): ModelSummary[] {
  const kept = models.filter((model) => matchesModel(model, filters, now));
  const order: Record<ModelSort, (a: ModelSummary, b: ModelSummary) => number> = {
    new: (a, b) => cameAt(b) - cameAt(a),
    popular: (a, b) => b.likes - a.likes || b.downloads - a.downloads,
    downloads: (a, b) => b.downloads - a.downloads || b.likes - a.likes,
    talked: (a, b) => b.comments - a.comments || b.likes - a.likes,
    // Collated in the language on screen, not in one language for everybody: which
    // letter comes first is a fact about the alphabet of whoever is reading.
    name: (a, b) => a.name.localeCompare(b.name, lang()),
  };
  return kept.sort(order[filters.sort]);
}

/** How many of each, commonest first, for a dropdown to offer with its count. */
function tally<T>(models: ModelSummary[], take: (model: ModelSummary) => T[]): { value: T; count: number }[] {
  const counted = new Map<T, number>();
  for (const model of models) for (const one of take(model)) counted.set(one, (counted.get(one) ?? 0) + 1);
  return [...counted].map(([value, count]) => ({ value, count }));
}

export function modelTagsOf(models: ModelSummary[]): { tag: string; count: number }[] {
  return tally(models, (model) => model.tags)
    .map(({ value, count }) => ({ tag: value, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, lang()));
}

/**
 * The formats present, by the names Blockbench's start screen gives them.
 *
 * Offered from what is there rather than from Blockbench's whole list, because a
 * choice that finds nothing is a choice that makes the panel look broken.
 */
export function formatsOf(models: ModelSummary[]): { format: string; label: string; count: number }[] {
  return tally(models, (model) => [model.format])
    .map(({ value, count }) => ({ format: value, label: formatName(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, lang()));
}

/** The texture widths present, smallest first, since that is how sizes are read. */
export function sizesOf(models: ModelSummary[]): { size: number; count: number }[] {
  return tally(models, (model) => [model.textureWidth])
    .map(({ value, count }) => ({ size: value, count }))
    .sort((a, b) => a.size - b.size);
}

export function licensesOf(models: ModelSummary[]): { license: License; label: string; count: number }[] {
  return tally(models, (model) => (model.license ? [model.license as License] : []))
    .filter(({ value }) => isLicense(value))
    .map(({ value, count }) => ({ license: value, label: licenseName(value), count }))
    .sort((a, b) => b.count - a.count);
}

/** Whether anything has been narrowed, which is what the reset button lights up on. */
export function modelsNarrowed(filters: ModelFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.uses.length > 0 ||
    filters.detail !== 'any' ||
    filters.within !== null ||
    filters.tags.length > 0 ||
    filters.without.length > 0 ||
    filters.formats.length > 0 ||
    filters.sizes.length > 0 ||
    filters.licenses.length > 0 ||
    filters.adult !== 'any' ||
    filters.animatedOnly ||
    filters.cubesOnly
  );
}

/**
 * A size in bytes the way a person reads one.
 *
 * Kept as a name of its own, because it is what the pages call; the unit and the
 * number both come from `Intl` now, which also means the one case this used to spell
 * out by hand — bytes under a kilobyte — is gone. A .bbmodel of under a kilobyte is a
 * file with nothing in it.
 */
export function sizeOfFile(bytes: number): string {
  return size(bytes);
}
