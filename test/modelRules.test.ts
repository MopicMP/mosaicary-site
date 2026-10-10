import { describe, expect, it } from 'vitest';

import { factsOf, type Facts } from '../shared/bbmodel.js';
import {
  MODEL_MAX_BYTES,
  MOST_TILT,
  NAME_MAX,
  TAGS_MAX,
  TAG_MAX,
  cleanLook,
  cleanName,
  cleanTags,
  cleanUrl,
  readDeclared,
  readFacts,
  useOf,
} from '../shared/modelRules.js';

/**
 * That the page and the Worker keep the same rules.
 *
 * The page asks first so that "too big" is heard before anything goes up; the Worker
 * asks again because the page is the part anybody can replace. The case worth a test
 * of its own is the plain one: whatever an honest page counts, the Worker takes.
 */

const HASH = 'a'.repeat(64);

const FACTS: Facts = {
  format: 'geckolib_model',
  version: '5.0',
  boxUv: true,
  cubes: 12,
  meshes: 0,
  bones: 5,
  animations: 3,
  textures: 1,
  embedded: 1,
  textureWidth: 64,
  textureHeight: 64,
  density: 1,
};

function declared(over: Record<string, unknown> = {}) {
  return { name: 'Сундук', description: '', tags: [], sha256: HASH, print: HASH, shape: HASH, bytes: 1000, facts: FACTS, ...over };
}

describe('what a model is for', () => {
  it('puts each format in the group a person looking for it thinks in', () => {
    expect(useOf('java_block')).toBe('java');
    expect(useOf('optifine_entity')).toBe('java');
    expect(useOf('bedrock_block')).toBe('bedrock');
    expect(useOf('modded_entity')).toBe('mods');
    // GeckoLib's plugin, under both of the ids it has saved with.
    expect(useOf('geckolib_model')).toBe('mods');
    expect(useOf('animated_entity_model')).toBe('mods');
  });

  // What such a format is called is a question for the dictionary, and is asked in
  // `names.test.ts`; this file knows codes and no words.
  it('reads a format it does not know as free, the way Blockbench does', () => {
    expect(useOf('free')).toBe('free');
    expect(useOf('some_plugin_format')).toBe('free');
  });
});

describe('what people type', () => {
  it('keeps a name to one short line', () => {
    expect(cleanName('  Сундук\n\tс   замком ')).toBe('Сундук с замком');
    expect(cleanName('x'.repeat(200))).toHaveLength(NAME_MAX);
    expect(cleanName(undefined)).toBe('');
  });

  it('makes one tag of "Dragon" and "dragon"', () => {
    expect(cleanTags('Дракон, дракон, ДРАКОН!, мебель')).toEqual(['дракон', 'мебель']);
    expect(cleanTags(['  Sci-Fi ', 'low_poly', '<b>'])).toEqual(['sci-fi', 'low_poly', 'b']);
  });

  it('keeps tags few and short', () => {
    const many = Array.from({ length: 20 }, (_, i) => `тег${i}`);
    expect(cleanTags(many)).toHaveLength(TAGS_MAX);
    expect(cleanTags(['a'.repeat(100)])[0]).toHaveLength(TAG_MAX);
    expect(cleanTags(',, ,')).toEqual([]);
  });

  it('keeps a link only if it is an ordinary web address', () => {
    expect(cleanUrl('https://sketchfab.com/somebody')).toBe('https://sketchfab.com/somebody');
    expect(cleanUrl('javascript:alert(1)')).toBeNull();
    expect(cleanUrl('data:text/html,hi')).toBeNull();
    expect(cleanUrl('not a link')).toBeNull();
    expect(cleanUrl('')).toBeNull();
  });
});

describe('what the page says about a file', () => {
  it('is taken when an honest page counted it', () => {
    const counted = factsOf({
      meta: { format_version: '5.0', model_format: 'geckolib_model', box_uv: true },
      elements: [{ uuid: 'c1', from: [0, 0, 0], to: [1, 1, 1] }],
      outliner: [{ uuid: 'g1', name: 'root', children: ['c1'] }],
      textures: [],
    });
    expect(readFacts(counted)).toEqual(counted);
    const said = readDeclared(declared({ facts: counted }));
    expect('error' in said).toBe(false);
  });

  it('is refused for numbers no file has', () => {
    expect(readFacts({ ...FACTS, cubes: -1 })).toHaveProperty('error');
    expect(readFacts({ ...FACTS, bones: 1.5 })).toHaveProperty('error');
    expect(readFacts({ ...FACTS, textures: '1' })).toHaveProperty('error');
    expect(readFacts({ ...FACTS, cubes: 0, meshes: 0 })).toHaveProperty('error');
    expect(readFacts({ ...FACTS, density: Infinity })).toHaveProperty('error');
  });

  it('is refused for a format or version that is not an id', () => {
    expect(readFacts({ ...FACTS, format: '<script>' })).toHaveProperty('error');
    expect(readFacts({ ...FACTS, version: '5.0; drop table' })).toHaveProperty('error');
  });

  it('is refused without a name, a well-formed hash, or a sensible size', () => {
    expect(readDeclared(declared({ name: '   ' }))).toHaveProperty('error');
    expect(readDeclared(declared({ sha256: 'A'.repeat(64) }))).toHaveProperty('error');
    expect(readDeclared(declared({ shape: HASH.slice(1) }))).toHaveProperty('error');
    expect(readDeclared(declared({ bytes: 0 }))).toHaveProperty('error');
    expect(readDeclared(declared({ bytes: MODEL_MAX_BYTES + 1 }))).toHaveProperty('error');
  });

  it('keeps only the fields it knows, and rounds the density', () => {
    const said = readFacts({ ...FACTS, density: 1.23456, owner: 'somebody else' }) as Facts;
    expect(said.density).toBe(1.23);
    expect(said).not.toHaveProperty('owner');
  });
});

describe('the angle an author shows a model from', () => {
  it('is nothing at all when none was chosen', () => {
    expect(cleanLook(null)).toBeNull();
    expect(cleanLook(undefined)).toBeNull();
  });

  it('is folded into one circle, so the same side is the same numbers', () => {
    const once = cleanLook({ spin: 0.4, tilt: 0.2 });
    const round = cleanLook({ spin: 0.4 + Math.PI * 2, tilt: 0.2 });
    expect(round).toEqual(once);
    // And the far side of the circle is said the short way, not as six radians.
    expect(cleanLook({ spin: Math.PI * 1.75, tilt: 0 })?.spin).toBeCloseTo(-Math.PI / 4, 3);
  });

  it('is refused rather than quietly straightened', () => {
    // A tilt pulled back to the limit would leave the author looking at one angle
    // and everybody else at another.
    expect(cleanLook({ spin: 0, tilt: MOST_TILT + 0.2 })).toBeUndefined();
    expect(cleanLook({ spin: 0, tilt: -Math.PI / 2 })).toBeUndefined();
    expect(cleanLook({ spin: Infinity, tilt: 0 })).toBeUndefined();
    expect(cleanLook({ spin: 0 })).toBeUndefined();
    expect(cleanLook({ spin: '0.4', tilt: 0 })).toBeUndefined();
    expect(cleanLook(0.4)).toBeUndefined();
  });

  it('is kept to a fifth of a degree, which is finer than a hand can drag', () => {
    expect(cleanLook({ spin: 0.123456, tilt: 0.654321 })).toEqual({ spin: 0.123, tilt: 0.654 });
  });
});
