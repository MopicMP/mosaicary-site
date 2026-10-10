import Molang from 'molangjs';
import * as THREE from 'three';

import { olderThan, versionOf, type Project } from '../../shared/bbmodel.js';
import type { Bone, Figure } from './bbmodel3d.js';

/**
 * The animations saved in a Blockbench project, played the way its timeline plays
 * them.
 *
 * <h2>Why it is Blockbench's interpolation and not three.js's</h2>
 *
 * Because a keyframe in Blockbench is not a number but an expression — `math.sin(
 * q.anim_time * 180) * 10` is an ordinary rotation — and because its four ways of
 * getting from one key to the next are its own: linear, step, a Catmull-Rom spline
 * that looks one key further out on either side, and a Bézier with handles in seconds
 * and in degrees. An animation exported to anything else is baked into samples first;
 * here it is read from the file, so whoever opens a model sees the motion its author
 * timed and not an approximation of it.
 *
 * The rules are Blockbench's own (`keyframe.js`, `timeline_animators.js`), including
 * its tolerance of a twelve-hundredth of a second for "on a key" and the way a key
 * with two values uses the second one leaving and the first one arriving.
 *
 * <h2>Files from before 5.0</h2>
 *
 * Blockbench 5.0 turned three axes round — position along X, rotation about X and
 * about Y — so that what is stored is what three.js draws. Older files keep the old
 * signs. Every step from key to key is linear in the values, so turning the result
 * round is the same as turning every key round first, and is what is done.
 */

export type Loop = 'loop' | 'once' | 'hold';

type Channel = 'rotation' | 'position' | 'scale';

const CHANNELS: Channel[] = ['rotation', 'position', 'scale'];
const AXES = ['x', 'y', 'z'] as const;

/** Within this of a key, in seconds, is on it. */
const EPSILON = 1 / 1200;

interface Key {
  time: number;
  interpolation: string;
  points: Project[];
  leftTime: number[];
  leftValue: number[];
  rightTime: number[];
  rightValue: number[];
}

interface Track {
  bone: Bone;
  keys: Record<Channel, Key[]>;
}

export interface Clip {
  name: string;
  /** In seconds. */
  length: number;
  loop: Loop;
  tracks: Track[];
}

export interface Motion {
  clips: Clip[];
  /** The figure as it stands `seconds` into `clip`, starting from rest. */
  pose(clip: Clip, seconds: number): void;
}

/** What turning a pre-5.0 file round means, channel by channel. */
const OLD_SIGNS: Record<Channel, number[]> = {
  rotation: [-1, -1, 1],
  position: [-1, 1, 1],
  scale: [1, 1, 1],
};
const SAME_SIGNS: number[] = [1, 1, 1];

/** How long the last frame of a clip that does not loop is held before it starts again. */
const HOLD = 1;

function num(value: unknown, otherwise = 0): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : otherwise;
}

function triple(value: unknown, otherwise: number): number[] {
  const list = Array.isArray(value) ? value : [];
  return [num(list[0], otherwise), num(list[1], otherwise), num(list[2], otherwise)];
}

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));

/** Molang's short names, written out the way the parser stores them. */
function fullName(name: string): string {
  const short: Record<string, string> = { q: 'query', v: 'variable', t: 'temp', c: 'context' };
  const [head, ...rest] = name.toLowerCase().split('.');
  return [short[head!] ?? head, ...rest].join('.');
}

/**
 * The preview values an author set for variables the game would supply, such as how
 * fast the entity is walking, so that a walk cycle written against them moves here
 * as it moved in the editor.
 *
 * Only plain assignments are read. A slider or a toggle is a control in Blockbench's
 * window and has no value until somebody moves it, so here it stays at nought.
 */
function placeholdersOf(project: Project): Record<string, string> {
  const said = typeof project.animation_variable_placeholders === 'string' ? project.animation_variable_placeholders : '';
  const found: Record<string, string> = {};
  for (const line of said.split('\n')) {
    const match = /^\s*([a-z_][\w.]*)\s*=\s*(.+?)\s*;?\s*$/i.exec(line.replace(/\/\/.*$/, ''));
    if (!match || /\b(?:slider|toggle)\s*\(/i.test(match[2]!)) continue;
    found[fullName(match[1]!)] = match[2]!;
  }
  return found;
}

function keyOf(keyframe: Project): Key | null {
  const points = Array.isArray(keyframe.data_points)
    ? keyframe.data_points.filter((point: unknown) => point && typeof point === 'object')
    : [];
  if (!points.length) return null;
  return {
    time: num(keyframe.time),
    interpolation: typeof keyframe.interpolation === 'string' ? keyframe.interpolation : 'linear',
    points,
    leftTime: triple(keyframe.bezier_left_time, -0.1),
    leftValue: triple(keyframe.bezier_left_value, 0),
    rightTime: triple(keyframe.bezier_right_time, 0.1),
    rightValue: triple(keyframe.bezier_right_value, 0),
  };
}

export function motionOf(project: Project, figure: Figure): Motion {
  const parser = new Molang();
  parser.global_variables = placeholdersOf(project);
  const signs = olderThan(versionOf(project), '5.0') ? OLD_SIGNS : null;

  // An animator names its bone by id, and by name for when the id has changed
  // underneath it, which Blockbench also looks for.
  const byName = new Map<string, Bone>();
  for (const bone of figure.bones.values()) if (!byName.has(bone.name)) byName.set(bone.name, bone);

  const clips: Clip[] = [];
  for (const animation of Array.isArray(project.animations) ? project.animations : []) {
    if (!animation || typeof animation !== 'object') continue;
    const tracks: Track[] = [];
    let latest = 0;
    for (const [uuid, animator] of Object.entries<Project>(animation.animators ?? {})) {
      if (!animator || typeof animator !== 'object') continue;
      if ((animator.type ?? 'bone') !== 'bone') continue;
      const bone = figure.bones.get(uuid) ?? byName.get(String(animator.name ?? ''));
      if (!bone) continue;
      const keys: Record<Channel, Key[]> = { rotation: [], position: [], scale: [] };
      for (const keyframe of Array.isArray(animator.keyframes) ? animator.keyframes : []) {
        if (!keyframe || !CHANNELS.includes(keyframe.channel)) continue;
        const key = keyOf(keyframe);
        if (!key) continue;
        keys[keyframe.channel as Channel].push(key);
        latest = Math.max(latest, key.time);
      }
      if (CHANNELS.some((channel) => keys[channel].length)) tracks.push({ bone, keys });
    }
    const loop: Loop = animation.loop === 'once' || animation.loop === 'hold' ? animation.loop : 'loop';
    clips.push({
      name: String(animation.name ?? ''),
      length: num(animation.length) > 0 ? num(animation.length) : latest,
      loop,
      tracks,
    });
  }

  const pose = (clip: Clip, seconds: number) => {
    figure.rest();
    const variables = { 'query.anim_time': seconds, 'query.life_time': seconds };
    const read = (key: Key, axis: number, point: number) =>
      parser.parse(key.points[clamp(point, 0, key.points.length - 1)]?.[AXES[axis]!], variables);

    for (const track of clip.tracks) {
      const object = track.bone.object;
      for (const channel of CHANNELS) {
        const keys = track.keys[channel];
        if (!keys.length) continue;
        const value = sample(keys, seconds, clip.loop === 'loop', read);
        if (!value) continue;
        const sign = signs ? signs[channel] : SAME_SIGNS;
        const [x, y, z] = value.map((v, i) => v * sign[i]!) as [number, number, number];
        if (channel === 'rotation') {
          object.rotation.x += THREE.MathUtils.degToRad(x);
          object.rotation.y += THREE.MathUtils.degToRad(y);
          object.rotation.z += THREE.MathUtils.degToRad(z);
        } else if (channel === 'position') {
          object.position.x += x;
          object.position.y += y;
          object.position.z += z;
        } else {
          // Nought would make the matrix singular, and Blockbench keeps a hair above it.
          object.scale.x *= x || 0.00001;
          object.scale.y *= y || 0.00001;
          object.scale.z *= z || 0.00001;
        }
      }
    }
  };

  return { clips, pose };
}

/**
 * Where in a clip a viewer is after `elapsed` seconds of watching it.
 *
 * A looping clip goes round. One that plays once, or plays and holds, is shown to its
 * end, held there for a second so the last pose is seen, and started again: a viewer
 * that played it once and then stood still would look broken to anybody who arrived a
 * moment late.
 */
export function timeIn(clip: Clip, elapsed: number): number {
  if (clip.length <= 0) return 0;
  if (clip.loop === 'loop') return elapsed % clip.length;
  return Math.min(clip.length, elapsed % (clip.length + HOLD));
}

/**
 * One channel of one bone at one moment: Blockbench's `interpolate`, or `null` where
 * it would leave the bone alone.
 */
function sample(
  keys: Key[],
  time: number,
  looped: boolean,
  read: (key: Key, axis: number, point: number) => number,
): number[] | null {
  let first: Key | null = null;
  let last: Key | null = null;
  for (const key of keys) {
    if (key.time < time) {
      if (!first || key.time > first.time) first = key;
    } else if (!last || key.time < last.time) {
      last = key;
    }
  }
  const on = (key: Key) => Math.abs(key.time - time) < EPSILON;

  let held: Key | null = null;
  if (first && on(first)) held = first;
  else if (last && on(last)) held = last;
  else if (first && first.interpolation === 'step') held = first;
  else if (first && !last) held = first;
  else if (last && !first) held = last;

  if (held) {
    const key = held;
    // Leaving a key with two values uses the second; arriving at one, the first.
    const point = key.time > time || on(key) ? 0 : key.points.length - 1;
    return [0, 1, 2].map((axis) => read(key, axis, point));
  }
  if (!first || !last) return null;
  const before: Key = first;
  const after: Key = last;

  const alpha = (time - before.time) / (after.time - before.time);
  const kinds = [before.interpolation, after.interpolation];

  if (before.interpolation === 'linear' && (after.interpolation === 'linear' || after.interpolation === 'step')) {
    const from = before.points.length > 1 ? 1 : 0;
    return [0, 1, 2].map((axis) => {
      const start = read(before, axis, from);
      return start + (read(after, axis, 0) - start) * alpha;
    });
  }

  if (kinds.includes('catmullrom')) {
    const order = keys.slice().sort((a, b) => a.time - b.time);
    const at = order.indexOf(before);
    let outer: Key | undefined = order[at - 1];
    let further: Key | undefined = order[at + 2];
    if (looped && order.length >= 3) {
      outer ??= order.at(-2);
      further ??= order[1];
    }
    return [0, 1, 2].map((axis) => {
      const points: THREE.Vector2[] = [];
      if (outer && before.points.length === 1) points.push(new THREE.Vector2(outer.time, read(outer, axis, 1)));
      points.push(new THREE.Vector2(before.time, read(before, axis, 1)));
      points.push(new THREE.Vector2(after.time, read(after, axis, 0)));
      if (further && after.points.length === 1) points.push(new THREE.Vector2(further.time, read(further, axis, 0)));
      const curve = new THREE.SplineCurve(points);
      return curve.getPoint((alpha + (outer ? 1 : 0)) / (points.length - 1)).y;
    });
  }

  if (kinds.includes('bezier')) {
    const gap = after.time - before.time;
    return [0, 1, 2].map((axis) => {
      const start = read(before, axis, 1);
      const stop = read(after, axis, 0);
      const curve = new THREE.CubicBezierCurve(
        new THREE.Vector2(before.time, start),
        new THREE.Vector2(before.time + clamp(before.rightTime[axis]!, 0, gap), start + before.rightValue[axis]! || 0),
        new THREE.Vector2(after.time + clamp(after.leftTime[axis]!, -gap, 0), stop + after.leftValue[axis]! || 0),
        new THREE.Vector2(after.time, stop),
      );
      // Read off the curve by time, the way Blockbench does: the two sampled points
      // nearest in time, and a straight line between them.
      const points = curve.getPoints(200);
      let nearest = points[0]!;
      for (const point of points) if (Math.abs(point.x - time) < Math.abs(nearest.x - time)) nearest = point;
      let next: THREE.Vector2 | null = null;
      for (const point of points) {
        if (point === nearest) continue;
        if (!next || Math.abs(point.x - time) < Math.abs(next.x - time)) next = point;
      }
      if (!next || next.x === nearest.x) return nearest.y;
      return nearest.y + (next.y - nearest.y) * clamp((time - nearest.x) / (next.x - nearest.x), 0, 1);
    });
  }

  return null;
}
