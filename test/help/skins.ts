import { PNG } from 'pngjs';

/**
 * Skins made to order, for the tests that need real files.
 *
 * Not a `.test.ts` file on purpose: a helper that is also a test file gets its
 * cases run a second time inside whatever imports it, which is a confusing way to
 * discover that two suites share a fixture.
 */

/**
 * A skin as a real PNG, drawn by a function of x and y.
 *
 * Real files rather than headers, because this is the one place that decodes them
 * — and a test that hands the decoder something no decoder ever produced proves
 * nothing about what happens to a file somebody actually saved.
 */
export function draw(
  paint: (x: number, y: number) => [number, number, number, number],
  side = 64,
): Buffer {
  const png = new PNG({ width: side, height: side });
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const at = (y * side + x) * 4;
      const [r, g, b, a] = paint(x, y);
      png.data[at] = r;
      png.data[at + 1] = g;
      png.data[at + 2] = b;
      png.data[at + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

/** Something with enough going on in it to be a picture rather than a flat field. */
export const character = (x: number, y: number): [number, number, number, number] => {
  if (x < 8 || x > 55 || y < 8 || y > 55) return [0, 0, 0, 0];
  return [(x * 4) % 256, (y * 3 + 40) % 256, ((x + y) * 5) % 256, 255];
};

