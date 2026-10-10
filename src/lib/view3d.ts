import * as THREE from 'three';

import { MOST_TILT } from '../../shared/modelRules.js';
import type { Look } from '../../shared/modelWire.js';

/**
 * Where the camera stands for a model, shared by the card picture and the window, so
 * that a model opened from its card turns up at the angle its card showed it at.
 *
 * The angle itself is described beside the rest of a model's data, since an author
 * chooses it and the server keeps it; here is only what is done with it.
 */

export type { Look };

/**
 * Blockbench's own opening view: from the north-west, a little under thirty degrees
 * up — the front and left side of an entity, which faces north in the editor.
 */
export const ANGLED: Look = { spin: (-3 * Math.PI) / 4, tilt: 0.515 };

/** Narrower than Blockbench's forty-five, so a long model is not a fish-eye of itself. */
export const FOV = 35;

/** Short of straight down: overhead is a view of a roof and nothing else. */
export { MOST_TILT };

/** From the model towards the camera. */
export function towards(look: Look): THREE.Vector3 {
  const level = Math.cos(look.tilt);
  return new THREE.Vector3(Math.sin(look.spin) * level, Math.sin(look.tilt), Math.cos(look.spin) * level);
}

/**
 * The camera at `look`, far enough back that the whole ball around the model is in
 * view from every side.
 *
 * Measured against the ball and not the box, so that turning the model does not move
 * the camera in and out under the hand turning it.
 */
export function fitAround(camera: THREE.PerspectiveCamera, box: THREE.Box3, look: Look, closer = 1): void {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const narrowest = Math.min(half, Math.atan(Math.tan(half) * camera.aspect));
  const distance = radius / Math.sin(narrowest) / closer;
  place(camera, center, look, distance, radius);
}

/**
 * The camera at `look`, as close as it can come with every corner of the box still in
 * the picture, and the picture centred on what it shows.
 *
 * For a still picture, where nothing turns and every pixel of empty margin is a pixel
 * the model does not get. Three passes: each moves the aim to the middle of what the
 * last one saw, which in perspective is not quite where the box's own middle lands.
 */
export function fitTight(camera: THREE.PerspectiveCamera, box: THREE.Box3, look: Look, margin = 0.06): void {
  const back = towards(look);
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));

  let aim = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.5);
  const tanUp = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (1 - margin);
  const tanSide = tanUp * camera.aspect;
  let distance = radius * 3;

  for (let pass = 0; pass < 3; pass++) {
    place(camera, aim, look, distance, radius);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    distance = 0;
    const seen = corners.map((corner) => {
      const from = corner.clone().sub(aim);
      return { x: from.dot(right), y: from.dot(up), z: from.dot(back) };
    });
    for (const { x, y, z } of seen) {
      distance = Math.max(distance, z + Math.abs(x) / tanSide, z + Math.abs(y) / tanUp);
    }
    let [left, rightmost, low, high] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const { x, y, z } of seen) {
      const sx = x / (distance - z);
      const sy = y / (distance - z);
      left = Math.min(left, sx);
      rightmost = Math.max(rightmost, sx);
      low = Math.min(low, sy);
      high = Math.max(high, sy);
    }
    aim = aim
      .clone()
      .addScaledVector(right, ((left + rightmost) / 2) * distance)
      .addScaledVector(up, ((low + high) / 2) * distance);
  }
  place(camera, aim, look, distance, radius);
}

function place(camera: THREE.PerspectiveCamera, aim: THREE.Vector3, look: Look, distance: number, radius: number) {
  camera.position.copy(aim).addScaledVector(towards(look), distance);
  camera.up.set(0, 1, 0);
  camera.lookAt(aim);
  camera.near = Math.max(0.01, distance - radius * 2) / 4;
  camera.far = distance + radius * 4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
