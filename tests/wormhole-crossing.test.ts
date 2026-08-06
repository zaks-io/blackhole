/**
 * Guards the free-flight throat crossing pipeline:
 *
 * 1. bendStepThroughThroat (lib/camera/FlyCamera.ts) must funnel any inbound
 *    flight aimed inside the throat sphere through the exact origin, because
 *    the LensingPass universe flip only fires when consecutive camera
 *    positions straddle it (dot(prev, cur) < 0), and the chart map is only
 *    continuous for through-origin crossings.
 *
 * 2. The per-crossing chart reflection composed in LensingPass.updateCamera
 *    must keep the sky basis continuous on the crossing frame, including a
 *    return trip along a different axis (which a single frozen flip axis
 *    could not chart continuously).
 */
import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';

import { bendStepThroughThroat, ThroatCapture } from '../lib/camera/FlyCamera';
import { CONFIG } from '../lib/config';

const b = CONFIG.wormhole.throatRadius;

interface FlightResult {
  crossed: boolean;
  crossingPrev: THREE.Vector3 | null;
  crossingCur: THREE.Vector3 | null;
  positions: THREE.Vector3[];
}

/** Fly a straight line (direction fixed, like holding W) with the bend applied. */
function fly(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  stepLength: number,
  delta: number
): FlightResult {
  const pos = start.clone();
  const dir = direction.clone().normalize();
  const step = new THREE.Vector3();
  const capture: ThroatCapture = { active: false, ramp: 0 };
  const result: FlightResult = {
    crossed: false,
    crossingPrev: null,
    crossingCur: null,
    positions: [pos.clone()],
  };

  // Mirrors LensingPass.updateCamera detection, including its skip of
  // degenerate at-origin samples
  let detectorPrev = pos.clone();
  for (let i = 0; i < 2000; i++) {
    step.copy(dir).multiplyScalar(stepLength);
    bendStepThroughThroat(step, pos, b, capture, delta);
    pos.add(step);
    result.positions.push(pos.clone());

    if (!result.crossed && detectorPrev.dot(pos) < 0) {
      result.crossed = true;
      result.crossingPrev = detectorPrev.clone();
      result.crossingCur = pos.clone();
    }
    if (pos.lengthSq() > 1e-12) {
      detectorPrev = pos.clone();
    }
    // Well past the throat and moving away: flight over
    if (pos.length() > start.length() + 5 && pos.dot(dir) > 0) break;
  }
  return result;
}

describe('throat attractor', () => {
  // [per-frame step, frame delta]: speeds 10 and 30 at 60fps, speed 10 at 30fps
  const frames: [number, number][] = [
    [10 / 60, 1 / 60],
    [30 / 60, 1 / 60],
    [10 / 30, 1 / 30],
  ];

  test('inbound flights aimed anywhere inside the throat sphere cross the origin', () => {
    for (const [stepLength, delta] of frames) {
      for (const miss of [0, 0.5, 1.5, 2.9]) {
        const result = fly(
          new THREE.Vector3(miss, 0, 20),
          new THREE.Vector3(0, 0, -1),
          stepLength,
          delta
        );
        expect(result.crossed).toBe(true);
        // The flip frames must straddle the origin collinearly, i.e. the
        // crossing really threads the throat instead of clipping past it
        const prev = result.crossingPrev!;
        const cur = result.crossingCur!;
        const sinAngle = prev.clone().normalize().cross(cur.clone().normalize()).length();
        expect(sinAngle).toBeLessThan(1e-6);
      }
    }
  });

  test('flights aimed outside the throat sphere pass by without crossing', () => {
    for (const [stepLength, delta] of frames) {
      const result = fly(
        new THREE.Vector3(3.5, 0, 20),
        new THREE.Vector3(0, 0, -1),
        stepLength,
        delta
      );
      expect(result.crossed).toBe(false);
    }
  });

  test('bend preserves speed and ignores outbound steps', () => {
    const pos = new THREE.Vector3(1.0, 0.5, 2.0);

    const inbound = new THREE.Vector3(0.1, 0, -0.2);
    const bent = inbound.clone();
    bendStepThroughThroat(bent, pos, b, { active: false, ramp: 0 }, 1 / 60);
    expect(bent.length()).toBeCloseTo(inbound.length(), 10);

    const outbound = new THREE.Vector3(0.05, 0.02, 0.2);
    const untouched = outbound.clone();
    bendStepThroughThroat(untouched, pos, b, { active: false, ramp: 0 }, 1 / 60);
    expect(untouched.equals(outbound)).toBe(true);
  });
});

/** Reflection across the plane perpendicular to n (LensingPass crossing update) */
function reflection(n: THREE.Vector3): THREE.Matrix3 {
  const m = new THREE.Matrix3();
  m.set(
    1 - 2 * n.x * n.x,
    -2 * n.x * n.y,
    -2 * n.x * n.z,
    -2 * n.y * n.x,
    1 - 2 * n.y * n.y,
    -2 * n.y * n.z,
    -2 * n.z * n.x,
    -2 * n.z * n.y,
    1 - 2 * n.z * n.z
  );
  return m;
}

/**
 * Mirror of the wormhole.glsl chart setup for one ray: returns the mapped
 * plane basis (e1, e2) and signed initial conditions (l0, u0) that fully
 * determine the traced sky sample.
 */
function chartState(
  camPos: THREE.Vector3,
  rayDir: THREE.Vector3,
  side: number,
  basis: THREE.Matrix3
) {
  const camDist = camPos.length();
  const rHat = camPos.clone().divideScalar(camDist);
  const vr = rayDir.dot(rHat);
  const tang = rayDir.clone().addScaledVector(rHat, -vr);
  const vt = tang.length();
  const e1 = rHat.clone().applyMatrix3(basis);
  const e2 = tang.divideScalar(vt).applyMatrix3(basis);
  return { e1, e2, l0: side * camDist, u0: side * vr, vt };
}

describe('composed chart reflection', () => {
  test('sky basis is continuous across a crossing, including a second crossing on a different axis', () => {
    const eps = 0.05;
    // Ray fixed in world space (camera orientation does not change on the flip frame)
    const rayDir = new THREE.Vector3(0.3, 0.7, -0.648).normalize();

    let side = 1;
    const basis = new THREE.Matrix3().identity();

    // First crossing: flying along -z through the origin
    const axis1 = new THREE.Vector3(0, 0, 1);
    const before1 = chartState(axis1.clone().multiplyScalar(eps), rayDir, side, basis);
    side *= -1;
    basis.multiply(reflection(axis1));
    const after1 = chartState(axis1.clone().multiplyScalar(-eps), rayDir, side, basis);

    expect(after1.e1.distanceTo(before1.e1)).toBeLessThan(1e-12);
    expect(after1.e2.distanceTo(before1.e2)).toBeLessThan(1e-12);
    expect(after1.l0 + before1.l0).toBeCloseTo(0, 12); // both ~0, opposite signs
    expect(after1.u0).toBeCloseTo(before1.u0, 12);

    // Second crossing: returning through the throat along a different axis.
    // A frozen single flip axis cannot chart this continuously; the composed
    // reflection must.
    const axis2 = new THREE.Vector3(1, 2, -0.5).normalize();
    const before2 = chartState(axis2.clone().multiplyScalar(eps), rayDir, side, basis);
    side *= -1;
    basis.multiply(reflection(axis2));
    const after2 = chartState(axis2.clone().multiplyScalar(-eps), rayDir, side, basis);

    expect(after2.e1.distanceTo(before2.e1)).toBeLessThan(1e-12);
    expect(after2.e2.distanceTo(before2.e2)).toBeLessThan(1e-12);
    expect(after2.u0).toBeCloseTo(before2.u0, 12);
    expect(side).toBe(1); // back in the near universe

    // The composed map stays an isometry, so both skies remain rigid
    const shouldBeIdentity = basis.clone().multiply(basis.clone().transpose());
    expect(
      shouldBeIdentity.elements.every((v, i) => Math.abs(v - (i % 4 === 0 ? 1 : 0)) < 1e-12)
    ).toBe(true);
  });
});
