import { beforeAll, describe, expect, it } from 'vitest';

import { loadWords } from '../src/lib/words.js';
import {
  NO_MODEL_FILTERS,
  formatsOf,
  licensesOf,
  matchesModel,
  modelTagsOf,
  modelsNarrowed,
  siftModels,
  sizeOfFile,
  sizesOf,
  type ModelFilters,
} from '../src/lib/models.js';
import { useOf } from '../shared/modelRules.js';
import type { ModelSummary } from '../shared/modelWire.js';

/**
 * That the model panel narrows and never quietly hides.
 *
 * The same reasoning as the skins' panel and the same kind of test: a dozen controls
 * that combine, and the failure they produce is a model that is there but not shown.
 */

/**
 * Read with no language settled, which is the fallback: English.
 *
 * The panel labels a format and a size, so it needs a dictionary at all; which one is
 * beside the point here, and taking the fallback means this file also says what
 * somebody arriving with no preference of their own is shown.
 */
beforeAll(async () => {
  await loadWords('en');
});

const NOW = Date.parse('2026-10-06T12:00:00Z');

function model(id: string, over: Partial<ModelSummary> = {}): ModelSummary {
  const format = over.format ?? 'java_block';
  return {
    id,
    name: id,
    format,
    use: useOf(format),
    version: '5.0',
    boxUv: false,
    cubes: 10,
    meshes: 0,
    bones: 0,
    animations: 0,
    textures: 1,
    textureWidth: 16,
    textureHeight: 16,
    density: 1,
    bytes: 4000,
    tags: [],
    license: 'cc0',
    author: null,
    by: { id: 'u1', handle: 'somebody', face: null },
    published: '2026-10-01T12:00:00Z',
    created: '2026-09-01T12:00:00Z',
    updated: '2026-10-01T12:00:00Z',
    downloads: 0,
    likes: 0,
    comments: 0,
    preview: null,
    visibility: 'public',
    hidden: false,
    adult: false,
    background: null,
    look: null,
    ...over,
  };
}

const catalogue: ModelSummary[] = [
  model('chair', { tags: ['мебель'], likes: 5, downloads: 40 }),
  model('cage', {
    format: 'geckolib_model',
    tags: ['мебель', 'тюрьма'],
    bones: 4,
    animations: 2,
    textureWidth: 64,
    likes: 20,
    comments: 7,
    license: 'cc-by',
    by: { id: 'u2', handle: 'smith', face: null },
  }),
  model('donkey', {
    format: 'geckolib_model',
    tags: ['животные', 'механизмы'],
    animations: 6,
    textureWidth: 128,
    density: 2,
    likes: 20,
    comments: 2,
    downloads: 9,
    license: 'cc-by-sa',
    published: '2026-10-05T12:00:00Z',
  }),
  model('sculpture', {
    format: 'free',
    meshes: 3,
    textureWidth: 0,
    textureHeight: 0,
    textures: 0,
    density: 0,
    tags: ['статуя'],
    license: 'arr',
    author: { name: 'Mira', url: null },
  }),
  model('drum', { format: 'bedrock', textureWidth: 32, density: 2, license: 'cc-by-nc', published: '2025-01-01T12:00:00Z' }),
];

function only(over: Partial<ModelFilters>): ModelFilters {
  return { ...NO_MODEL_FILTERS, ...over };
}

const ids = (filters: Partial<ModelFilters>) => siftModels(catalogue, only(filters), NOW).map((one) => one.id);

describe('a fresh panel', () => {
  it('shows the whole catalogue, newest first', () => {
    expect(ids({})).toEqual(['donkey', 'chair', 'cage', 'sculpture', 'drum']);
    expect(modelsNarrowed(NO_MODEL_FILTERS)).toBe(false);
  });
});

describe('each control alone', () => {
  it('narrows by what the model is for', () => {
    expect(ids({ uses: ['mods'] }).sort()).toEqual(['cage', 'donkey']);
    expect(ids({ uses: ['java', 'bedrock'] }).sort()).toEqual(['chair', 'drum']);
  });

  it('splits HD from plain, with nothing to measure counted as plain', () => {
    expect(ids({ detail: 'hd' }).sort()).toEqual(['donkey', 'drum']);
    expect(ids({ detail: 'plain' }).sort()).toEqual(['cage', 'chair', 'sculpture']);
  });

  it('narrows by exact format, texture size and licence', () => {
    expect(ids({ formats: ['free'] })).toEqual(['sculpture']);
    expect(ids({ sizes: [0, 128] }).sort()).toEqual(['donkey', 'sculpture']);
    expect(ids({ licenses: ['cc-by', 'cc-by-sa'] }).sort()).toEqual(['cage', 'donkey']);
  });

  it('narrows by what is inside', () => {
    expect(ids({ animatedOnly: true }).sort()).toEqual(['cage', 'donkey']);
    expect(ids({ cubesOnly: true })).not.toContain('sculpture');
  });

  it('narrows by age, counted from when the model was published', () => {
    expect(ids({ within: 3 })).toEqual(['donkey']);
    expect(ids({ within: 30 })).not.toContain('drum');
  });

  it('takes any chosen tag, or every one', () => {
    expect(ids({ tags: ['мебель', 'животные'] }).sort()).toEqual(['cage', 'chair', 'donkey']);
    expect(ids({ tags: ['мебель', 'тюрьма'], tagsAll: true })).toEqual(['cage']);
  });

  it('leaves out a tag whatever the include mode is', () => {
    expect(ids({ tags: ['мебель'], without: ['тюрьма'] })).toEqual(['chair']);
    expect(ids({ without: ['мебель'] }).sort()).toEqual(['donkey', 'drum', 'sculpture']);
  });
});

describe('models for adults', () => {
  const two = [model('statue', { adult: true }), model('chair')];
  const kept = (adult: ModelFilters['adult']) => siftModels(two, only({ adult }), NOW).map((one) => one.id).sort();

  it('are kept, left out, or the only ones left', () => {
    expect(kept('any')).toEqual(['chair', 'statue']);
    expect(kept('without')).toEqual(['chair']);
    expect(kept('only')).toEqual(['statue']);
  });

  it('count as narrowing, so the reset button lights up', () => {
    expect(modelsNarrowed(only({ adult: 'without' }))).toBe(true);
    expect(modelsNarrowed(only({ adult: 'only' }))).toBe(true);
  });
});

describe('the search', () => {
  it('finds a model by who made it and by who put it here', () => {
    expect(ids({ search: 'mira' })).toEqual(['sculpture']);
    expect(ids({ search: 'SMITH' })).toEqual(['cage']);
  });

  it('wants every word, and looks only where it is told', () => {
    expect(ids({ search: 'cage тюрьма' })).toEqual(['cage']);
    expect(ids({ search: 'cage животные' })).toEqual([]);
    expect(ids({ search: 'мебель', scope: 'name' })).toEqual([]);
    expect(ids({ search: 'мебель', scope: 'tag' }).sort()).toEqual(['cage', 'chair']);
  });
});

describe('the order', () => {
  it('puts the most loved first, then the most downloaded', () => {
    expect(ids({ sort: 'popular' }).slice(0, 3)).toEqual(['donkey', 'cage', 'chair']);
  });

  it('puts the most downloaded first, then the most loved', () => {
    expect(ids({ sort: 'downloads' }).slice(0, 2)).toEqual(['chair', 'donkey']);
  });

  it('puts the most talked about first, then the most loved', () => {
    expect(ids({ sort: 'talked' }).slice(0, 2)).toEqual(['cage', 'donkey']);
  });

  it('sorts by name', () => {
    expect(ids({ sort: 'name' })).toEqual(['cage', 'chair', 'donkey', 'drum', 'sculpture']);
  });
});

describe('what the panel offers', () => {
  it('offers only what is there, with how many of each', () => {
    expect(formatsOf(catalogue)[0]).toEqual({ format: 'geckolib_model', label: 'GeckoLib', count: 2 });
    expect(sizesOf(catalogue).map((one) => one.size)).toEqual([0, 16, 32, 64, 128]);
    expect(modelTagsOf(catalogue)[0]).toEqual({ tag: 'мебель', count: 2 });
    expect(licensesOf(catalogue).map((one) => one.license).sort()).toEqual(
      ['arr', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc0'].sort(),
    );
  });

  it('lights the reset button for any control that narrows', () => {
    for (const over of [
      { search: 'x' },
      { uses: ['free'] },
      { detail: 'hd' },
      { within: 7 },
      { tags: ['a'] },
      { without: ['a'] },
      { formats: ['free'] },
      { sizes: [16] },
      { licenses: ['cc0'] },
      { animatedOnly: true },
      { cubesOnly: true },
    ] as Partial<ModelFilters>[]) {
      expect(modelsNarrowed(only(over))).toBe(true);
    }
    // Order is not narrowing: every model is still there.
    expect(modelsNarrowed(only({ sort: 'name' }))).toBe(false);
  });
});

describe('a model filtered on its own', () => {
  it('matches a fresh panel whatever it is', () => {
    for (const one of catalogue) expect(matchesModel(one, NO_MODEL_FILTERS, NOW)).toBe(true);
  });

  // Kilobytes below a megabyte and megabytes above, in the unit the language writes:
  // the figures and the words both come from `Intl` now. Under a kilobyte is no longer
  // a case of its own — a .bbmodel that small has nothing in it.
  it('says its size the way a person reads one', () => {
    expect(sizeOfFile(900)).toBe('1 kB');
    expect(sizeOfFile(4096)).toBe('4 kB');
    expect(sizeOfFile(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});
