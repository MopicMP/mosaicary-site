import * as THREE from 'three';

import {
  elementsOf,
  formatOf,
  isEmbedded,
  olderThan,
  pixelSizeOf,
  texturesOf,
  traitsOf,
  uvSizeOf,
  versionOf,
  type Project,
  type Traits,
} from '../../shared/bbmodel.js';

/**
 * A Blockbench project as something three.js can draw, drawn the way Blockbench draws
 * it.
 *
 * <h2>Why the rules are copied rather than worked out</h2>
 *
 * Because "what the file means" and "what Blockbench shows" are not the same thing,
 * and the second is what the author looked at while making it. Box UV is laid out
 * again from the cube's size rather than read from the faces; a face with no texture
 * of its own takes the default one in some formats and a marker colour in others; a
 * quad is split along whichever diagonal keeps it from folding. Every one of these is
 * taken from Blockbench's own preview code (`cube.js`, `mesh.js`, `face.ts`,
 * `textures.js`, `outliner.js` and the texture shader), so that a model looks here as
 * it did on its author's screen and not merely as a reasonable reading of the JSON.
 *
 * <h2>Why cubes are merged</h2>
 *
 * Blockbench keeps one object per cube, with a material per face. A model of five
 * thousand cubes is thirty thousand draws a frame that way, which an editor can afford
 * and a page with a dozen of them open cannot. Animations move bones and never single
 * cubes, so everything hanging from the same bone and painted with the same picture
 * is baked into one buffer in that bone's own space — the same triangles in the same
 * places, a few dozen draws for the whole model.
 *
 * <h2>Where it does not copy Blockbench</h2>
 *
 * Twice, and both times because the editor has something this page does not: the
 * author, sitting in front of it. The editor draws a part marked as not exported and
 * paints a single-texture format with whichever texture is selected in its list.
 * Here a part that is not exported is not drawn, and the texture is the one the faces
 * name. Each is written down where it happens.
 *
 * <h2>What is left out</h2>
 *
 * Smooth shading on meshes (drawn flat), layered and emissive textures (drawn as
 * plain ones), and frames of an animated texture after the first. None of them
 * changes what a model is; each would cost more here than it shows.
 */

/** Where a bone stands before any animation moves it. */
export interface Rest {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export interface Bone {
  uuid: string;
  name: string;
  object: THREE.Object3D;
  rest: Rest;
}

export interface Figure {
  /** The whole model, in Blockbench's own units: sixteen to a block. */
  root: THREE.Group;
  /** Every group that is a bone, by its id. Empty for formats without bones. */
  bones: Map<string, Bone>;
  /** Around everything, standing at rest. Empty when nothing is drawn. */
  box: THREE.Box3;
  /** Puts every bone back where the file has it. */
  rest(): void;
  dispose(): void;
}

/** One texture of the project, with what drawing it needs. */
interface Sheet {
  data: Project;
  map: THREE.Texture | null;
  /** How many frames of an animated texture are stacked in the picture. */
  frames: number;
  side: THREE.Side;
}

/** One group of the outliner, placed. */
interface Node {
  /** The group's own id, or the one made up for a group saved without any. */
  uuid: string;
  data: Project;
  origin: THREE.Vector3;
  parent: Node | null;
  object: THREE.Group;
}

/** Everything hanging from one bone and painted with one material. */
interface Bucket {
  into: THREE.Object3D;
  material: THREE.Material;
  positions: number[];
  normals: number[];
  uvs: number[];
}

/** Blockbench's order of the six faces, which the shapes below follow. */
const FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north'] as const;
type Direction = (typeof FACE_ORDER)[number];

/**
 * The corners of each face, as they sit in three.js's box: 0 is the cube's `from` on
 * that axis, 1 its `to`.
 *
 * The UVs are written against this order, so it has to be this one and not any other
 * order of the same four points.
 */
const CORNERS: Record<Direction, number[][]> = {
  east: [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0]],
  west: [[0, 1, 0], [0, 1, 1], [0, 0, 0], [0, 0, 1]],
  up: [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]],
  down: [[0, 0, 1], [1, 0, 1], [0, 0, 0], [1, 0, 0]],
  south: [[0, 1, 1], [1, 1, 1], [0, 0, 1], [1, 0, 1]],
  north: [[1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]],
};

const NORMALS: Record<Direction, [number, number, number]> = {
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
  south: [0, 0, 1],
  north: [0, 0, -1],
};

/** Two triangles of a face, in the corners above. */
const QUAD = [0, 2, 1, 2, 3, 1];

/**
 * Pale colours for a face with nothing to paint it with, picked by the cube's own
 * colour number — the way Blockbench marks such a face rather than leaving a hole.
 */
const MARKERS = [
  [0xa2, 0xeb, 0xff],
  [0xff, 0xf8, 0x99],
  [0xe8, 0xbd, 0x7b],
  [0xff, 0xa7, 0xa4],
  [0xc5, 0xa6, 0xe8],
  [0xa6, 0xc8, 0xff],
  [0x7b, 0xff, 0xa3],
  [0xbd, 0xff, 0xa6],
  [0xff, 0xa5, 0xd5],
  [0xe0, 0xe9, 0xfb],
];

/**
 * Blockbench's texture shader, without the parts that are about editing.
 *
 * Its light is not a light: it is a fixed tint by which way a face points, brightest
 * on top, darkest underneath, the sides in between and east and west a little darker
 * than north and south. That is what makes a cube read as a cube with no lamp
 * anywhere, and it is why the colours come out as the author saw them.
 */
const VERTEX = /* glsl */ `
varying vec2 vUv;
varying float light;

void main() {
  vec3 N = normalize(vec3(modelMatrix * vec4(normal, 0.0)));
  float yLight = (1.0 + N.y) * 0.5;
  light = yLight * 0.5 + N.x * N.x * -0.15 + N.z * N.z * 0.05 + 0.5;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The picture's own values, multiplied by the light and written out as they are.
 *
 * No colour space on either end, on purpose: Blockbench shades the stored pixel and
 * not a linearised one, and doing it "properly" here would brighten every side face.
 */
const PAINTED = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float light;

void main() {
  vec4 color = texture2D(map, vUv);
  if (color.a < 0.01) discard;
  gl_FragColor = vec4(color.rgb * light, color.a);
}
`;

const MARKED = /* glsl */ `
uniform vec3 base;
varying float light;

void main() {
  gl_FragColor = vec4(base * light, 1.0);
}
`;

const rad = THREE.MathUtils.degToRad;

function num(value: unknown, otherwise = 0): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : otherwise;
}

function triple(value: unknown, otherwise = 0): [number, number, number] {
  const list = Array.isArray(value) ? value : [];
  return [num(list[0], otherwise), num(list[1], otherwise), num(list[2], otherwise)];
}

async function pictureOf(texture: Project): Promise<HTMLImageElement | null> {
  if (!isEmbedded(texture)) return null;
  const image = new Image();
  image.src = texture.source as string;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

/** Frames stacked in a picture, by the comparison Blockbench makes. */
function framesOf(size: [number, number] | null, uv: [number, number], traits: Traits): number {
  if (!traits.animatedTextures || !size || !size[1] || !uv[1]) return 1;
  const ratio = size[0] / size[1];
  if (ratio === uv[0] / uv[1]) return 1;
  const frames = Math.ceil(uv[0] / uv[1] / ratio - 0.05);
  return frames > 1 ? frames : 1;
}

function sideOf(texture: Project | null, traits: Traits): THREE.Side {
  if (texture?.render_sides === 'front') return THREE.FrontSide;
  if (texture?.render_sides === 'double') return THREE.DoubleSide;
  return traits.frontOnly ? THREE.FrontSide : THREE.DoubleSide;
}

/**
 * Whether `check` lies on the far side of the line through `base1` and `base2` from
 * `top` — Blockbench's test for which way round a quad's corners go.
 */
function across(base1: THREE.Vector3, base2: THREE.Vector3, top: THREE.Vector3, check: THREE.Vector3): boolean {
  const normal = new THREE.Line3(base1, base2).closestPointToPoint(top, false, new THREE.Vector3());
  normal.sub(top);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, base2).distanceToPoint(check) > 0;
}

/**
 * A quad's corners in the order that splits it into two triangles without folding.
 *
 * The file keeps them in whatever order they were made in, which for a quad dragged
 * out of shape is often a bow tie; this is the order Blockbench draws them in.
 */
function sorted<K>(keys: K[], at: (key: K) => THREE.Vector3): K[] {
  if (keys.length < 4) return keys;
  const [a, b, c, d] = keys as [K, K, K, K];
  if (across(at(b), at(c), at(a), at(d))) return [c, a, b, d];
  if (across(at(a), at(b), at(c), at(d))) return [a, c, b, d];
  return keys;
}

export async function buildFigure(project: Project): Promise<Figure> {
  const traits = traitsOf(formatOf(project));
  const version = versionOf(project);
  const textures = texturesOf(project);
  const pictures = await Promise.all(textures.map(pictureOf));

  const sheets: Sheet[] = textures.map((data, at) => {
    const picture = pictures[at] ?? null;
    let map: THREE.Texture | null = null;
    if (picture) {
      map = new THREE.Texture(picture);
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.generateMipmaps = false;
      map.needsUpdate = true;
    }
    const size: [number, number] | null = picture
      ? [picture.naturalWidth, picture.naturalHeight]
      : pixelSizeOf(data);
    return {
      data,
      map,
      frames: framesOf(size, uvSizeOf(project, data, traits), traits),
      side: sideOf(data, traits),
    };
  });

  const byUuid = new Map<string, Sheet>();
  sheets.forEach((sheet) => {
    if (sheet.data.uuid) byUuid.set(String(sheet.data.uuid), sheet);
  });
  const sheetFrom = (value: unknown): Sheet | undefined =>
    typeof value === 'number' ? sheets[value] : typeof value === 'string' ? byUuid.get(value) : undefined;

  const root = new THREE.Group();
  const bones = new Map<string, Bone>();

  // The groups, from the outliner. Newer files keep each group's fields in a list of
  // their own and only ids in the tree; older ones keep the whole group in the tree,
  // and the oldest call its children `content`.
  const groupFields = new Map<string, Project>();
  if (Array.isArray(project.groups)) {
    for (const group of project.groups) if (group?.uuid) groupFields.set(String(group.uuid), group);
  }
  const groupOf = new Map<string, Node | null>();
  const nodes = new Map<string, Node>();
  /** Whether the groups an element hangs from are all exported. */
  const underExport = new Map<string, boolean>();
  const oldZ = olderThan(version, '3.2');

  let unnamed = 0;
  const walk = (list: unknown, parent: Node | null, exported: boolean) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (typeof item === 'string') {
        if (!groupOf.has(item)) {
          groupOf.set(item, parent);
          underExport.set(item, exported);
        }
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      // A group written without an id is still a group: Blockbench gives it one when
      // the file opens, and its cubes hang from it by their place in the tree. The id
      // made up here cannot be one an animation names, and neither can Blockbench's.
      const uuid = item.uuid ? String(item.uuid) : `#${++unnamed}`;
      // A tree that names the same group twice is a broken file; reading it once is
      // what keeps it from being a loop.
      if (nodes.has(uuid)) continue;
      const data: Project = { ...item, ...groupFields.get(uuid) };
      const origin = new THREE.Vector3(...triple(data.origin));
      const object = new THREE.Group();
      object.name = String(data.name ?? '');
      const node: Node = { uuid, data, origin, parent, object };
      nodes.set(uuid, node);

      if (traits.boneRig) {
        const [x, y, z] = triple(data.rotation);
        object.position.copy(origin);
        if (parent) object.position.sub(parent.origin);
        // Files before 3.2 kept a group's turn about Z the other way round.
        object.rotation.set(rad(x), rad(y), rad(oldZ ? -z : z), 'ZYX');
        if (Array.isArray(data.scale)) object.scale.set(...triple(data.scale, 1));
        object.visible = data.visibility !== false;
        (parent ? parent.object : root).add(object);
        bones.set(uuid, {
          uuid,
          name: object.name,
          object,
          rest: {
            position: object.position.clone(),
            rotation: object.rotation.clone(),
            scale: object.scale.clone(),
          },
        });
      }
      walk(item.children ?? item.content, node, exported && data.export !== false);
    }
  };
  walk(project.outliner, null, true);

  /**
   * The elements this draws: everything visible the file says is part of the model.
   *
   * `export: false` is a cube's or a group's own "not part of the output". Blockbench
   * still draws such a part, because its author is looking at it on purpose; every
   * exporter leaves it out. It matters here because the rigs for armour and for
   * display settings come with a mannequin of the player marked that way: drawn, it is
   * a figure sixteen by thirty-two with the real model somewhere inside it, and the
   * camera frames the mannequin.
   *
   * A file where nothing is exported is drawn whole. That is a file somebody is part
   * way through, and a model is better than an empty card.
   */
  const visible = elementsOf(project).filter((element) => element.visibility !== false);
  const exported = visible.filter(
    (element) => element.export !== false && underExport.get(String(element.uuid ?? '')) !== false,
  );
  const drawn = exported.length ? exported : visible;

  /**
   * The one texture a single-texture format paints everything with.
   *
   * Blockbench takes the texture marked as default, else the one selected in its own
   * list, else the first. Nothing is selected here — but the faces remember: in these
   * formats Blockbench stamps every new cube's faces with whatever was default then,
   * so the faces are the author's own answer, and the first texture is only taken when
   * they give none. A file with one texture cannot tell the difference; one saved with
   * two of the same name is exactly the case this decides.
   */
  const named = (): Sheet | undefined => {
    const votes = new Map<Sheet, number>();
    for (const element of drawn) {
      for (const face of Object.values<Project>(element.faces ?? {})) {
        const sheet = sheetFrom(face?.texture);
        if (sheet) votes.set(sheet, (votes.get(sheet) ?? 0) + 1);
      }
    }
    let best: Sheet | undefined;
    let most = 0;
    for (const sheet of sheets) {
      const count = votes.get(sheet) ?? 0;
      if (count > most) {
        best = sheet;
        most = count;
      }
    }
    return best;
  };
  const fallback: Sheet | undefined =
    (traits.singleTextureDefault ? sheets.find((sheet) => sheet.data.use_as_default) : undefined) ??
    (sheets.length > 1 ? named() : undefined) ??
    sheets[0];

  /**
   * The texture a face shows: `null` for a face hidden on purpose, `undefined` for one
   * with nothing to show.
   *
   * In the file a face names its texture by its place in the list, so 0 is the first
   * texture and not "none"; "none" is the field missing, and hidden is `null`.
   */
  const textureOf = (face: Project, parent: Node | null): Sheet | null | undefined => {
    if (traits.perGroupTexture && parent?.data.texture != null) {
      const own = sheetFrom(parent.data.texture);
      if (own) return own;
    }
    const own = sheetFrom(face.texture);
    if (
      face.texture !== null &&
      (traits.singleTexture || (traits.singleTextureDefault && (traits.perGroupTexture || !own)))
    ) {
      return fallback;
    }
    if (face.texture === null) return null;
    return own;
  };

  const materials = new Map<string, THREE.Material>();
  const paintFor = (sheet: Sheet | null | undefined, color: unknown): [string, THREE.Material] => {
    if (sheet?.map) {
      const at = sheets.indexOf(sheet);
      const key = `t${at}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.ShaderMaterial({
          uniforms: { map: { value: sheet.map } },
          vertexShader: VERTEX,
          fragmentShader: PAINTED,
          side: sheet.side,
          transparent: true,
        });
        materials.set(key, material);
      }
      return [key, material];
    }
    const shade = MARKERS[((Math.trunc(num(color)) % MARKERS.length) + MARKERS.length) % MARKERS.length]!;
    const key = `m${shade.join(',')}`;
    let material = materials.get(key);
    if (!material) {
      material = new THREE.ShaderMaterial({
        uniforms: { base: { value: new THREE.Vector3(shade[0]! / 255, shade[1]! / 255, shade[2]! / 255) } },
        vertexShader: VERTEX,
        fragmentShader: MARKED,
        side: sheet?.side ?? (traits.frontOnly ? THREE.FrontSide : THREE.DoubleSide),
      });
      materials.set(key, material);
    }
    return [key, material];
  };

  /**
   * The colour number of an element. A file that does not say gets one picked for it,
   * as in Blockbench, which draws a new one at random each time the file is opened.
   * Here it comes from the element's id instead, so that its card and its window
   * agree, and agree tomorrow.
   */
  const colorOf = (element: Project): unknown => {
    if (element.color !== undefined) return element.color;
    const key = String(element.uuid ?? `${element.name}${element.from}${element.to}`);
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
    return (hash >>> 0) % MARKERS.length;
  };

  const buckets = new Map<string, Bucket>();
  const bucketFor = (parent: Node | null, sheet: Sheet | null | undefined, color: unknown): Bucket => {
    const bone = traits.boneRig && parent ? parent : null;
    const [paint, material] = paintFor(sheet, color);
    const key = `${bone ? bone.uuid : ''}|${paint}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { into: bone ? bone.object : root, material, positions: [], normals: [], uvs: [] };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  /** Where an element sits in the space of whatever it hangs from. */
  const placing = (element: Project, parent: Node | null, scale?: THREE.Vector3): THREE.Matrix4 => {
    const position = new THREE.Vector3(...triple(element.origin));
    if (traits.boneRig && parent) position.sub(parent.origin);
    const [x, y, z] = triple(element.rotation);
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), 'ZYX'));
    return new THREE.Matrix4().compose(position, turn, scale ?? new THREE.Vector3(1, 1, 1));
  };

  const point = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const put = (
    bucket: Bucket,
    matrix: THREE.Matrix4,
    turn: THREE.Matrix3,
    corner: THREE.Vector3,
    normal: THREE.Vector3,
    u: number,
    v: number,
  ) => {
    point.copy(corner).applyMatrix4(matrix);
    facing.copy(normal).applyMatrix3(turn).normalize();
    bucket.positions.push(point.x, point.y, point.z);
    bucket.normals.push(facing.x, facing.y, facing.z);
    bucket.uvs.push(u, v);
  };

  const addCube = (element: Project, parent: Node | null) => {
    const from = triple(element.from);
    const to = triple(element.to);
    const origin = triple(element.origin);
    const inflate = num(element.inflate);
    const stretch = triple(element.stretch, 1);
    const low: number[] = [];
    const high: number[] = [];
    for (let i = 0; i < 3; i++) {
      const half = (to[i]! - from[i]!) / 2;
      const middle = from[i]! + half;
      low[i] = middle - (half + inflate) * stretch[i]! - origin[i]!;
      high[i] = middle + (half + inflate) * stretch[i]! - origin[i]!;
      if (low[i] === high[i]) high[i]! += 0.001;
    }

    let scale: THREE.Vector3 | undefined;
    if (traits.rotateCubes && element.rescale === true) {
      // Blockbench's "rescale": a cube turned by 22.5 degrees grows back the width the
      // turn took off it, the way the game's own block models do.
      const grow = triple(element.rotation).map((angle) => {
        let a = Math.abs(angle);
        if (a > 45) a = 90 - a;
        return 1 / Math.cos(rad(a));
      });
      scale = new THREE.Vector3(grow[1]! * grow[2]!, grow[0]! * grow[2]!, grow[0]! * grow[1]!);
    }
    const matrix = placing(element, parent, scale);
    const turn = new THREE.Matrix3().getNormalMatrix(matrix);

    const faces: Project = element.faces && typeof element.faces === 'object' ? element.faces : {};
    const uvs = {} as Record<Direction, number[]>;
    for (const direction of FACE_ORDER) {
      const uv = Array.isArray(faces[direction]?.uv) ? faces[direction].uv : [];
      uvs[direction] = [num(uv[0]), num(uv[1]), num(uv[2]), num(uv[3])];
    }

    const boxUv = element.box_uv ?? !!project.meta?.box_uv;
    if (boxUv) {
      // Laid out again from the size, as Blockbench does, rather than trusted from
      // the faces: older files did not always write them down.
      const size = [0, 1, 2].map((i) => {
        const length = to[i]! - from[i]!;
        return traits.boxUvFloat ? length : Math.floor(length + 0.0000001);
      }) as [number, number, number];
      const [w, h, d] = size;
      const layout: { face: Direction; from: number[]; size: number[] }[] = [
        { face: 'east', from: [0, d], size: [d, h] },
        { face: 'west', from: [d + w, d], size: [d, h] },
        { face: 'up', from: [d + w, d], size: [-w, -d] },
        { face: 'down', from: [d + w * 2, 0], size: [-w, d] },
        { face: 'south', from: [d * 2 + w, d], size: [w, h] },
        { face: 'north', from: [d, d], size: [w, h] },
      ];
      // Before 4.5 a mirrored cube was written as one with shading turned off.
      const mirror = element.mirror_uv === true || (olderThan(version, '4.5') && element.shade === false);
      if (mirror) {
        for (const one of layout) {
          one.from[0]! += one.size[0]!;
          one.size[0]! *= -1;
        }
        const east = layout[0]!;
        const west = layout[1]!;
        [east.from, west.from] = [west.from, east.from];
        [east.size, west.size] = [west.size, east.size];
      }
      const offset = Array.isArray(element.uv_offset) ? element.uv_offset : [];
      const [ou, ov] = [num(offset[0]), num(offset[1])];
      for (const one of layout) {
        if (faces[one.face]?.texture === null) continue;
        uvs[one.face] = [
          one.from[0]! + ou,
          one.from[1]! + ov,
          one.from[0]! + one.size[0]! + ou,
          one.from[1]! + one.size[1]! + ov,
        ];
      }
    }

    const corner = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const color = colorOf(element);
    for (const direction of FACE_ORDER) {
      const face: Project = faces[direction] ?? {};
      if (face.texture === null) continue;
      const sheet = textureOf(face, parent);
      const bucket = bucketFor(parent, sheet, color);
      const [pw, ph] = uvSizeOf(project, sheet?.data ?? null, traits);
      const frames = sheet?.frames ?? 1;

      const uv = uvs[direction].slice();
      if (boxUv) {
        // A sixty-fourth of a pixel in from every edge, so the next face over on the
        // texture does not bleed in along the seams.
        for (let i = 0; i < 2; i++) {
          const margin = uv[i]! > uv[i + 2]! ? -1 / 64 : 1 / 64;
          uv[i]! += margin;
          uv[i + 2]! -= margin;
        }
      }
      let at = [
        [uv[0]! / pw, 1 - uv[1]! / ph / frames],
        [uv[2]! / pw, 1 - uv[1]! / ph / frames],
        [uv[0]! / pw, 1 - uv[3]! / ph / frames],
        [uv[2]! / pw, 1 - uv[3]! / ph / frames],
      ];
      for (let rotation = num(face.rotation); rotation > 0; rotation -= 90) {
        at = [at[2]!, at[0]!, at[3]!, at[1]!];
      }

      normal.set(...NORMALS[direction]);
      for (const i of QUAD) {
        const pick = CORNERS[direction][i]!;
        corner.set(pick[0] ? high[0]! : low[0]!, pick[1] ? high[1]! : low[1]!, pick[2] ? high[2]! : low[2]!);
        put(bucket, matrix, turn, corner, normal, at[i]![0]!, at[i]![1]!);
      }
    }
  };

  const addMesh = (element: Project, parent: Node | null) => {
    const vertices: Project = element.vertices && typeof element.vertices === 'object' ? element.vertices : {};
    const matrix = placing(element, parent);
    const turn = new THREE.Matrix3().getNormalMatrix(matrix);
    const points = new Map<string, THREE.Vector3>();
    const at = (key: string) => points.get(key)!;
    for (const [key, value] of Object.entries(vertices)) {
      if (Array.isArray(value)) points.set(key, new THREE.Vector3(...triple(value)));
    }

    const normal = new THREE.Vector3();
    const side = new THREE.Vector3();
    const color = colorOf(element);
    for (const face of Object.values<Project>(element.faces ?? {})) {
      const keys: string[] = Array.isArray(face?.vertices) ? face.vertices.map(String) : [];
      if (keys.length < 3 || keys.length > 4 || !keys.every((key) => points.has(key))) continue;

      const shown = textureOf(face, parent);
      // A single-texture format paints the whole mesh with its one texture, whatever
      // each face says; the UVs still follow the face's own.
      const sheet = traits.singleTexture ? fallback : shown;
      const bucket = bucketFor(parent, sheet, color);
      const [uw, uh] = uvSizeOf(project, shown?.data ?? null, traits);
      const frames = shown?.frames ?? 1;

      const order = sorted(keys, at);
      normal.subVectors(at(order[1]!), at(order[0]!));
      side.subVectors(at(order[2]!), at(order[0]!));
      normal.cross(side).normalize();

      const corners: [number, number][] = [];
      let first: [number, number] | null = null;
      keys.forEach((key, i) => {
        const uv = Array.isArray(face.uv?.[key]) ? face.uv[key] : [0, 0];
        let u = num(uv[0]) / uw;
        let v = num(uv[1]) / uh / frames;
        // Blockbench's guard against a face whose UVs all sit on one point, which
        // otherwise samples as noise.
        if (!first) first = [u, v];
        else if (first[0] === u && first[1] === v) {
          if (i < 2) u += 0.00005;
          else v += 0.00005;
        }
        corners.push([u, 1 - v]);
      });

      const index = new Map(keys.map((key, i) => [key, i]));
      const triangles =
        keys.length === 3 ? [0, 1, 2] : [order[0]!, order[1]!, order[2]!, order[0]!, order[2]!, order[3]!].map((key) => index.get(key)!);
      for (const i of triangles) {
        put(bucket, matrix, turn, at(keys[i]!), normal, corners[i]![0], corners[i]![1]);
      }
    }
  };

  for (const element of drawn) {
    const parent = groupOf.get(String(element.uuid ?? '')) ?? null;
    const type = element.type ?? 'cube';
    if (type === 'cube') addCube(element, parent);
    else if (type === 'mesh') addMesh(element, parent);
  }

  for (const bucket of buckets.values()) {
    if (!bucket.positions.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs, 2));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    bucket.into.add(new THREE.Mesh(geometry, bucket.material));
  }

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);

  return {
    root,
    bones,
    box,
    rest() {
      for (const bone of bones.values()) {
        bone.object.position.copy(bone.rest.position);
        bone.object.rotation.copy(bone.rest.rotation);
        bone.object.scale.copy(bone.rest.scale);
      }
    },
    dispose() {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      for (const material of materials.values()) material.dispose();
      for (const sheet of sheets) sheet.map?.dispose();
    },
  };
}
