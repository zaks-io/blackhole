import * as THREE from 'three';

import { CameraSequence } from '@/lib/camera';
import { CONFIG } from '@/lib/config';

// Wormhole transit geometry. Through-the-throat rays exit the far universe
// along the camera's own radial line (traceThroatLeg in wormhole.glsl), so
// the far black hole sits centered in the throat exactly when the camera is
// on the line from the origin toward the hole's chart position. The dive
// runs along that line, straight through the origin: the crossing reflection
// then maps the hole dead ahead of the camera, so the tracked view never has
// to whip. Positions assume an identity chart basis, which holds because
// starting a sequence re-anchors the chart to the near universe.
const TRANSIT_OVERVIEW = new THREE.Vector3(0, 2.5, 12);
const TRANSIT_FAR_BH = new THREE.Vector3().fromArray(CONFIG.wormhole.farBlackHolePosition);
const TRANSIT_AXIS = TRANSIT_FAR_BH.clone().normalize();

// Point on the dive axis, k units from the throat: positive k is the near
// side of the dive, negative k is past the crossing
function onAxis(k: number): { x: number; y: number; z: number } {
  return { x: TRANSIT_AXIS.x * k, y: TRANSIT_AXIS.y * k, z: TRANSIT_AXIS.z * k };
}

// Once the camera is aligned for the dive, track a fixed point beyond the
// throat instead of the apparent black-hole anchor. The apparent anchor is
// the throat center immediately before crossing and the distant black hole
// immediately after it. Both lie in the same direction, but the zero-to-far
// target-distance jump makes camera.lookAt numerically fragile at l = 0.
const TRANSIT_FAR_TARGET = onAxis(-TRANSIT_FAR_BH.length());

// Great-circle waypoint between the overview and the aligned dive start,
// holding the overview radius so the swing reads as an orbit of the throat
function arcPoint(t: number): { x: number; y: number; z: number } {
  const radius = TRANSIT_OVERVIEW.length();
  const from = TRANSIT_OVERVIEW.clone().normalize();
  const angle = from.angleTo(TRANSIT_AXIS);
  const a = Math.sin((1 - t) * angle) / Math.sin(angle);
  const b = Math.sin(t * angle) / Math.sin(angle);
  return {
    x: radius * (a * from.x + b * TRANSIT_AXIS.x),
    y: radius * (a * from.y + b * TRANSIT_AXIS.y),
    z: radius * (a * from.z + b * TRANSIT_AXIS.z),
  };
}

export const CAMERA_SEQUENCES: Record<string, CameraSequence> = {
  fallIn: {
    name: 'Fall In',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 10, z: 40 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 1.3, y: 1.3, z: 0 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power2.in',
      },
      {
        type: 'moveTo',
        position: { x: 1.3, y: 1.3, z: 8 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 4,
        ease: 'power2.out',
      },
    ],
  },

  warpingTour: {
    name: 'Warping Tour',
    steps: [
      {
        type: 'snapTo',
        position: { x: 4, y: 1, z: 3 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 2, y: 1, z: 2 },
        lookAt: { x: 1.6, y: 0, z: 0 },
        duration: 4,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 1.5, y: 0.3, z: 1.5 },
        lookAt: { x: 0, y: 0.3, z: 0 },
        duration: 4,
        ease: 'power1.in',
      },
      {
        type: 'moveTo',
        position: { x: 1.5, y: 0.01, z: 1.5 },
        lookAt: { x: -40, y: 0.01, z: 40 },
        duration: 8,
        ease: 'power1.out',
      },
      {
        type: 'moveTo',
        position: { x: 1.5, y: 10, z: 1.5 },
        lookAt: { x: -0.1, y: 0.01, z: 0.01 },
        duration: 16,
        ease: 'power1.inOut',
      },
    ],
  },

  shadowExplore: {
    name: 'Shadow Explore',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 0.3, z: 5 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 2, y: 1, z: 2 },
        lookAt: { x: 1.6, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0.01, z: 3 },
        lookAt: { x: 1.6, y: 0.01, z: 1.6 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0.3, z: 5 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
    ],
  },

  // Wormhole mode only. Overview of the throat, then an orbit at overview
  // radius until the far black hole's lensed image slides to the throat
  // center (the camera reaches the hole's own radial line), then a dive
  // straight along that line: decelerate to a near-stop at the throat lip so
  // the lensing morph is visible, cross gently, and keep flying to the hole.
  // Universe-crossing detection flips on the frame the position vector
  // reverses, which requires a path through the throat center. The approach
  // tracks the lensed far black hole until it is centered. The aligned dive
  // then holds a fixed far-side look target so crossing l = 0 cannot change
  // the camera orientation.
  wormholeTransit: {
    name: 'Wormhole Transit',
    steps: [
      {
        type: 'snapTo',
        position: { x: TRANSIT_OVERVIEW.x, y: TRANSIT_OVERVIEW.y, z: TRANSIT_OVERVIEW.z },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: arcPoint(1 / 3),
        lookAt: 'farBlackHole',
        duration: 3,
        ease: 'power1.in',
      },
      {
        type: 'moveTo',
        position: arcPoint(2 / 3),
        lookAt: 'farBlackHole',
        duration: 3,
        ease: 'none',
      },
      {
        type: 'moveTo',
        position: arcPoint(1),
        lookAt: 'farBlackHole',
        duration: 3,
        ease: 'power1.out',
      },
      {
        type: 'moveTo',
        position: onAxis(1.2),
        lookAt: 'farBlackHole',
        duration: 5,
        ease: 'power2.inOut',
      },
      {
        type: 'moveTo',
        position: onAxis(-10),
        lookAt: TRANSIT_FAR_TARGET,
        duration: 7,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: onAxis(-25),
        lookAt: TRANSIT_FAR_TARGET,
        duration: 8,
        ease: 'power1.out',
      },
    ],
  },
};
