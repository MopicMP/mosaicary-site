import { useEffect, useState } from 'react';

import { armsOfPixels, type Arms } from '../../shared/skinShape.js';

/**
 * Which model a skin was drawn for, read from the skin itself.
 *
 * <h2>Why in the browser at all</h2>
 *
 * Because there is nowhere else yet. When skins are uploaded rather than shipped
 * as samples, this is worked out once on the way in and kept beside the file — it
 * is a fact about the picture and it never changes. Until then the pictures are
 * already being loaded to draw them, so reading four small patches costs a canvas
 * and nothing else, and the rule doing the reading is the shared one that the
 * server will use later.
 *
 * <h2>Once per skin, not once per component</h2>
 *
 * A card, the figure inside it and the window all want the answer, and every one
 * of them would otherwise decode the picture again. The answer is kept against the
 * address, and anybody asking while it is being worked out waits on the same
 * promise rather than starting a second one.
 */

const known = new Map<string, Arms>();
const asking = new Map<string, Promise<Arms>>();

export function armsKnown(url: string): Arms | null {
  return known.get(url) ?? null;
}

export function armsOf(url: string): Promise<Arms> {
  const already = known.get(url);
  if (already) return Promise.resolve(already);
  const busy = asking.get(url);
  if (busy) return busy;

  const going = read(url)
    .then((arms) => {
      known.set(url, arms);
      return arms;
    })
    .finally(() => asking.delete(url));
  asking.set(url, going);
  return going;
}

async function read(url: string): Promise<Arms> {
  try {
    const picture = await load(url);
    const sheet = document.createElement('canvas');
    sheet.width = picture.width;
    sheet.height = picture.height;
    const paint = sheet.getContext('2d', { willReadFrequently: true });
    if (!paint) return 'wide';
    paint.drawImage(picture, 0, 0);
    const pixels = paint.getImageData(0, 0, picture.width, picture.height);
    return armsOfPixels(pixels.data, picture.width, picture.height);
  } catch {
    // A picture from another origin cannot be read back out of a canvas, and a
    // picture that did not load has nothing to read. Wide is the game's own
    // default and cannot make a skin look worse than it already does.
    return 'wide';
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((yes, no) => {
    const picture = new Image();
    picture.crossOrigin = 'anonymous';
    picture.onload = () => yes(picture);
    picture.onerror = () => no(new Error(url));
    picture.src = url;
  });
}

/**
 * The answer for a component, straight away if it is already known.
 *
 * Known-at-once matters: without it every figure draws itself with wide arms for a
 * frame and then again with narrow ones, and a grid of thirty of those flickers on
 * every scroll back to a card that has already been seen.
 */
export function useArms(url: string): Arms | null {
  const [arms, setArms] = useState<Arms | null>(() => armsKnown(url));

  useEffect(() => {
    const already = armsKnown(url);
    if (already) {
      setArms(already);
      return;
    }
    setArms(null);
    let alive = true;
    void armsOf(url).then((found) => {
      if (alive) setArms(found);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  return arms;
}

export type { Arms };
