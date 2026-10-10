/**
 * Reading a Blockbench project file, the way Blockbench itself reads one.
 *
 * <h2>Why this runs in the browser and not on the server</h2>
 *
 * Because the server has ten milliseconds of processor per request and a twenty
 * megabyte project takes thirty to eighty to parse — measured, not guessed, on real
 * files from GitHub. So the page that uploads does all of it: it parses, strips the
 * paths, counts, fingerprints and hashes, and the server only checks what it was told
 * and streams the bytes into storage. Every page that later opens the model does the
 * counting again and says so when the numbers disagree, which is what keeps the
 * uploader's word honest without the server ever reading the file.
 *
 * <h2>What "the way Blockbench reads one" means</h2>
 *
 * The rules below are taken from Blockbench's own loader (`js/formats/bbmodel.js`,
 * format version 5.0) rather than from what files usually look like. Old files keep
 * their elements under `cubes`, put whole groups inside the outliner and name the
 * version `meta.format`; new ones keep groups in a list of their own and the outliner
 * as a tree of ids. Both are real and both are on GitHub in quantity.
 */

/** One project file, parsed. Kept loose: Blockbench writes more than it reads. */
export type Project = Record<string, any>;

/**
 * What a model is, counted.
 *
 * Every field is something the catalogue filters or sorts by, and every one is
 * recounted by whoever opens the model — so nothing here may depend on anything but
 * the file itself.
 */
export interface Facts {
  /** Blockbench's own id for the format, unchanged: `java_block`, `bedrock`, … */
  format: string;
  /** The project format version the file was written in, `5.0` and so on. */
  version: string;
  boxUv: boolean;
  cubes: number;
  meshes: number;
  /** Groups, which is what Minecraft calls bones. */
  bones: number;
  animations: number;
  textures: number;
  /** Textures that carry their pixels inside the file. */
  embedded: number;
  /** The widest texture, in pixels. 0 when there is none to measure. */
  textureWidth: number;
  textureHeight: number;
  /**
   * Texture pixels per unit of the model, at the densest texture.
   *
   * 1 is the game's own: a sixteen pixel block face on a sixteen unit block. 2 and
   * more is what people mean by HD. Counted per texture, because a free model can
   * mix a 16 pixel texture with a 256 pixel one and the second is the one anybody
   * would notice.
   */
  density: number;
}

/** Something about the file the uploader should hear before it goes up. */
export interface Warning {
  kind: 'not-embedded' | 'newer';
  count?: number;
}

/** A file that cannot go up at all, said in words for a person. */
export class NotAModel extends Error {}

/**
 * How each format behaves where it matters to reading and drawing it.
 *
 * Copied from the format definitions in Blockbench (`js/formats/*`), nine flags out
 * of their forty. Anything not listed is read the way Blockbench reads a format it
 * does not know, which is as `free`.
 */
export interface Traits {
  /** Groups are bones: they carry a pivot and rotation, and children move with them. */
  boneRig: boolean;
  /** Every face shows the one default texture, whatever its own field says. */
  singleTexture: boolean;
  /** Faces without a texture of their own fall back to the default one. */
  singleTextureDefault: boolean;
  /** Each texture has its own UV size rather than the project's. */
  perTextureUv: boolean;
  /** A group can carry a texture for everything inside it. */
  perGroupTexture: boolean;
  /** Faces draw on one side only. */
  frontOnly: boolean;
  /** A texture taller than its UV space is frames stacked one above another. */
  animatedTextures: boolean;
  /** Cubes can turn freely, and so can be told to grow back what turning takes off. */
  rotateCubes: boolean;
  /** Box UV is laid out at a cube's true size rather than rounded down to whole pixels. */
  boxUvFloat: boolean;
}

const BASE: Traits = {
  boneRig: false,
  singleTexture: false,
  singleTextureDefault: false,
  perTextureUv: false,
  perGroupTexture: false,
  frontOnly: false,
  animatedTextures: false,
  rotateCubes: false,
  boxUvFloat: false,
};

const TRAITS: Record<string, Partial<Traits>> = {
  free: { boneRig: true, perTextureUv: true, animatedTextures: true, rotateCubes: true },
  java_block: { frontOnly: true, animatedTextures: true, rotateCubes: true },
  bedrock: { boneRig: true, singleTexture: true, animatedTextures: true, rotateCubes: true },
  bedrock_block: {
    boneRig: true,
    singleTextureDefault: true,
    animatedTextures: true,
    rotateCubes: true,
  },
  bedrock_old: { boneRig: true, singleTexture: true, animatedTextures: true },
  modded_entity: { boneRig: true, singleTexture: true, rotateCubes: true, boxUvFloat: true },
  // GeckoLib's own format, from its plugin rather than from Blockbench: saved as
  // geckolib_model now, as animated_entity_model by its older versions.
  geckolib_model: { boneRig: true, singleTexture: true, rotateCubes: true },
  animated_entity_model: { boneRig: true, singleTexture: true, rotateCubes: true },
  optifine_entity: {
    boneRig: true,
    singleTextureDefault: true,
    perTextureUv: true,
    perGroupTexture: true,
  },
  optifine_part: {
    boneRig: true,
    singleTextureDefault: true,
    perTextureUv: true,
    perGroupTexture: true,
  },
  skin: { boneRig: true, singleTexture: true },
  image: { singleTexture: true, perTextureUv: true, animatedTextures: true },
};

export function traitsOf(format: string): Traits {
  return { ...BASE, ...(TRAITS[format] ?? TRAITS.free) };
}

/** The newest project format this was written against. Newer files still load. */
export const KNOWN_VERSION = '5.0';

/** The format id, filled in the way Blockbench fills it for files that lack one. */
export function formatOf(project: Project): string {
  const meta = project.meta ?? {};
  if (typeof meta.model_format === 'string' && meta.model_format) return meta.model_format;
  return meta.bone_rig ? 'bedrock_old' : 'java_block';
}

export function versionOf(project: Project): string {
  const meta = project.meta ?? {};
  return String(meta.format_version ?? meta.format ?? '1.0');
}

/** Whether version `a` is older than `b`, compared the way Blockbench compares them. */
export function olderThan(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] || 0;
    const q = y[i] || 0;
    if (p !== q) return p < q;
  }
  return false;
}

export function elementsOf(project: Project): Project[] {
  const list = project.elements ?? project.cubes;
  return Array.isArray(list) ? list.filter((one) => one && typeof one === 'object') : [];
}

export function texturesOf(project: Project): Project[] {
  return Array.isArray(project.textures)
    ? project.textures.filter((one: unknown) => one && typeof one === 'object')
    : [];
}

/**
 * Turns the bytes of a file into a project, or says why not.
 *
 * Every refusal here is one a person can act on, which is why each says what to do
 * rather than what went wrong inside.
 */
export function parseProject(text: string): Project {
  // Blockbench can save compressed, and does when asked to. Unpacking it here would
  // mean shipping its compressor to every visitor for the sake of a setting almost
  // nobody turns on.
  if (text.startsWith('<lz>')) {
    throw new NotAModel(
      'Файл сохранён сжатым. Открой его в Blockbench и сохрани заново без сжатия.',
    );
  }
  let project: unknown;
  try {
    project = JSON.parse(text);
  } catch {
    throw new NotAModel('Это не файл Blockbench: внутри не JSON.');
  }
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new NotAModel('Это не файл Blockbench.');
  }
  const meta = (project as Project).meta;
  if (!meta || typeof meta !== 'object') {
    throw new NotAModel('Это не файл Blockbench: нет раздела meta.');
  }
  return project as Project;
}

/**
 * The keys Blockbench uses for places on the author's own disk.
 *
 * Collected from the save code rather than from files: textures (`path`,
 * `relative_path`), animation and controller files (`path`), sound effects inside
 * keyframes (`file`), collections (`export_path`) and the editor's own memory of where
 * it last saved and exported (`save_path`, `export_path`).
 */
const PATH_KEYS = new Set(['path', 'relative_path', 'export_path', 'save_path', 'file']);

/**
 * Anything else that looks like an absolute path on somebody's machine.
 *
 * A drive letter, a network share, or a home directory on macOS and Linux. Anchored
 * at the start, so that a fifteen megabyte texture string is rejected in one step and
 * not read to its end.
 */
const LOCAL = /^(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|mnt|media|Volumes|private|tmp|var)\/|~\/)/;

/**
 * Takes every local path out of a project, in place, and says how many there were.
 *
 * A path is more than a filename. `C:\Users\Anna Petrova\Desktop\commission\` is a
 * name, and sometimes a client's name, and whoever uploads a model has no reason to
 * know their editor wrote it down. Emptied rather than deleted, so Blockbench reads
 * the file exactly as before and simply finds nothing on disk to reload.
 */
export function stripPaths(project: Project): number {
  let stripped = 0;
  const stack: unknown[] = [project];
  while (stack.length) {
    const here = stack.pop();
    if (!here || typeof here !== 'object') continue;
    const keys = Array.isArray(here) ? here.keys() : Object.keys(here);
    for (const key of keys as Iterable<string | number>) {
      const value = (here as any)[key];
      if (typeof value === 'string') {
        if (!value || value.startsWith('data:')) continue;
        if ((typeof key === 'string' && PATH_KEYS.has(key)) || LOCAL.test(value)) {
          (here as any)[key] = '';
          stripped++;
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return stripped;
}

/** Ids of every group, in whichever of the two places the file keeps them. */
function groupIds(project: Project): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(project.groups)) {
    for (const group of project.groups) if (group?.uuid) ids.add(String(group.uuid));
  }
  // Older files carry the groups whole inside the outliner, and the oldest under
  // `content` instead of `children`. Some of those were written by hand or by other
  // tools without ids; Blockbench gives each one its own, and so it is counted here.
  let unnamed = 0;
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (!(item as Project).uuid) {
        ids.add(`#${++unnamed}`);
      } else if ((item as Project).name !== undefined) {
        ids.add(String((item as Project).uuid));
      }
      walk((item as Project).children);
      walk((item as Project).content);
    }
  };
  walk(project.outliner);
  return ids;
}

/**
 * The pixel size of a texture, from its own fields or from the picture itself.
 *
 * Newer files write the size down; older ones do not, and for those the width and
 * height are read out of the PNG header at the front of the embedded picture — the
 * first thirty-three bytes, which is forty-four characters of base64 and costs
 * nothing.
 */
export function pixelSizeOf(texture: Project): [number, number] | null {
  const w = Number(texture.width);
  const h = Number(texture.height);
  if (w > 0 && h > 0) return [w, h];
  const source = typeof texture.source === 'string' ? texture.source : '';
  const comma = source.indexOf(',');
  if (!source.startsWith('data:image/png') || comma < 0) return null;
  try {
    const head = atob(source.slice(comma + 1, comma + 1 + 44));
    if (head.slice(1, 4) !== 'PNG' || head.slice(12, 16) !== 'IHDR') return null;
    const at = (i: number) =>
      ((head.charCodeAt(i) << 24) | (head.charCodeAt(i + 1) << 16) | (head.charCodeAt(i + 2) << 8) | head.charCodeAt(i + 3)) >>> 0;
    return [at(16), at(20)];
  } catch {
    return null;
  }
}

export function isEmbedded(texture: Project): boolean {
  return typeof texture.source === 'string' && texture.source.startsWith('data:');
}

/** The UV size a texture is laid out against, by the same rule Blockbench draws with. */
export function uvSizeOf(project: Project, texture: Project | null, traits: Traits): [number, number] {
  const w = Number(project.resolution?.width) || 16;
  const h = Number(project.resolution?.height) || 16;
  if (texture && traits.perTextureUv) {
    return [Number(texture.uv_width) || w, Number(texture.uv_height) || h];
  }
  return [w, h];
}

export function factsOf(project: Project): Facts {
  const format = formatOf(project);
  const traits = traitsOf(format);
  let cubes = 0;
  let meshes = 0;
  for (const element of elementsOf(project)) {
    const type = element.type ?? 'cube';
    if (type === 'cube') cubes++;
    else if (type === 'mesh') meshes++;
  }

  const textures = texturesOf(project);
  let embedded = 0;
  let textureWidth = 0;
  let textureHeight = 0;
  let density = 0;
  for (const texture of textures) {
    if (isEmbedded(texture)) embedded++;
    const size = pixelSizeOf(texture);
    if (!size) continue;
    if (size[0] > textureWidth) {
      textureWidth = size[0];
      textureHeight = size[1];
    }
    const uv = uvSizeOf(project, texture, traits);
    density = Math.max(density, size[0] / uv[0]);
  }

  return {
    format,
    version: versionOf(project),
    boxUv: !!project.meta?.box_uv,
    cubes,
    meshes,
    bones: groupIds(project).size,
    animations: Array.isArray(project.animations) ? project.animations.length : 0,
    textures: textures.length,
    embedded,
    textureWidth,
    textureHeight,
    density: Math.round(density * 100) / 100,
  };
}

/** Whether two counts of the same file agree, field by field. */
export function sameFacts(a: Facts, b: Facts): boolean {
  return (Object.keys(a) as (keyof Facts)[]).every((key) => a[key] === b[key]);
}

export function warningsOf(facts: Facts): Warning[] {
  const said: Warning[] = [];
  if (facts.embedded < facts.textures) {
    said.push({ kind: 'not-embedded', count: facts.textures - facts.embedded });
  }
  if (olderThan(KNOWN_VERSION, facts.version)) said.push({ kind: 'newer' });
  return said;
}

/** Numbers as text, to the thousandth, so that 0.1 + 0.2 and 0.3 are one shape. */
function n(value: unknown): string {
  const x = Number(value);
  return Number.isFinite(x) ? String(Math.round(x * 1000) / 1000) : '0';
}

function v(value: unknown, size = 3): string {
  const list = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (let i = 0; i < size; i++) out.push(n(list[i]));
  return out.join(',');
}

const FACE_KEYS = ['north', 'east', 'south', 'west', 'up', 'down'];

/**
 * What a model looks like, written down so that the same model writes the same text.
 *
 * Names, ids, colours, folding state and the order of elements are all left out —
 * none of them changes what anybody sees, and every one changes when somebody opens a
 * model and saves it again. The shape is positions alone; the paint is the UVs and
 * the pictures. Each is a sorted list, so moving a cube up the outliner is not a new
 * model.
 */
export function outlineOf(project: Project): { shape: string[]; paint: string[] } {
  const shape: string[] = [];
  const paint: string[] = [];
  for (const element of elementsOf(project)) {
    const type = element.type ?? 'cube';
    if (type === 'cube') {
      shape.push(
        `c|${v(element.from)}|${v(element.to)}|${v(element.origin)}|${v(element.rotation)}|${n(element.inflate)}`,
      );
      if (element.box_uv) {
        paint.push(`b|${v(element.uv_offset, 2)}|${element.mirror_uv ? 1 : 0}`);
      } else {
        const faces = element.faces ?? {};
        paint.push(
          'f|' +
            FACE_KEYS.map((key) => {
              const face = faces[key];
              if (!face) return '-';
              return `${v(face.uv, 4)}:${face.texture ?? '-'}:${n(face.rotation)}`;
            }).join('|'),
        );
      }
    } else if (type === 'mesh') {
      const points = Object.values(element.vertices ?? {}).map((point) => v(point));
      points.sort();
      shape.push(`m|${v(element.origin)}|${v(element.rotation)}|${points.join(';')}`);
      const uvs: string[] = [];
      for (const face of Object.values<Project>(element.faces ?? {})) {
        const corners = Object.values(face?.uv ?? {}).map((corner) => v(corner, 2));
        corners.sort();
        uvs.push(`${corners.join(';')}:${face?.texture ?? '-'}`);
      }
      uvs.sort();
      paint.push(`u|${uvs.join('/')}`);
    }
  }
  shape.sort();
  paint.sort();
  return { shape, paint };
}

export async function sha256Hex(data: BufferSource | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/**
 * The two fingerprints of a model.
 *
 * `shape` is the geometry alone. Two models with the same shape are the same cubes in
 * the same places, which is what a repaint of somebody else's model is — worth a
 * warning, not a refusal, because recolouring a base is half of what people do.
 *
 * `print` is the shape with its paint: the UVs and the pictures themselves. Two
 * models with the same print look identical, and the second one to be published is
 * a copy of the first.
 */
export async function printsOf(project: Project): Promise<{ print: string; shape: string }> {
  const { shape, paint } = outlineOf(project);
  const pictures: string[] = [];
  for (const texture of texturesOf(project)) {
    if (isEmbedded(texture)) pictures.push(await sha256Hex(texture.source as string));
  }
  pictures.sort();
  const shapeHash = await sha256Hex(shape.join('\n'));
  const print = await sha256Hex(`${shapeHash}\n${paint.join('\n')}\n${pictures.join('\n')}`);
  return { print, shape: shapeHash };
}

/** Everything the upload needs, worked out once, from the bytes the person chose. */
export interface Prepared {
  /** What goes up: the file as it was, or rewritten if paths had to come out. */
  bytes: Uint8Array<ArrayBuffer>;
  sha256: string;
  project: Project;
  facts: Facts;
  print: string;
  shape: string;
  /** How many local paths were taken out. */
  stripped: number;
  warnings: Warning[];
}

/**
 * From a chosen file to something that can be sent.
 *
 * Rewrites the file only when there was something to take out. A file with no paths in
 * it goes up byte for byte, so whoever downloads it gets exactly what its author saved.
 */
export async function prepare(original: Uint8Array<ArrayBuffer>): Promise<Prepared> {
  const text = new TextDecoder().decode(original);
  const project = parseProject(text);
  const stripped = stripPaths(project);
  const facts = factsOf(project);
  if (facts.cubes + facts.meshes === 0) {
    if (facts.format === 'skin') {
      throw new NotAModel(
        'Это проект скина: в нём нет своих кубов, только стандартная фигура игрока. Скины появятся во второй версии сайта.',
      );
    }
    throw new NotAModel('В модели нет ни одного куба или меша.');
  }
  // An encoder's output always owns a plain buffer; the Workers types do not say so.
  const bytes = stripped ? (new TextEncoder().encode(JSON.stringify(project)) as Uint8Array<ArrayBuffer>) : original;
  const [sha256, prints] = await Promise.all([sha256Hex(bytes), printsOf(project)]);
  return {
    bytes,
    sha256,
    project,
    facts,
    print: prints.print,
    shape: prints.shape,
    stripped,
    warnings: warningsOf(facts),
  };
}
