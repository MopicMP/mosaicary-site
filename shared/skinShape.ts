/**
 * Which of the two arm widths a skin was drawn for.
 *
 * <h2>Why this has to be worked out rather than asked</h2>
 *
 * Minecraft has two player models — four-pixel arms and three-pixel arms — and a
 * PNG says nothing about which one it is for. Draw a three-pixel skin on a
 * four-pixel model and the extra column samples texture that was never filled in,
 * so the arms come out with a transparent stripe down the back of them. That is
 * exactly what it looks like, and it looks like a broken file rather than like the
 * wrong model.
 *
 * The game itself does not work it out either: it stores the choice against the
 * account. A catalogue has no account to ask, so it has to read the picture.
 *
 * <h2>How it is read</h2>
 *
 * The two layouts pack the arm's six faces into a cross of different width — 4+4+
 * 4+4 against 4+3+4+3 — so a narrow-armed skin simply never touches certain
 * columns. Four small patches are unused by the narrow layout and used by the wide
 * one. All four blank means narrow.
 *
 * <h2>Where it is wrong, and what it does then</h2>
 *
 * A wide skin that happens to leave those columns empty reads as narrow. That
 * means a skin whose arms are transparent along their back edge — rare, and drawn
 * by somebody who left the file half done. Against it: every narrow skin in
 * existence has those columns empty, because the layout gives them nothing to
 * hold.
 *
 * When the arm is blank altogether there is nothing to tell from, and the answer
 * is wide: that is the older layout, the game's own default, and the one that
 * cannot make a skin worse than it already is.
 */

export type Arms = 'wide' | 'slim';

/** Anything under this counts as nothing drawn — antialiasing leaves stray 1s. */
const CLEAR = 8;

/**
 * Patches the narrow layout never uses, in sixty-fourths of a skin.
 *
 * Right arm first, then left. The left arm exists only on the taller layout; the
 * half-height one from before 1.8 has no left arm at all and is always wide.
 */
const ONLY_WIDE: { x: number; y: number; w: number; h: number }[] = [
  { x: 54, y: 20, w: 2, h: 12 }, // right arm, the far side of its back face
  { x: 50, y: 16, w: 2, h: 4 }, // right arm, the far side of its underside
  { x: 46, y: 52, w: 2, h: 12 }, // left arm, likewise
  { x: 42, y: 48, w: 2, h: 4 },
];

/** Where the arm certainly is drawn, if it is drawn at all. */
const ARM_FRONT = { x: 44, y: 20, w: 4, h: 12 };

/**
 * @param alphaAt how see-through a pixel is, 0 to 255, in sixty-fourths of a skin
 * @param tall 64 for a modern skin, 32 for the layout from before 1.8
 */
export function armsIn(alphaAt: (x: number, y: number) => number, tall: number): Arms {
  if (tall < 64) return 'wide';

  // A blank arm tells nothing, and guessing narrow from it would put a stripe of
  // nothing down a skin that never asked for one.
  if (!anyInk(alphaAt, ARM_FRONT)) return 'wide';

  for (const patch of ONLY_WIDE) {
    if (anyInk(alphaAt, patch)) return 'wide';
  }
  return 'slim';
}

function anyInk(
  alphaAt: (x: number, y: number) => number,
  patch: { x: number; y: number; w: number; h: number },
): boolean {
  for (let y = patch.y; y < patch.y + patch.h; y++) {
    for (let x = patch.x; x < patch.x + patch.w; x++) {
      if (alphaAt(x, y) >= CLEAR) return true;
    }
  }
  return false;
}

/**
 * The same question asked of raw pixels.
 *
 * Takes the picture at whatever size it really is and samples in sixty-fourths, so
 * an HD skin is read by the same rule as an ordinary one rather than by a second
 * copy of it with the numbers multiplied.
 */
export function armsOfPixels(rgba: Uint8ClampedArray, width: number, height: number): Arms {
  const scale = Math.max(1, Math.round(width / 64));
  const tall = Math.round(height / scale);
  const alphaAt = (x: number, y: number) => {
    // The middle of the block, so a single stray pixel at an edge decides nothing.
    const px = Math.min(width - 1, x * scale + (scale >> 1));
    const py = Math.min(height - 1, y * scale + (scale >> 1));
    return rgba[(py * width + px) * 4 + 3] ?? 0;
  };
  return armsIn(alphaAt, tall);
}
