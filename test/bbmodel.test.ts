import { describe, expect, it } from 'vitest';

import {
  NotAModel,
  factsOf,
  formatOf,
  olderThan,
  parseProject,
  pixelSizeOf,
  prepare,
  printsOf,
  sameFacts,
  sha256Hex,
  stripPaths,
  warningsOf,
  type Project,
} from '../shared/bbmodel.js';

/**
 * That a project file is read the way Blockbench reads it, and nothing of the
 * uploader's own disk goes up with it.
 *
 * The server never opens a model, so this is the whole of what is known about one:
 * the counts the catalogue filters by, the fingerprints copies are caught by, and
 * the file that is stored. Every model here is made up on the spot, in the shapes
 * the real files on GitHub come in: the 5.0 layout with a list of groups, the older
 * one with whole groups in the outliner, and the oldest with `content`.
 */

const UV_FACES = { north: { uv: [0, 0, 4, 4], texture: 0 }, south: { uv: [4, 0, 8, 4], texture: 0 } };

function cube(uuid: string, over: Project = {}): Project {
  return { uuid, name: uuid, from: [0, 0, 0], to: [4, 4, 4], origin: [0, 0, 0], faces: UV_FACES, ...over };
}

/** The first bytes of a PNG of the given size: all that is read of one. */
function pngOf(width: number, height: number): string {
  const head = new Uint8Array(33);
  head.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(head.buffer).setUint32(16, width);
  new DataView(head.buffer).setUint32(20, height);
  return `data:image/png;base64,${Buffer.from(head).toString('base64')}`;
}

/** A project in the 5.0 layout: groups in a list, the outliner a tree of ids. */
function modern(over: Project = {}): Project {
  return {
    meta: { format_version: '5.0', model_format: 'bedrock', box_uv: false },
    resolution: { width: 16, height: 16 },
    elements: [cube('c1'), cube('c2', { from: [4, 0, 0], to: [8, 4, 4] })],
    groups: [{ uuid: 'g1', name: 'body', origin: [0, 0, 0] }],
    outliner: [{ uuid: 'g1', isOpen: true, children: ['c1', 'c2'] }],
    textures: [{ uuid: 't1', name: 'skin.png', source: pngOf(64, 64), path: 'C:\\Users\\Anna\\Desktop\\skin.png' }],
    animations: [],
    ...over,
  };
}

const bytesOf = (project: Project) => new TextEncoder().encode(JSON.stringify(project)) as Uint8Array<ArrayBuffer>;

describe('a file that is not a model', () => {
  it('is turned away with something a person can do about it', () => {
    expect(() => parseProject('<lz>abc')).toThrow(/сохрани заново без сжатия/);
    expect(() => parseProject('{not json')).toThrow(NotAModel);
    expect(() => parseProject('[1, 2]')).toThrow(/не файл Blockbench/);
    expect(() => parseProject('{"elements": []}')).toThrow(/нет раздела meta/);
  });

  it('is refused when there is nothing in it to draw', async () => {
    await expect(prepare(bytesOf(modern({ elements: [] })))).rejects.toThrow(/ни одного куба или меша/);
  });

  it('is told apart from a skin project, which waits for the second version', async () => {
    const skin = modern({ meta: { format_version: '5.0', model_format: 'skin' }, elements: [] });
    await expect(prepare(bytesOf(skin))).rejects.toThrow(/Скины появятся во второй версии/);
  });
});

describe('the paths on the uploader’s disk', () => {
  it('come out of every place Blockbench writes them, and only those', () => {
    const project = modern({
      meta: { format_version: '5.0', model_format: 'free', save_path: '/home/anna/models/cart.bbmodel' },
      textures: [
        {
          name: 'cart.png',
          path: 'D:\\work\\client\\cart.png',
          relative_path: '../client/cart.png',
          source: pngOf(16, 16),
        },
      ],
      animations: [
        {
          name: 'roll',
          path: '',
          animators: {
            g1: {
              keyframes: [{ channel: 'sound', data_points: [{ effect: 'squeak', file: '/Users/anna/sfx/squeak.ogg' }] }],
            },
          },
        },
      ],
      // Not a path key, but a path by its look: somebody's notes kept in the file.
      description: '\\\\fileserver\\share\\cart',
    });
    const stripped = stripPaths(project);
    expect(stripped).toBe(5);
    expect(project.meta.save_path).toBe('');
    expect(project.textures[0].path).toBe('');
    expect(project.textures[0].relative_path).toBe('');
    expect(project.animations[0].animators.g1.keyframes[0].data_points[0].file).toBe('');
    expect(project.description).toBe('');
    // What draws the model is left alone.
    expect(project.textures[0].source.startsWith('data:image/png')).toBe(true);
    expect(project.textures[0].name).toBe('cart.png');
  });

  it('leave a file that has none byte for byte as it was', async () => {
    const clean = modern();
    clean.textures[0].path = '';
    const original = bytesOf(clean);
    const ready = await prepare(original);
    expect(ready.stripped).toBe(0);
    expect(ready.bytes).toBe(original);
    expect(ready.sha256).toBe(await sha256Hex(original));
  });

  it('are gone from what goes up, and the hash is of what goes up', async () => {
    const ready = await prepare(bytesOf(modern()));
    expect(ready.stripped).toBe(1);
    const text = new TextDecoder().decode(ready.bytes);
    expect(text).not.toContain('Anna');
    expect(ready.sha256).toBe(await sha256Hex(ready.bytes));
  });
});

describe('what a model is, counted', () => {
  it('reads the 5.0 layout', () => {
    const facts = factsOf(modern());
    expect(facts).toMatchObject({
      format: 'bedrock',
      version: '5.0',
      cubes: 2,
      meshes: 0,
      bones: 1,
      textures: 1,
      embedded: 1,
      textureWidth: 64,
      textureHeight: 64,
      density: 4,
    });
  });

  it('reads whole groups inside the outliner, and the oldest files’ content', () => {
    const old = modern({
      meta: { format_version: '3.6', model_format: 'modded_entity' },
      groups: undefined,
      outliner: [
        { uuid: 'g1', name: 'body', children: ['c1', { uuid: 'g2', name: 'head', children: ['c2'] }] },
        { uuid: 'g3', name: 'tail', content: [{ uuid: 'g4', name: 'tip', content: [] }] },
      ],
    });
    expect(factsOf(old).bones).toBe(4);
  });

  it('counts a group saved without an id, as Blockbench gives it one', () => {
    const handMade = modern({
      meta: { format_version: '4.0', model_format: 'free' },
      groups: undefined,
      outliner: [
        { name: 'bone', children: [{ name: 'arm', children: ['c1'] }, { name: 'leg', children: ['c2'] }] },
      ],
    });
    expect(factsOf(handMade).bones).toBe(3);
  });

  it('does not count a cube’s id in the outliner as a group', () => {
    const flat = modern({ groups: [], outliner: ['c1', 'c2'] });
    expect(factsOf(flat).bones).toBe(0);
  });

  it('fills in the format the way Blockbench does for files without one', () => {
    expect(formatOf({ meta: {} })).toBe('java_block');
    expect(formatOf({ meta: { bone_rig: true } })).toBe('bedrock_old');
    expect(formatOf({ meta: { model_format: 'geckolib_model' } })).toBe('geckolib_model');
  });

  it('measures density against each texture’s own UV size where the format has one', () => {
    // A free model lays each texture out against its own size: a 256 pixel texture
    // on a 64 unit layout is four pixels to the unit, not sixteen.
    const free = modern({
      meta: { format_version: '5.0', model_format: 'free' },
      resolution: { width: 16, height: 16 },
      textures: [
        { name: 'small', source: pngOf(16, 16), uv_width: 16, uv_height: 16 },
        { name: 'large', source: pngOf(256, 256), uv_width: 64, uv_height: 64 },
      ],
    });
    expect(factsOf(free)).toMatchObject({ textureWidth: 256, density: 4 });
    // A format with one UV size for everything measures every texture against it.
    const bedrock = { ...free, meta: { format_version: '5.0', model_format: 'bedrock' } };
    expect(factsOf(bedrock).density).toBe(16);
  });

  it('takes the size written down over the picture, and the picture when there is none', () => {
    expect(pixelSizeOf({ width: 32, height: 16, source: pngOf(64, 64) })).toEqual([32, 16]);
    expect(pixelSizeOf({ source: pngOf(128, 64) })).toEqual([128, 64]);
    expect(pixelSizeOf({ source: 'data:image/jpeg;base64,AAAA' })).toBeNull();
    expect(pixelSizeOf({ path: 'texture.png' })).toBeNull();
  });

  it('agrees with itself, which is what every page that opens a model checks', () => {
    const a = factsOf(modern());
    const b = factsOf(JSON.parse(JSON.stringify(modern())));
    expect(sameFacts(a, b)).toBe(true);
    expect(sameFacts(a, { ...a, bones: a.bones + 1 })).toBe(false);
  });
});

describe('what the uploader hears before it goes up', () => {
  it('names textures left on the disk, and files from a newer Blockbench', () => {
    const facts = factsOf(
      modern({
        meta: { format_version: '5.1', model_format: 'bedrock' },
        textures: [{ name: 'a', source: pngOf(16, 16) }, { name: 'b', path: 'b.png' }, { name: 'c', path: 'c.png' }],
      }),
    );
    expect(warningsOf(facts)).toEqual([{ kind: 'not-embedded', count: 2 }, { kind: 'newer' }]);
    expect(warningsOf(factsOf(modern()))).toEqual([]);
  });

  it('compares versions as Blockbench does, number by number', () => {
    expect(olderThan('4.10', '5.0')).toBe(true);
    expect(olderThan('5.0', '4.10')).toBe(false);
    expect(olderThan('4.9', '4.10')).toBe(true);
    expect(olderThan('5', '5.0')).toBe(false);
  });
});

describe('the two fingerprints', () => {
  it('do not change when a model is opened and saved again', async () => {
    const first = modern();
    const again = modern({
      // Renamed, new ids, cubes in the other order: nothing anybody sees.
      elements: [
        cube('x2', { name: 'right', from: [4, 0, 0], to: [8, 4, 4] }),
        cube('x1', { name: 'left', color: 3 }),
      ],
      outliner: [{ uuid: 'g9', isOpen: false, children: ['x2', 'x1'] }],
    });
    expect(await printsOf(again)).toEqual(await printsOf(first));
  });

  it('tell a repaint by its paint and keep its shape', async () => {
    const first = await printsOf(modern());
    const repainted = modern();
    repainted.textures[0].source = pngOf(64, 32);
    const second = await printsOf(repainted);
    expect(second.shape).toBe(first.shape);
    expect(second.print).not.toBe(first.print);
  });

  it('tell a moved cube by its shape', async () => {
    const moved = modern();
    moved.elements[0].from = [0, 1, 0];
    const first = await printsOf(modern());
    const second = await printsOf(moved);
    expect(second.shape).not.toBe(first.shape);
    expect(second.print).not.toBe(first.print);
  });
});
