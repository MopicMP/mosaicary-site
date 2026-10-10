import { createHash } from 'node:crypto';

/**
 * Whether a lump of bytes is a skin, decided without decoding it.
 *
 * <h2>Why the check is here as well as in the browser</h2>
 *
 * Because a check only in the browser is not a check. The page that does it is the
 * page an attacker replaced; the request can be sent by anything at all. What the
 * browser's copy buys is a person told immediately rather than after a four-megabyte
 * upload — which is a courtesy, not a defence.
 *
 * <h2>Why the header is enough</h2>
 *
 * A PNG announces its size in the first twenty-four bytes, and everything that
 * matters here — is it a PNG, what shape is it — is in there. Decoding the pixels
 * would mean running an inflater over whatever somebody sent, which is the part of
 * an image library that has the interesting bugs in it. Reading eight fields of a
 * fixed-position header cannot do anything but succeed or fail.
 *
 * <h2>The rules, and where they come from</h2>
 *
 * They are the mod's rules, on purpose. {@code SkinBytes.refuse} in the game
 * refuses the same files for the same reasons; a limit that differs between two
 * ends of a transfer is a transfer that fails halfway, and it always fails on the
 * end that already did the work.
 */

/** Four megabytes, the same number the mod uses. */
export const LARGEST = 4 * 1024 * 1024;

/** Sixty-four wide, doubling. Beyond this the game will not use the detail. */
export const WIDEST = 2048;

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface Shape {
  width: number;
  height: number;
  /** 64 for a modern skin, 32 for the layout from before 1.8. */
  layout: 64 | 32;
  /** SHA-256 of the file, first thirty-two hex digits — the mod's own address. */
  fingerprint: string;
}

/** Why a file was refused, in words a person can act on, or nothing if it was not. */
export function refuse(bytes: Buffer): string | null {
  if (bytes.length === 0) return 'файл пустой';
  if (bytes.length > LARGEST) {
    return `файл больше 4 МБ (${Math.round(bytes.length / 1024)} КБ)`;
  }
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) {
    return 'это не PNG';
  }
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    return 'PNG без заголовка IHDR';
  }

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 64 || width > WIDEST) return `ширина ${width}: нужно от 64 до ${WIDEST}`;
  // Sixty-four times a power of two, which is the game's own rule for a skin.
  if ((width & (width - 1)) !== 0) return `ширина ${width} — не степень двойки`;
  if (height !== width && height !== width / 2) {
    return `${width}×${height}: высота должна равняться ширине или её половине`;
  }
  return null;
}

/** The shape of a file already known to be a skin. */
export function shapeOf(bytes: Buffer): Shape {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return {
    width,
    height,
    layout: height * 2 <= width ? 32 : 64,
    fingerprint: createHash('sha256').update(bytes).digest('hex').slice(0, 32),
  };
}
