import type { Facts } from './bbmodel.js';
import type { Look } from './modelWire.js';

/**
 * The rules about models that both sides keep.
 *
 * The page asks them first so a person hears "too big" before anything goes up; the
 * server asks them again because the page is the one thing an attacker gets to
 * replace. One module, so that the two cannot drift apart into a page that promises
 * what the server refuses.
 *
 * <h2>No words for people in here</h2>
 *
 * The codes live here and their names do not — those are in `src/lib/names.ts`, read
 * from the dictionary of whichever language is on screen. This file is imported by the
 * Worker and sits beside one that is copied into the plugin verbatim, and neither has
 * any business carrying a table of labels in fourteen languages. The same goes for
 * what a check refuses with: a code, never a sentence.
 */

/**
 * The largest file accepted.
 *
 * Measured on 17 057 public .bbmodel files: one in a hundred is over 3.5 MB, one in a
 * thousand over 11 MB, and twenty-five megabytes leaves out three files of the whole
 * sample. The server never reads the file, so the cost of a large one is storage,
 * which the quota below holds.
 */
export const MODEL_MAX_BYTES = 25 * 1024 * 1024;

/** The picture on the card. A 512 pixel WebP is about forty kilobytes. */
export const PREVIEW_MAX_BYTES = 200 * 1024;

/**
 * How much one person can keep here.
 *
 * Not measured — there is nobody to measure yet. It is a tenth of a percent of a
 * hundred people sharing the ten gigabytes storage is free up to, and room for some
 * three hundred ordinary models, or ten very large ones.
 */
export const QUOTA_BYTES = 300 * 1024 * 1024;

/** Uploads a day per person. Also a guess, and high on purpose: it stops scripts, not people. */
export const DAILY_UPLOADS = 200;

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 2000;
export const TAGS_MAX = 8;
export const TAG_MAX = 24;

/**
 * What a model is for, in the four groups a person looking for one thinks in.
 *
 * Nobody searches for `animated_entity_model`; they search for "a model for my mod".
 * The exact format stays filterable underneath for the people who do know.
 */
export type Use = 'java' | 'bedrock' | 'mods' | 'free';

const USES: Record<string, Use> = {
  java_block: 'java',
  optifine_entity: 'java',
  optifine_part: 'java',
  skin: 'java',
  bedrock: 'bedrock',
  bedrock_old: 'bedrock',
  bedrock_block: 'bedrock',
  modded_entity: 'mods',
  // GeckoLib's plugin, under the id it saves with now and the one it used before.
  geckolib_model: 'mods',
  animated_entity_model: 'mods',
};

export function useOf(format: string): Use {
  return USES[format] ?? 'free';
}

/**
 * The licences offered when publishing.
 *
 * Creative Commons because it is what people already recognise on Sketchfab and
 * elsewhere, plus "all rights reserved" for somebody who wants to show a model
 * without letting anybody use it. Six, not the whole Creative Commons set: the
 * no-derivatives variants make little sense for a thing whose purpose is to be put in
 * a game, where it is always being changed.
 */
export const LICENSES = ['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa', 'arr'] as const;
export type License = (typeof LICENSES)[number];

export const LICENSE_LINKS: Partial<Record<License, string>> = {
  cc0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by': 'https://creativecommons.org/licenses/by/4.0/',
  'cc-by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'cc-by-nc': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'cc-by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
};

export function isLicense(value: unknown): value is License {
  return typeof value === 'string' && (LICENSES as readonly string[]).includes(value);
}

/**
 * What can be said about somebody else's model.
 *
 * One kind for each thing the site's rules forbid, because each is answered
 * differently. A stolen model is a question of whose work it is. One for adults
 * without the mark is marked. One cut down to send people elsewhere for the rest
 * breaks the rule that everything here can be downloaded whole. Unlawful and junk are
 * taken down. A broken one is a question for the uploader, and the rest is read by a
 * person. Nothing is reportable for being disliked: the site forbids only what the law
 * does and what spoils it for others.
 *
 * `offensive` keeps its name from before it meant "unlawful", so that reports already
 * made still read.
 */
export const REPORT_KINDS = ['stolen', 'unmarked', 'incomplete', 'offensive', 'junk', 'broken', 'other'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_SAID_MAX = 1000;

export function isReportKind(value: unknown): value is ReportKind {
  return typeof value === 'string' && (REPORT_KINDS as readonly string[]).includes(value);
}

/**
 * How long somebody cannot publish for after a second attempt at the same model.
 *
 * The same rule and the same number as for skins: the first attempt is carelessness
 * and is answered by a refusal, the second is a decision and is answered by a wait.
 */
export const PENALTY_DAYS = 7;

/** A name as it will be stored: one line, trimmed, short. */
export function cleanName(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

export function cleanDescription(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '')
    .trim()
    .slice(0, DESCRIPTION_MAX);
}

/**
 * Tags as they will be stored: lower case, one word or a few, no duplicates.
 *
 * Lower case because "Dragon" and "dragon" are one tag to everybody looking, and a
 * filter that lists both is a filter that hides half of each.
 */
export function cleanTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',');
  const out: string[] = [];
  for (const one of list) {
    const tag = String(one ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]+/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TAG_MAX);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === TAGS_MAX) break;
  }
  return out;
}

/**
 * The colour an author put behind their model, as `#rrggbb` in lower case.
 *
 * Null for none, which is the chequer that says "transparent". Anything that is not a
 * plain six-digit colour is refused rather than guessed at: the value goes into a
 * style on every card, and a style is not a place for whatever somebody typed.
 * Undefined means refused.
 */
export function cleanBackground(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const colour = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(colour) ? colour : undefined;
}

/**
 * How far up the camera may be tilted, in radians, either way.
 *
 * Short of straight down: overhead is a view of a roof and nothing else, and straight
 * down is where the maths of "which way is up" falls apart. Checked here and not only
 * in the drawing code, because an angle now arrives from whoever is uploading.
 */
export const MOST_TILT = 1.4;

/**
 * The angle an author chose to show their model from.
 *
 * Null for none, which means the one angle everything used before. The turn is folded
 * into a single circle and the tilt is refused outright when it is past the limit: a
 * tilt that is quietly clamped would leave an author looking at one angle and everybody
 * else at another.
 */
export function cleanLook(value: unknown): Look | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return undefined;
  const { spin, tilt } = value as Record<string, unknown>;
  if (typeof spin !== 'number' || !Number.isFinite(spin)) return undefined;
  if (typeof tilt !== 'number' || !Number.isFinite(tilt)) return undefined;
  if (Math.abs(tilt) > MOST_TILT + 1e-9) return undefined;
  const circle = Math.PI * 2;
  const folded = ((spin % circle) + circle) % circle;
  // Three decimals is a fifth of a degree: finer than anybody can drag, and short
  // enough that the number reads as an angle in the database.
  const round = (one: number) => Math.round(one * 1000) / 1000;
  return { spin: round(folded > Math.PI ? folded - circle : folded), tilt: round(tilt) };
}

/** A link somebody gave for an author, kept only if it is an ordinary web address. */
export function cleanUrl(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString().slice(0, 300);
  } catch {
    return null;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

const COUNTS: (keyof Facts)[] = [
  'cubes',
  'meshes',
  'bones',
  'animations',
  'textures',
  'embedded',
  'textureWidth',
  'textureHeight',
];

/** What the page says about a model before sending it. */
export interface Declared {
  name: string;
  description: string;
  tags: string[];
  sha256: string;
  bytes: number;
  print: string;
  shape: string;
  facts: Facts;
}

/**
 * The page's account of a file, checked for shape and sense.
 *
 * Shape only: whether the numbers are the file's own is decided later, by R2 checking
 * the hash as the bytes arrive and by every page that opens the model counting again.
 */
export function readDeclared(body: unknown): Declared | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'пустой запрос' };
  const said = body as Record<string, any>;
  const name = cleanName(said.name);
  if (!name) return { error: 'у модели должно быть название' };
  const sha256 = String(said.sha256 ?? '');
  const print = String(said.print ?? '');
  const shape = String(said.shape ?? '');
  if (!HEX64.test(sha256) || !HEX64.test(print) || !HEX64.test(shape)) {
    return { error: 'отпечаток файла в неверном виде' };
  }
  const bytes = Number(said.bytes);
  if (!Number.isInteger(bytes) || bytes <= 0) return { error: 'размер файла в неверном виде' };
  if (bytes > MODEL_MAX_BYTES) return { error: `файл больше ${MODEL_MAX_BYTES / 1024 / 1024} МБ` };

  const facts = readFacts(said.facts);
  if ('error' in facts) return facts;

  return {
    name,
    description: cleanDescription(said.description),
    tags: cleanTags(said.tags),
    sha256,
    bytes,
    print,
    shape,
    facts,
  };
}

/** What somebody's page counted in a file, checked for shape and sense. */
export function readFacts(given: unknown): Facts | { error: string } {
  if (!given || typeof given !== 'object') return { error: 'нет сведений о модели' };
  const f = given as Record<string, any>;
  for (const key of COUNTS) {
    const value = f[key];
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
      return { error: `сведения о модели в неверном виде: ${key}` };
    }
  }
  if (f.cubes + f.meshes === 0) return { error: 'в модели нет ни одного куба или меша' };
  if (typeof f.format !== 'string' || !/^[\w.-]{1,48}$/.test(f.format)) {
    return { error: 'формат модели в неверном виде' };
  }
  if (typeof f.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(f.version)) {
    return { error: 'версия файла в неверном виде' };
  }
  const density = Number(f.density);
  if (!Number.isFinite(density) || density < 0 || density > 1024) {
    return { error: 'плотность текстуры в неверном виде' };
  }
  return {
    format: f.format,
    version: f.version,
    boxUv: !!f.boxUv,
    cubes: f.cubes,
    meshes: f.meshes,
    bones: f.bones,
    animations: f.animations,
    textures: f.textures,
    embedded: f.embedded,
    textureWidth: f.textureWidth,
    textureHeight: f.textureHeight,
    density: Math.round(density * 100) / 100,
  };
}
