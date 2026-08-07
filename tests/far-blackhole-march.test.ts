/**
 * Step-budget guard for marchFarBlackHole() in lib/shaders/chunks/wormhole.glsl.
 *
 * The march runs on the shared leg pool of 2 * maxSteps, and maxSteps bottoms
 * out at autoStepsMin on high-resolution displays (SimulationController's
 * resolution-keyed autoSteps). marchSteps() below ports the shader's stepping
 * verbatim: same deflection kick, same clamp/growth step sizing, same slab
 * bound, same escape and capture tests.
 *
 * Properties guarded here:
 *  - every ray entering the influence sphere terminates (captures or escapes)
 *    within the 2 * autoStepsMin pool, so no ray sky-shades a mid-deflection
 *    direction (the "clipped" churning annulus around the shadow)
 *  - the worst ray needs more than a single autoStepsMin budget, so the march
 *    must keep drawing on the full shared pool rather than a per-leg cap
 */
import { describe, expect, test } from 'bun:test';

import { CONFIG } from '../lib/config';

const rs = CONFIG.rs;
const baseStepSize = CONFIG.rayMarching.baseStepSize;
const contentRadius = CONFIG.disk.outerRadius * 1.2;
const slabH = CONFIG.layers.thickDisk.enabled
  ? CONFIG.layers.thickDisk.halfThickness
  : CONFIG.disk.halfThickness;
// FAR_BH_INFLUENCE_RADII / FAR_BH_ESCAPE_RADII in wormhole.glsl
const ENTRY_R = 16 * rs;
const ESCAPE_R = 48 * rs;

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const normalize = (a: V3): V3 => scale(a, 1 / Math.sqrt(dot(a, a)));
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

interface MarchResult {
  captured: boolean;
  escaped: boolean;
  steps: number;
  endR: number;
}

/** Launch from the influence sphere with impact parameter p, inclined by
 *  incl radians out of the disk plane. */
function marchSteps(p: number, incl: number, budget: number): MarchResult {
  const vt = p / ENTRY_R;
  const vr = -Math.sqrt(Math.max(0, 1 - vt * vt));
  let pos: V3 = [ENTRY_R, 0, 0];
  let dir: V3 = normalize([vr, vt * Math.sin(incl), vt * Math.cos(incl)]);

  let captured = false;
  let escaped = false;
  let steps = 0;
  for (let i = 0; i < budget; i++) {
    steps++;
    const rSq = dot(pos, pos);
    const r = Math.sqrt(rSq);
    if (rSq < rs * rs) {
      captured = true;
      break;
    }
    const rHat = scale(pos, 1 / r);
    const radialVel = dot(dir, rHat);
    if (r > ESCAPE_R && radialVel > 0) {
      escaped = true;
      break;
    }
    const vPerpSq = 1 - radialVel * radialVel;
    const accel = (-1.5 * rs * vPerpSq) / rSq;
    let stepSize = clamp(baseStepSize * Math.max(1, (r - rs) / rs), 0.01, 0.75);
    let farDist = r - contentRadius;
    const slabDist = Math.max(Math.abs(pos[1]) - slabH, Math.hypot(pos[0], pos[2]) - contentRadius);
    farDist = Math.max(farDist, Math.min(slabDist, r - 5 * rs));
    stepSize = Math.max(stepSize, farDist * 0.25);
    dir = normalize(add(dir, scale(rHat, accel * stepSize)));
    pos = add(pos, scale(dir, stepSize));
  }
  return { captured, escaped, steps, endR: Math.sqrt(dot(pos, pos)) };
}

const IMPACT_SAMPLES = 320;
const INCLINATIONS = [0, 0.05, 0.2, 0.5, 1.0, 1.5];

function* entryRays(): Generator<[number, number]> {
  for (let pi = 0; pi <= IMPACT_SAMPLES; pi++) {
    const p = (pi / IMPACT_SAMPLES) * (ENTRY_R - 0.1);
    for (const incl of INCLINATIONS) yield [p, incl];
  }
}

describe('marchFarBlackHole step budget', () => {
  const pool = 2 * CONFIG.rayMarching.autoStepsMin;

  test('every entering ray terminates within the shared 2x step pool', () => {
    for (const [p, incl] of entryRays()) {
      const r = marchSteps(p, incl, pool);
      expect(r.captured || r.escaped).toBe(true);
    }
  });

  test('worst ray exceeds a single per-leg budget (keep the pool uncapped)', () => {
    let worst = 0;
    for (const [p, incl] of entryRays()) {
      worst = Math.max(worst, marchSteps(p, incl, 100000).steps);
    }
    expect(worst).toBeGreaterThan(CONFIG.rayMarching.autoStepsMin);
    expect(worst).toBeLessThanOrEqual(pool);
  });
});
