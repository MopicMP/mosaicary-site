/**
 * An EmoteCraft animation, turned into something that can be sampled.
 *
 * <h2>Why it has to be turned inside out</h2>
 *
 * The format stores a flat list of moves, and the same tick appears many times
 * over — one entry carrying a head, the next a torso, the next a leg. Sampling a
 * single limb at a single moment from that means walking the whole list, and one
 * of these has three and a half thousand entries in it.
 *
 * So it is inverted once on load: a track per limb per channel, each sorted, each
 * sampled on its own. That is the same shape the mod's reader uses, and
 * deliberately — the two are read from the same files and ought to agree about
 * what they mean.
 *
 * <h2>The easing belongs to the keyframe it leaves, not the one it arrives at</h2>
 *
 * Which is what makes `CONSTANT` mean anything at all: it holds its own value
 * until the next keyframe replaces it. Attached the other way round it would be a
 * step backwards from the following frame, which is a different animation.
 */

export const BONES = [
  'head',
  'torso',
  'rightArm',
  'leftArm',
  'rightLeg',
  'leftLeg',
  'rightItem',
  'leftItem',
] as const;

export type Bone = (typeof BONES)[number];

/**
 * What can be done to a part.
 *
 * Three offsets in model pixels and three angles in radians — every file in the
 * pack sets `degrees` to false, so nothing needs converting, and values run past a
 * full turn in places because some of these genuinely spin.
 *
 * `bend` folds a limb at its middle, which a rigid box cannot do. It is read and
 * carried rather than dropped, and approximated where it is applied.
 */
export const CHANNELS = ['x', 'y', 'z', 'pitch', 'yaw', 'roll', 'bend'] as const;
export type Channel = (typeof CHANNELS)[number];

export type Pose = Partial<Record<Channel, number>>;

export interface Track {
  ticks: number[];
  values: number[];
  easings: Easing[];
}

export type Easing = 'LINEAR' | 'CONSTANT' | 'EASEINSINE' | 'EASEINQUAD' | 'EASEINOUTQUAD';

export interface Emote {
  name: string;
  author: string;
  description: string;
  loop: boolean;
  beginTick: number;
  endTick: number;
  stopTick: number;
  returnTick: number;
  /** Only the bones that move; the rest are absent rather than empty. */
  tracks: Partial<Record<Bone, Partial<Record<Channel, Track>>>>;
}

const SHAPES: Record<Easing, (t: number) => number> = {
  LINEAR: (t) => t,
  // Holds its own value until the next keyframe replaces it.
  CONSTANT: () => 0,
  EASEINSINE: (t) => 1 - Math.cos((t * Math.PI) / 2),
  EASEINQUAD: (t) => t * t,
  EASEINOUTQUAD: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

function easingOf(name: unknown): Easing {
  const said = String(name ?? '').trim().toUpperCase();
  // A shape we have not met is closer to a straight line than to nothing, and an
  // animation that plays slightly wrong beats one that refuses to load.
  return said in SHAPES ? (said as Easing) : 'LINEAR';
}

/**
 * True, however this file happens to spell it.
 *
 * The pack writes `"isLoop": "true"` — a string — in some files and a plain
 * boolean in others. Read strictly, every looping animation in it stops after one
 * pass, which looks like a wrong animation rather than a wrong reader: a dance
 * that plays once and freezes is exactly what a dance that was not meant to loop
 * looks like.
 */
function truth(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/** The readable half of a field that carries both a translation key and a fallback. */
function words(field: unknown): string {
  if (field && typeof field === 'object') {
    const both = field as { fallback?: string; translate?: string };
    return both.fallback ?? both.translate ?? '';
  }
  return String(field ?? '');
}

/** Colour codes are for the game's own text; nothing else wants to see them. */
export function plain(name: string): string {
  return name.replace(/§./g, '').replace(/\s+/g, ' ').trim();
}

interface RawMove {
  tick?: number;
  easing?: string;
  turn?: number;
  [bone: string]: unknown;
}

export function readEmote(json: unknown): Emote {
  const file = (json ?? {}) as Record<string, unknown>;
  const body = (file.emote ?? {}) as Record<string, unknown>;
  const moves = Array.isArray(body.moves) ? (body.moves as RawMove[]) : [];
  // Every file in this pack says false, but a file that says otherwise means its
  // angles are degrees, and playing those as radians is a figure tied in a knot.
  const toRadians = truth(body.degrees) ? Math.PI / 180 : 1;

  const tracks: Emote['tracks'] = {};
  for (const move of moves) {
    const tick = Number(move.tick ?? 0);
    const easing = easingOf(move.easing);
    for (const bone of BONES) {
      const pose = move[bone];
      if (!pose || typeof pose !== 'object') continue;
      const perBone = (tracks[bone] ??= {});
      for (const [channel, value] of Object.entries(pose as Record<string, unknown>)) {
        if (!(CHANNELS as readonly string[]).includes(channel)) continue;
        const number = Number(value);
        if (!Number.isFinite(number)) continue;
        const kind = channel as Channel;
        const track = (perBone[kind] ??= { ticks: [], values: [], easings: [] });
        const turning = kind === 'pitch' || kind === 'yaw' || kind === 'roll' || kind === 'bend';
        track.ticks.push(tick);
        track.values.push(turning ? number * toRadians : number);
        track.easings.push(easing);
      }
    }
  }

  // Sorted because the file is not required to be, and a track out of order
  // samples nonsense in a way that looks like a bad animation rather than a bug.
  for (const perBone of Object.values(tracks)) {
    for (const track of Object.values(perBone as Record<string, Track>)) {
      order(track);
    }
  }

  const endTick = Number(body.endTick ?? 0);
  return {
    name: plain(words(file.name)),
    author: words(file.author),
    description: plain(words(file.description)),
    loop: truth(body.isLoop),
    beginTick: Number(body.beginTick ?? 0),
    endTick,
    stopTick: Number(body.stopTick ?? endTick),
    returnTick: Number(body.returnTick ?? 0),
    tracks,
  };
}

function order(track: Track): void {
  const at = track.ticks.map((_, i) => i).sort((a, b) => track.ticks[a]! - track.ticks[b]!);
  const already = at.every((value, i) => value === i);
  if (already) return;
  const ticks = at.map((i) => track.ticks[i]!);
  const values = at.map((i) => track.values[i]!);
  const easings = at.map((i) => track.easings[i]!);
  track.ticks = ticks;
  track.values = values;
  track.easings = easings;
}

/**
 * One channel of one limb at a moment.
 *
 * Before the first keyframe and after the last it holds the nearest value rather
 * than falling to zero — a limb that snaps to its rest pose for the first frame is
 * the commonest way one of these looks broken.
 */
export function sample(track: Track, tick: number): number {
  const { ticks, values, easings } = track;
  if (!ticks.length) return 0;
  if (tick <= ticks[0]!) return values[0]!;
  if (tick >= ticks[ticks.length - 1]!) return values[values.length - 1]!;

  let low = 0;
  let high = ticks.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (ticks[middle]! <= tick) low = middle;
    else high = middle;
  }

  const from = ticks[low]!;
  const to = ticks[high]!;
  const span = to - from;
  if (span <= 0) return values[high]!;
  // The easing of the keyframe being left, which is what makes CONSTANT hold.
  const shape = SHAPES[easings[low] ?? 'LINEAR'];
  const along = shape((tick - from) / span);
  return values[low]! + (values[high]! - values[low]!) * along;
}

/** Everything one bone is doing at a moment, or nothing if it does not move. */
export function poseOf(emote: Emote, bone: Bone, tick: number): Pose | null {
  const perBone = emote.tracks[bone];
  if (!perBone) return null;
  const pose: Pose = {};
  for (const channel of CHANNELS) {
    const track = perBone[channel];
    if (track) pose[channel] = sample(track, tick);
  }
  return pose;
}

/**
 * Where in an animation a given moment falls.
 *
 * An emote has a run-in, a body that may loop, and a run-out. Looping between
 * `beginTick` and `endTick` rather than over the whole thing is what keeps the
 * run-in from being replayed every cycle — which is what makes a dance start over
 * from standing every four seconds.
 */
export function tickAt(emote: Emote, seconds: number, rate = 20): number {
  const tick = seconds * rate;
  if (!emote.loop) return Math.min(tick, emote.stopTick);
  const from = emote.beginTick;
  const span = Math.max(1, emote.endTick - from);
  if (tick < from) return tick;
  return from + ((tick - from) % span);
}
