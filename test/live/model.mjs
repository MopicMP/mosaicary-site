/**
 * Writes a .bbmodel for the live checks to upload.
 *
 * The checks that need a model file — the upload window, the card picture, the angle
 * an author chooses — need a model whose sides can be told apart on a screenshot, and
 * nobody's own work for that. So the file is made here: a post with a spur to the
 * south and a bar to the east, both hidden from the view every model used to open at
 * and both plain the moment it is turned round. One bone and one animation, so the
 * animations tab has something in it.
 *
 *   node test/live/model.mjs ../.wrangler/live-state/pointer.bbmodel
 *
 * The texture is drawn here too, four colours in quadrants, so that which way the
 * model is facing reads off a still picture without counting cubes.
 *
 * Run on its own it writes the plain pointer, the same bytes it always wrote. Asked for
 * by another check it gives back the project itself, with two things that can be
 * changed: a mark, which is a cube nobody looks at, put somewhere different every run
 * so that the fingerprints differ; and a repaint, which leaves every cube where it is
 * and changes only the picture, which is the one case the site treats as its own thing
 * — same shape, different print.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

/** CRC-32, which every PNG chunk carries. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(kind, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

const QUARTERS = [
  [226, 86, 86],
  [86, 140, 226],
  [226, 198, 86],
  [120, 200, 130],
];

/** The same four colours put in another order: a repaint, and nothing else. */
const REPAINTED = [QUARTERS[3], QUARTERS[2], QUARTERS[1], QUARTERS[0]];

/** A 16 by 16 picture in four colours, one to a quarter. */
function texture(colours = QUARTERS) {
  const side = 16;
  const rows = [];
  for (let y = 0; y < side; y++) {
    const row = Buffer.alloc(1 + side * 3);
    for (let x = 0; x < side; x++) {
      const colour = colours[(y < side / 2 ? 0 : 2) + (x < side / 2 ? 0 : 1)];
      row[1 + x * 3] = colour[0];
      row[2 + x * 3] = colour[1];
      row[3 + x * 3] = colour[2];
    }
    rows.push(row);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(side, 0);
  head.writeUInt32BE(side, 4);
  head[8] = 8;
  head[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return 'data:image/png;base64,' + png.toString('base64');
}

const BONE = 'b0000000-0000-4000-8000-000000000001';
const BODY = 'c0000000-0000-4000-8000-000000000001';
const SPUR = 'c0000000-0000-4000-8000-000000000002';
const BAR = 'c0000000-0000-4000-8000-000000000003';
const MARK = 'c0000000-0000-4000-8000-000000000004';
const SKIN = 't0000000-0000-4000-8000-000000000001';

/**
 * The six faces, each one naming the only texture there is.
 *
 * Written out rather than left off: a face with no texture named is a face with nothing
 * to show, and the reader paints those in a flat marker colour. With box UV the corners
 * are worked out from the cube's size, so the numbers here are only a place to put.
 */
const faces = () =>
  Object.fromEntries(
    ['north', 'east', 'south', 'west', 'up', 'down'].map((side) => [side, { uv: [0, 0, 0, 0], texture: 0 }]),
  );

const cube = (uuid, name, from, to, offset) => ({
  name,
  box_uv: true,
  uv_offset: offset,
  rescale: false,
  locked: false,
  from,
  to,
  autouv: 0,
  color: 0,
  origin: [0, 0, 0],
  faces: faces(),
  uuid,
});

/**
 * The pointer, built fresh.
 *
 * `mark` is a number up to 32767, taken apart into three offsets, so that a run can ask
 * for a model nothing in the catalogue has ever seen. Left out, there is no mark cube
 * at all and the file is the one this script has always written.
 */
export function pointerProject({ mark = 0, repaint = false, name = 'Указатель' } = {}) {
  const marked = Number.isInteger(mark) && mark > 0;
  const dx = mark % 32;
  const dy = (mark >> 5) % 32;
  const dz = (mark >> 10) % 32;
  const elements = [
    // North and west are what the old opening view showed, and both are bare.
    cube(BODY, 'Столб', [-4, 0, -4], [4, 16, 4], [0, 0]),
    cube(SPUR, 'Шип на юг', [-2, 10, 4], [2, 14, 10], [0, 0]),
    cube(BAR, 'Перекладина на восток', [4, 2, -2], [10, 6, 2], [0, 0]),
  ];
  if (marked) {
    elements.push(cube(MARK, 'Метка прогона', [dx, 16 + dy, dz], [dx + 2, 18 + dy, dz + 2], [0, 0]));
  }
  return {
    meta: { format_version: '4.5', model_format: 'free', box_uv: true },
    name,
    resolution: { width: 16, height: 16 },
    elements,
    outliner: [
      {
        name: 'Указатель',
        origin: [0, 0, 0],
        uuid: BONE,
        export: true,
        isOpen: true,
        visibility: true,
        children: marked ? [BODY, SPUR, BAR, MARK] : [BODY, SPUR, BAR],
      },
    ],
    textures: [
      {
        path: '',
        name: 'quarters.png',
        folder: '',
        namespace: '',
        id: '0',
        width: 16,
        height: 16,
        uv_width: 16,
        uv_height: 16,
        particle: false,
        visible: true,
        mode: 'bitmap',
        saved: false,
        uuid: SKIN,
        source: texture(repaint ? REPAINTED : QUARTERS),
      },
    ],
    animations: ANIMATIONS,
  };
}

const ANIMATIONS = [
  {
    uuid: 'a0000000-0000-4000-8000-000000000001',
    name: 'turn',
    loop: 'loop',
    override: false,
    length: 2,
    snapping: 24,
    animators: {
      [BONE]: {
        name: 'Указатель',
        type: 'bone',
        keyframes: [
          {
            channel: 'rotation',
            data_points: [{ x: '0', y: '0', z: '0' }],
            uuid: 'k0000000-0000-4000-8000-000000000001',
            time: 0,
            color: -1,
            interpolation: 'linear',
          },
          {
            channel: 'rotation',
            data_points: [{ x: '0', y: '360', z: '0' }],
            uuid: 'k0000000-0000-4000-8000-000000000002',
            time: 2,
            color: -1,
            interpolation: 'linear',
          },
        ],
      },
    },
  },
];

/** The file itself, written only when this script is the one that was run. */
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const where = argv[2] ?? 'pointer.bbmodel';
  writeFileSync(where, JSON.stringify(pointerProject()));
  console.log(`Модель записана: ${where}`);
}
