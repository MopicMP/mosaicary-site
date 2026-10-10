/**
 * Which pixels of a face are eye, white, brow and lash — at the resolution the
 * face was drawn, and on the layer it was drawn on.
 *
 * The other implementation of `docs/face-mask-format.md`. The mod has one in Java
 * and this is the one the website marks with, and the two never run in the same
 * process — so both are held to `test/Eyes/mask-fixtures.json`, because two
 * encoders of one format diverge silently and there is no way to find the week it
 * started.
 *
 * Read the contract before changing anything here. In particular: the eight masks
 * are in a fixed order, runs alternate clear-then-marked starting clear, and an
 * unreadable string is an unmarked face rather than an exception.
 */

export const KINDS = ['EYE', 'WHITE', 'BROW', 'LASH'] as const;
export const LAYERS = ['FACE', 'OVER'] as const;

export type Kind = (typeof KINDS)[number];
export type Layer = (typeof LAYERS)[number];

/** How many masks a face carries: every kind on every layer. */
export const PARTS = KINDS.length * LAYERS.length;

/** The coarsest a face can be, and the finest a person can usefully aim at. */
export const SMALLEST = 8;
export const LARGEST = 256;

/** Where one kind on one layer sits in the array. */
export function part(kind: Kind, layer: Layer): number {
  return KINDS.indexOf(kind) * LAYERS.length + LAYERS.indexOf(layer);
}

export class FaceMask {
  readonly size: number;
  /** Eight bitsets, one per kind and layer, indexed by {@link part}. */
  private readonly bits: Uint8Array[];

  constructor(size: number, bits?: (Uint8Array | undefined)[]) {
    this.size = clampSize(size);
    const cells = this.size * this.size;
    this.bits = Array.from({ length: PARTS }, (_, i) => {
      const out = new Uint8Array(cells);
      const from = bits?.[i];
      if (from) out.set(from.subarray(0, Math.min(cells, from.length)));
      return out;
    });
  }

  /** A face nobody has marked. */
  static none(size = SMALLEST): FaceMask {
    return new FaceMask(size);
  }

  is(kind: Kind, layer: Layer, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return this.bits[part(kind, layer)][y * this.size + x] === 1;
  }

  /** Whether a pixel is this kind on either layer. */
  isEither(kind: Kind, x: number, y: number): boolean {
    return this.is(kind, 'FACE', x, y) || this.is(kind, 'OVER', x, y);
  }

  set(kind: Kind, layer: Layer, x: number, y: number, on: boolean): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.bits[part(kind, layer)][y * this.size + x] = on ? 1 : 0;
  }

  mask(kind: Kind, layer: Layer): Uint8Array {
    return this.bits[part(kind, layer)];
  }

  get isNone(): boolean {
    return this.bits.every((mask) => !mask.some((cell) => cell === 1));
  }

  clone(): FaceMask {
    return new FaceMask(this.size, this.bits.map((mask) => mask.slice()));
  }

  /**
   * The whole mask as one short line of text.
   *
   * Run lengths rather than hex because a mask is enormous and almost empty: a
   * face at 256 across is 65 536 bits eight times over, and what a person marks is
   * a handful of solid blobs — and a solid blob is two numbers however large the
   * grid beneath it. Seven of the eight masks are usually empty, and an empty mask
   * is nothing at all.
   */
  encode(): string {
    if (this.isNone) return '';
    const groups = this.bits.map((mask) => runsOf(mask));
    return `${this.size.toString(16)}:${groups.join('/')}`;
  }

  /**
   * A mask read back from {@link encode}.
   *
   * Never throws. Three groups rather than eight is a mask from before lashes and
   * layers existed and means eye, white and brow, all on the face — so a wardrobe
   * marked under the old build keeps every costume of it.
   */
  static decode(text: string | null | undefined): FaceMask {
    if (!text || !text.trim()) return FaceMask.none();
    try {
      const colon = text.indexOf(':');
      if (colon <= 0) return FaceMask.none();

      const size = clampSize(parseHex(text.slice(0, colon).trim()));
      const groups = text.slice(colon + 1).split('/');
      if (groups.length !== PARTS && groups.length !== 3) return FaceMask.none();

      const bits: (Uint8Array | undefined)[] = new Array(PARTS);
      if (groups.length === 3) {
        bits[part('EYE', 'FACE')] = unruns(groups[0], size);
        bits[part('WHITE', 'FACE')] = unruns(groups[1], size);
        bits[part('BROW', 'FACE')] = unruns(groups[2], size);
      } else {
        for (let i = 0; i < PARTS; i++) bits[i] = unruns(groups[i], size);
      }
      return new FaceMask(size, bits);
    } catch {
      return FaceMask.none();
    }
  }

  /**
   * The same face in eighths, which is what everything in the mod still speaks:
   * three 64-bit numbers, as `{ eyes, whites, brows }`.
   *
   * A block counts as marked if **any** cell inside it is, rather than most — a
   * lid that covers a row too many is a small ugliness and a lid that misses the
   * eye is a character that never blinks. Both layers fold together and the lash
   * folds in with the brow, because the coarse map has no word for either.
   */
  reduce(): { eyes: bigint; whites: bigint; brows: bigint } {
    return {
      eyes: this.reduceKind(['EYE']),
      whites: this.reduceKind(['WHITE']),
      brows: this.reduceKind(['BROW', 'LASH']),
    };
  }

  private reduceKind(kinds: Kind[]): bigint {
    const step = this.size / SMALLEST;
    let out = 0n;
    for (let y = 0; y < SMALLEST; y++) {
      for (let x = 0; x < SMALLEST; x++) {
        let any = false;
        for (let dy = 0; dy < step && !any; dy++) {
          for (let dx = 0; dx < step && !any; dx++) {
            any = kinds.some((kind) => this.isEither(kind, x * step + dx, y * step + dy));
          }
        }
        if (any) out |= 1n << BigInt(y * SMALLEST + x);
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------ the details

function runsOf(mask: Uint8Array): string {
  if (!mask.some((cell) => cell === 1)) return '';
  const runs: string[] = [];
  let at = 0;
  let on = 0;
  while (at < mask.length) {
    let run = 0;
    while (at + run < mask.length && mask[at + run] === on) run++;
    runs.push(run.toString(16));
    at += run;
    on = on === 0 ? 1 : 0;
  }
  return runs.join('.');
}

function unruns(text: string, size: number): Uint8Array {
  const cells = size * size;
  const mask = new Uint8Array(cells);
  if (!text || !text.trim()) return mask;

  let at = 0;
  let on = false;
  for (const run of text.split('.')) {
    const length = parseHex(run.trim());
    // Cut off at the edge rather than running past the end: a hand-edited file
    // must cost one costume, not a world.
    if (on) mask.fill(1, at, Math.min(at + length, cells));
    at += length;
    on = !on;
    if (at >= cells) break;
  }
  return mask;
}

/** Hex, and nothing else — `parseInt` would happily read "zz" as NaN and go on. */
function parseHex(text: string): number {
  if (!/^[0-9a-fA-F]+$/.test(text)) throw new Error(`not a hex number: ${text}`);
  return parseInt(text, 16);
}

/**
 * Sizes are powers of two from eight up, because skins are.
 *
 * A skin is 64 wide times a power of two — the game's own rule — so a face is
 * eight times the same power. Anything else came from a corrupt file and is
 * rounded down to something that at least cannot index off the end of an array.
 */
function clampSize(size: number): number {
  const wanted = Math.min(Math.max(Math.trunc(size) || SMALLEST, SMALLEST), LARGEST);
  let power = SMALLEST;
  while (power * 2 <= wanted) power *= 2;
  return power;
}
