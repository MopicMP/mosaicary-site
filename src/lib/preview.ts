import * as THREE from 'three';

import { PREVIEW_MAX_BYTES } from '../../shared/modelRules.js';
import type { Figure } from './bbmodel3d.js';
import { ANGLED, FOV, fitTight, type Look } from './view3d.js';

/**
 * The picture on a model's card, drawn in the uploader's browser from the model itself.
 *
 * <h2>Why it is drawn here and not chosen</h2>
 *
 * Because a picture the uploader picks can be anything, and a card is a promise about
 * what is inside. Drawn from the file itself, the catalogue reads as a shelf of like
 * things, and the server only has to check that it was sent a picture of the right kind
 * and size.
 *
 * The angle is the author's, since the one angle every card used is the front of an
 * entity in the editor and the back of plenty of models made in it. It is the same
 * angle the model's own window opens at, so a card and the model behind it agree.
 *
 * <h2>Why the sizes step down</h2>
 *
 * WebP of a model on an empty background is small — a 512 pixel one is about forty
 * kilobytes — but a model with a busy high-resolution texture can come out several
 * times that. Rather than refuse, the picture is made again smaller, then at a lower
 * quality, until it fits. Safari does not encode WebP and hands back a PNG instead,
 * for which quality means nothing, so there only the size steps down.
 */

const STEPS: { size: number; quality: number }[] = [
  { size: 512, quality: 0.92 },
  { size: 512, quality: 0.8 },
  { size: 384, quality: 0.8 },
  { size: 384, quality: 0.65 },
  { size: 256, quality: 0.65 },
];

function blobOf(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

/**
 * The card picture of a figure at rest, or `null` when the browser cannot draw one or
 * nothing small enough came out.
 *
 * The figure is lent, not taken: it is moved into a scene of its own for the drawing
 * and handed back to wherever it hung before.
 */
export async function renderPreview(figure: Figure, look: Look = ANGLED): Promise<Blob | null> {
  if (figure.box.isEmpty()) return null;
  const canvas = document.createElement('canvas');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const owner = figure.root.parent;
  figure.rest();
  scene.add(figure.root);

  try {
    let png = false;
    let drawn = 0;
    for (const step of STEPS) {
      // A PNG is the same bytes at every quality; only a smaller size helps.
      if (png && step.size === drawn) continue;
      renderer.setSize(step.size, step.size, false);
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);
      fitTight(camera, figure.box, look);
      renderer.render(scene, camera);
      drawn = step.size;
      const blob = await blobOf(canvas, step.quality);
      if (!blob) continue;
      png = blob.type !== 'image/webp';
      if (blob.size <= PREVIEW_MAX_BYTES) return blob;
    }
    return null;
  } finally {
    scene.remove(figure.root);
    owner?.add(figure.root);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
