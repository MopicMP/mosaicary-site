import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { Project } from '../shared/bbmodel.js';
import { motionOf, timeIn, type Clip } from '../src/lib/bbanim.js';
import { buildFigure, type Figure } from '../src/lib/bbmodel3d.js';

/**
 * That a model stands and moves as it does in Blockbench.
 *
 * Only models without textures here: a picture needs a browser to decode it, and
 * what is checked does not depend on one. Where the shape is, which bone a cube
 * hangs from, what colour a bare cube is, and where a bone is at a given moment of a
 * clip are all worked out before anything is drawn.
 */

const deg = THREE.MathUtils.degToRad;

function project(over: Project = {}): Project {
  return {
    meta: { format_version: '5.0', model_format: 'bedrock' },
    resolution: { width: 16, height: 16 },
    elements: [{ uuid: 'c1', from: [0, 0, 0], to: [2, 2, 2], origin: [0, 0, 0], color: 0 }],
    groups: [{ uuid: 'g1', name: 'arm', origin: [0, 0, 0] }],
    outliner: [{ uuid: 'g1', children: ['c1'] }],
    textures: [],
    animations: [],
    ...over,
  };
}

/** The colour a bare cube is drawn in, as the shader is handed it. */
function shadesOf(figure: Figure): string[] {
  const out: string[] = [];
  figure.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const base = (object.material as THREE.ShaderMaterial).uniforms.base?.value as THREE.Vector3;
    out.push([base.x, base.y, base.z].map((c) => Math.round(c * 255)).join(','));
  });
  return out;
}

describe('groups saved without ids', () => {
  it('are bones, and each keeps its own cubes', async () => {
    // Two groups apart from each other, their cubes painted alike. They used to end up
    // sharing one mesh, hung from whichever group came first.
    const figure = await buildFigure(
      project({
        meta: { format_version: '4.0', model_format: 'bedrock' },
        elements: [
          { uuid: 'c1', from: [4, 0, 0], to: [6, 2, 2], origin: [0, 0, 0], color: 0 },
          { uuid: 'c2', from: [-6, 0, 0], to: [-4, 2, 2], origin: [0, 0, 0], color: 0 },
        ],
        groups: undefined,
        outliner: [
          { name: 'arm', origin: [4, 0, 0], children: ['c1'] },
          { name: 'leg', origin: [-4, 0, 0], children: ['c2'] },
        ],
      }),
    );
    expect(figure.bones.size).toBe(2);
    for (const bone of figure.bones.values()) {
      expect(bone.object.children.filter((one) => one instanceof THREE.Mesh)).toHaveLength(1);
    }
    expect(figure.box.min.x).toBeCloseTo(-6);
    expect(figure.box.max.x).toBeCloseTo(6);
    figure.dispose();
  });
});

describe('a cube with no colour of its own', () => {
  it('is drawn in the colour it names, when it names one', async () => {
    const figure = await buildFigure(
      project({ elements: [{ uuid: 'c1', from: [0, 0, 0], to: [1, 1, 1], color: 3 }] }),
    );
    // Blockbench's red marker, in the paler shade the site draws markers in.
    expect(shadesOf(figure)).toEqual(['255,167,164']);
    figure.dispose();
  });

  it('gets the same colour every time it is drawn, and not all cubes the same one', async () => {
    const bare = project({
      elements: Array.from({ length: 12 }, (_, i) => ({ uuid: `cube-${i}`, from: [i, 0, 0], to: [i + 1, 1, 1] })),
      outliner: [{ uuid: 'g1', children: Array.from({ length: 12 }, (_, i) => `cube-${i}`) }],
    });
    const first = await buildFigure(bare);
    const again = await buildFigure(JSON.parse(JSON.stringify(bare)));
    expect(shadesOf(again).sort()).toEqual(shadesOf(first).sort());
    expect(new Set(shadesOf(first)).size).toBeGreaterThan(1);
    first.dispose();
    again.dispose();
  });
});

describe('a part the file says it does not export', () => {
  /** Two cubes marked off: one by itself, one by the group it hangs from. */
  const rig = (over: Project = {}): Project =>
    project({
      elements: [
        { uuid: 'c1', from: [0, 0, 0], to: [2, 2, 2], color: 0 },
        { uuid: 'c2', from: [8, 0, 0], to: [10, 2, 2], color: 0, export: false },
        { uuid: 'c3', from: [0, 8, 0], to: [2, 10, 2], color: 0 },
      ],
      groups: [
        { uuid: 'g1', name: 'arm', origin: [0, 0, 0] },
        { uuid: 'g2', name: 'mannequin', origin: [0, 0, 0], export: false },
      ],
      outliner: [
        { uuid: 'g1', children: ['c1', 'c2'] },
        { uuid: 'g2', children: ['c3'] },
      ],
      ...over,
    });

  it('is not drawn, and a group marked that way takes its cubes with it', async () => {
    const figure = await buildFigure(rig());
    expect(figure.box.min.toArray()).toEqual([0, 0, 0]);
    expect(figure.box.max.toArray()).toEqual([2, 2, 2]);
    figure.dispose();
  });

  it('is drawn after all when the file exports nothing at all', async () => {
    const figure = await buildFigure(
      rig({
        elements: [{ uuid: 'c2', from: [8, 0, 0], to: [10, 2, 2], color: 0, export: false }],
        outliner: [{ uuid: 'g1', children: ['c2'] }],
      }),
    );
    expect(figure.box.max.toArray()).toEqual([10, 2, 2]);
    figure.dispose();
  });
});

describe('a single-texture format saved with two textures', () => {
  /**
   * Which texture was chosen, read off the side the material draws.
   *
   * A texture with no pixels in it cannot be told from another by its picture, and
   * decoding one needs a browser; `render_sides` is a field of the texture itself, so
   * giving the two different ones makes the choice visible without drawing anything.
   */
  const sidesOf = (figure: Figure): THREE.Side[] => {
    const out: THREE.Side[] = [];
    figure.root.traverse((object) => {
      if (object instanceof THREE.Mesh) out.push((object.material as THREE.Material).side);
    });
    return out;
  };

  const twice = (names: number): Project =>
    project({
      textures: [
        { uuid: 't0', name: 'acacia.png', render_sides: 'double' },
        { uuid: 't1', name: 'acacia.png', render_sides: 'front' },
      ],
      elements: [
        {
          uuid: 'c1',
          from: [0, 0, 0],
          to: [2, 2, 2],
          color: 0,
          faces: Object.fromEntries(
            ['north', 'east', 'south', 'west', 'up', 'down'].map((face) => [face, { uv: [0, 0, 2, 2], texture: names }]),
          ),
        },
      ],
      outliner: [{ uuid: 'g1', children: ['c1'] }],
    });

  it('paints with the one the faces name, not the first in the list', async () => {
    const figure = await buildFigure(twice(1));
    expect(sidesOf(figure)).toEqual([THREE.FrontSide]);
    figure.dispose();
  });

  it('paints with the first when that is the one the faces name', async () => {
    const figure = await buildFigure(twice(0));
    expect(sidesOf(figure)).toEqual([THREE.DoubleSide]);
    figure.dispose();
  });
});

/** One clip on the arm, its rotation keys given. */
function swinging(keyframes: Project[], over: Project = {}): Project {
  return project({
    animations: [
      {
        uuid: 'a1',
        name: 'swing',
        loop: 'loop',
        length: 2,
        animators: { g1: { name: 'arm', type: 'bone', keyframes } },
      },
    ],
    ...over,
  });
}

function key(channel: string, time: number, x: number | string, over: Project = {}): Project {
  return { channel, time, data_points: [{ x, y: 0, z: 0 }], interpolation: 'linear', ...over };
}

async function poseAt(file: Project, seconds: number) {
  const figure = await buildFigure(file);
  const motion = motionOf(file, figure);
  const clip = motion.clips[0]!;
  motion.pose(clip, seconds);
  const arm = figure.bones.get('g1') ?? [...figure.bones.values()][0]!;
  return { arm: arm.object, clip, figure };
}

describe('a clip', () => {
  it('goes in a straight line between linear keys', async () => {
    const { arm } = await poseAt(swinging([key('rotation', 0, 0), key('rotation', 2, 90)]), 1);
    expect(arm.rotation.x).toBeCloseTo(deg(45));
  });

  it('stays on a step key until the next one', async () => {
    const file = swinging([key('position', 0, 0, { interpolation: 'step' }), key('position', 1, 5)]);
    expect((await poseAt(file, 0.5)).arm.position.x).toBeCloseTo(0);
    expect((await poseAt(file, 1.5)).arm.position.x).toBeCloseTo(5);
  });

  it('reads a key written as Molang, in degrees as Blockbench reads it', async () => {
    const { arm } = await poseAt(swinging([key('rotation', 0, 'math.sin(q.anim_time * 90) * 10')]), 1);
    expect(arm.rotation.x).toBeCloseTo(deg(10));
  });

  it('turns a file from before 5.0 round the way it was drawn then', async () => {
    const old = swinging([key('rotation', 0, 0), key('rotation', 2, 90)], {
      meta: { format_version: '4.10', model_format: 'bedrock' },
    });
    const { arm } = await poseAt(old, 1);
    expect(arm.rotation.x).toBeCloseTo(deg(-45));
  });

  it('finds its bone by name when the id has changed underneath it', async () => {
    const file = swinging([]);
    file.animations[0].animators = {
      'an-id-from-before': { name: 'arm', type: 'bone', keyframes: [key('rotation', 0, 30)] },
    };
    const { arm } = await poseAt(file, 0);
    expect(arm.rotation.x).toBeCloseTo(deg(30));
  });

  it('starts from rest each time it is posed', async () => {
    const file = swinging([key('rotation', 0, 0), key('rotation', 2, 90)]);
    const figure = await buildFigure(file);
    const motion = motionOf(file, figure);
    motion.pose(motion.clips[0]!, 2);
    motion.pose(motion.clips[0]!, 1);
    expect(figure.bones.get('g1')!.object.rotation.x).toBeCloseTo(deg(45));
    figure.dispose();
  });
});

describe('where a viewer is in a clip', () => {
  const clip = (loop: Clip['loop']): Clip => ({ name: 'x', length: 2, loop, tracks: [] });

  it('goes round a looping clip', () => {
    expect(timeIn(clip('loop'), 5)).toBeCloseTo(1);
  });

  it('holds the end of one that plays once for a second, then starts again', () => {
    expect(timeIn(clip('once'), 1.5)).toBeCloseTo(1.5);
    expect(timeIn(clip('once'), 2.5)).toBeCloseTo(2);
    expect(timeIn(clip('hold'), 3.5)).toBeCloseTo(0.5);
  });

  it('is at the start of a clip with no length', () => {
    expect(timeIn({ ...clip('loop'), length: 0 }, 3)).toBe(0);
  });
});
