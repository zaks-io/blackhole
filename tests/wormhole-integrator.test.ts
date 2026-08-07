/**
 * Physics accuracy guard for the ultrastatic wormhole integrator in
 * lib/shaders/chunks/wormhole.glsl.
 *
 * The shader integrates the planar null geodesics of a cylindrical neck
 * joined to Ellis mouths, r(l)^2 = b^2 + q(l)^2 where
 * q(l) = sign(l) max(|l| - a, 0), with RK4 on (l, dl/ds, phi):
 *   d^2l/ds^2 = L^2 * q / r^4,   dphi/ds = L / r^2
 * a = 0 is exactly the Ellis metric.
 * (James, von Tunzelmann, Franklin & Thorne, Am. J. Phys. 83, 486 (2015)).
 * shaderMarch() below ports the shader's adaptive stepping verbatim;
 * reference() integrates the same ODEs with a fine fixed step.
 *
 * Exact properties guarded here:
 *  - critical impact parameter equals the throat radius b: rays with p < b
 *    cross into the far universe, rays with p > b deflect and escape
 *  - weak-field deflection alpha ~= (pi/4) * (b/p)^2
 *  - conserved "energy" u^2 + L^2/r^2 = 1 along unit-speed rays
 */
import { describe, expect, test } from 'bun:test';

import { CONFIG } from '../lib/config';

const b = CONFIG.wormhole.throatRadius;
const bSq = b * b;

type State = [number, number, number]; // (l, u = dl/ds, phi)

function mouthQ(l: number, halfLength: number): number {
  return Math.sign(l) * Math.max(Math.abs(l) - halfLength, 0);
}

function radiusSq(l: number, halfLength: number): number {
  const q = mouthQ(l, halfLength);
  return bSq + q * q;
}

function deriv(s: State, L: number, halfLength: number): State {
  const q = mouthQ(s[0], halfLength);
  const rSq = bSq + q * q;
  return [s[1], (L * L * q) / (rSq * rSq), L / rSq];
}

function rk4Step(s: State, L: number, ds: number, halfLength: number): State {
  const k1 = deriv(s, L, halfLength);
  const k2 = deriv(
    [s[0] + 0.5 * ds * k1[0], s[1] + 0.5 * ds * k1[1], s[2] + 0.5 * ds * k1[2]],
    L,
    halfLength
  );
  const k3 = deriv(
    [s[0] + 0.5 * ds * k2[0], s[1] + 0.5 * ds * k2[1], s[2] + 0.5 * ds * k2[2]],
    L,
    halfLength
  );
  const k4 = deriv([s[0] + ds * k3[0], s[1] + ds * k3[1], s[2] + ds * k3[2]], L, halfLength);
  return [
    s[0] + (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    s[1] + (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    s[2] + (ds / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
  ];
}

interface RayResult {
  crossed: boolean; // ended in the far universe (l < 0)
  deflection: number; // escape-vs-launch angle, NaN if crossed
  energyDrift: number; // |(u^2 + L^2/r^2) - 1| at the end
  steps: number;
  phase: number;
}

/**
 * Launch geometry shared by both integrators: camera on the near side at
 * l0 = D, ray aimed at the throat with impact parameter p, so L = r0 * vt
 * with vt = p / r0 (for D >> b the impact parameter is L itself).
 */
function launch(
  p: number,
  D: number,
  halfLength: number
): { s: State; L: number; d0: [number, number] } {
  const r0 = Math.sqrt(radiusSq(D, halfLength));
  const vt = p / r0;
  const vr = -Math.sqrt(Math.max(0, 1 - vt * vt));
  return { s: [D, vr, 0], L: r0 * vt, d0: [vr, vt] };
}

/** In-plane escape direction from the final state (shader's reconstruction). */
function exitDir(s: State, L: number, halfLength: number): [number, number] {
  const rEnd = Math.sqrt(radiusSq(s[0], halfLength));
  const sideEnd = s[0] >= 0 ? 1 : -1;
  const cosP = Math.cos(s[2]);
  const sinP = Math.sin(s[2]);
  const x = sideEnd * s[1] * cosP + (L / rEnd) * -sinP;
  const y = sideEnd * s[1] * sinP + (L / rEnd) * cosP;
  const n = Math.hypot(x, y);
  return [x / n, y / n];
}

function finish(
  s: State,
  L: number,
  d0: [number, number],
  steps: number,
  halfLength: number
): RayResult {
  const crossed = s[0] < 0;
  const rEnd = Math.sqrt(radiusSq(s[0], halfLength));
  const energyDrift = Math.abs(s[1] * s[1] + (L * L) / (rEnd * rEnd) - 1);
  if (crossed) return { crossed, deflection: NaN, energyDrift, steps, phase: s[2] };
  const d = exitDir(s, L, halfLength);
  const dotDir = Math.min(1, Math.max(-1, d[0] * d0[0] + d[1] * d0[1]));
  return { crossed, deflection: Math.acos(dotDir), energyDrift, steps, phase: s[2] };
}

/** Fine fixed-step RK4 reference. */
function reference(p: number, D: number, dt = 0.01, halfLength = 0): RayResult {
  const { s: s0, L, d0 } = launch(p, D, halfLength);
  let s = s0;
  const escapeL = halfLength + Math.max(2 * Math.max(D - halfLength, 0), 25 * b);
  for (let i = 0; i < 2_000_000; i++) {
    if (Math.abs(s[0]) > escapeL && s[1] * Math.sign(s[0]) > 0) {
      return finish(s, L, d0, i, halfLength);
    }
    s = rk4Step(s, L, dt, halfLength);
  }
  throw new Error(`reference integrator did not terminate for p=${p}`);
}

/**
 * Faithful port of traceWormholeRay() in wormhole.glsl: same adaptive step
 * ds = 0.25 * max(r - b, 0.6 * b), same escape test, same RK4.
 */
function shaderMarch(p: number, D: number, maxSteps = 200_000, halfLength = 0): RayResult {
  const { s: s0, L, d0 } = launch(p, D, halfLength);
  let s = s0;
  const escapeL = halfLength + Math.max(2 * Math.max(Math.abs(D) - halfLength, 0), 25 * b);
  for (let i = 0; i < maxSteps; i++) {
    if (Math.abs(s[0]) > escapeL && s[1] * Math.sign(s[0]) > 0) {
      return finish(s, L, d0, i, halfLength);
    }
    const insideNeck =
      Math.abs(s[0]) < halfLength ||
      (halfLength > 0 && Math.abs(Math.abs(s[0]) - halfLength) < 1e-4 * b && s[0] * s[1] < 0);
    if (insideNeck && Math.abs(s[1]) > 1e-5) {
      const neckExit = Math.sign(s[1]) * halfLength;
      const travel = (neckExit - s[0]) / s[1];
      if (travel > 1e-6) {
        s = [neckExit, s[1], (s[2] + (travel * L) / bSq) % (2 * Math.PI)];
        continue;
      }
    }
    const r = Math.sqrt(radiusSq(s[0], halfLength));
    const ds = 0.25 * Math.max(r - b, 0.6 * b);
    s = rk4Step(s, L, ds, halfLength);
  }
  return finish(s, L, d0, maxSteps, halfLength);
}

/** Bisect the crossing boundary: lo must cross, hi must escape. */
function crossingBoundary(crosses: (p: number) => boolean, lo: number, hi: number): number {
  if (!crosses(lo)) throw new Error(`bisection bracket invalid: p=${lo} escaped`);
  if (crosses(hi)) throw new Error(`bisection bracket invalid: p=${hi} crossed`);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (crosses(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const D = 500;

describe('wormhole.glsl integrator vs RK4 reference', () => {
  test('rays inside the throat cross universes, outside rays stay', () => {
    expect(shaderMarch(0.5 * b, D).crossed).toBe(true);
    expect(shaderMarch(1.5 * b, D).crossed).toBe(false);
  });

  test('shader crossing boundary lands on b within 1%', () => {
    const pCrit = crossingBoundary((p) => shaderMarch(p, D).crossed, 0.5 * b, 1.5 * b);
    expect(Math.abs(pCrit - b) / b).toBeLessThan(0.01);
  });

  test('reference crossing boundary reproduces exact p_crit = b (self-check)', () => {
    const pCrit = crossingBoundary((p) => reference(p, D, 0.05).crossed, 0.5 * b, 1.5 * b);
    expect(Math.abs(pCrit - b) / b).toBeLessThan(0.005);
  });

  test.each([2, 3, 5, 10])('deflection within 5%% of reference at p = %d b', (mult) => {
    const p = mult * b;
    const ref = reference(p, D);
    const shader = shaderMarch(p, D);
    expect(ref.crossed).toBe(false);
    expect(shader.crossed).toBe(false);
    const relErr = Math.abs(shader.deflection - ref.deflection) / ref.deflection;
    expect(relErr).toBeLessThan(0.05);
  });

  test('weak-field deflection matches alpha = (pi/4)(b/p)^2 within 5%', () => {
    for (const mult of [10, 15, 20]) {
      const p = mult * b;
      const alpha = (Math.PI / 4) * (b / p) * (b / p);
      const ref = reference(p, D);
      expect(Math.abs(ref.deflection - alpha) / alpha).toBeLessThan(0.05);
    }
  });

  test('conserved energy u^2 + L^2/r^2 = 1 holds through the march', () => {
    for (const mult of [0.5, 0.9, 1.5, 5]) {
      expect(shaderMarch(mult * b, D).energyDrift).toBeLessThan(1e-3);
    }
  });

  test('app-view rays finish inside the shader maxSteps budget', () => {
    // Overview distances and the transit's throat-lip hold both matter;
    // near-critical rays wind the most and must leave budget for the
    // far-BH leg that shares the step pool
    for (const camDist of [1.2, 12, 30]) {
      for (const mult of [0.2, 0.7, 0.98, 1.02, 1.3, 3, 8]) {
        const result = shaderMarch(mult * b, camDist, CONFIG.rayMarching.maxSteps);
        expect(result.steps).toBeLessThan(CONFIG.rayMarching.maxSteps);
      }
    }
  });
});

describe('adjustable cylindrical throat', () => {
  const halfLength = CONFIG.wormhole.throatLength / 2;

  test('zero length is exactly the Ellis radial profile', () => {
    for (const l of [-100, -b, -0.1, 0, 0.1, b, 100]) {
      expect(radiusSq(l, 0)).toBe(bSq + l * l);
    }
  });

  test('neck has constant areal radius and joins both mouths continuously', () => {
    for (const l of [-halfLength, -0.5 * halfLength, 0, 0.5 * halfLength, halfLength]) {
      expect(radiusSq(l, halfLength)).toBe(bSq);
    }
    const epsilon = 1e-6;
    expect(radiusSq(halfLength + epsilon, halfLength)).toBeCloseTo(bSq, 10);
    expect(radiusSq(-halfLength - epsilon, halfLength)).toBeCloseTo(bSq, 10);
  });

  test('long throat keeps the exact critical impact parameter b', () => {
    const pCrit = crossingBoundary(
      (p) => shaderMarch(p, D, 200_000, halfLength).crossed,
      0.5 * b,
      1.5 * b
    );
    expect(Math.abs(pCrit - b) / b).toBeLessThan(0.01);
  });

  test('analytic neck advance agrees with a fine RK4 reference', () => {
    const p = 0.5 * b;
    const shader = shaderMarch(p, 30, 200_000, halfLength);
    const ref = reference(p, 30, 0.002, halfLength);
    expect(shader.crossed).toBe(true);
    expect(ref.crossed).toBe(true);
    expect(shader.energyDrift).toBeLessThan(1e-3);
    const phaseError = Math.abs(
      Math.atan2(Math.sin(shader.phase - ref.phase), Math.cos(shader.phase - ref.phase))
    );
    expect(phaseError).toBeLessThan(0.02);
  });

  test('neck length does not consume the ray-march step budget', () => {
    const short = shaderMarch(0.5 * b, 30, 200_000, 0);
    const long = shaderMarch(0.5 * b, 30, 200_000, 100 * b);
    expect(long.crossed).toBe(true);
    expect(long.steps).toBeLessThan(short.steps + 5);
  });
});
