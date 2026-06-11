/**
 * Physics accuracy guard for the ray-marching integrator in
 * lib/shaders/chunks/raymarcher.glsl and the relativistic g-factor in
 * lib/shaders/chunks/disk.glsl.
 *
 * The shader integrates light deflection with the pseudo-Newtonian force
 * a = -1.5 * rs * v_perp^2 / r^2, which reproduces the Schwarzschild Binet
 * equation u'' + u = 1.5 * rs * u^2 when integrated on (pos, vel) without
 * renormalizing the reference velocity. shaderMarch() below ports the
 * shader's stepping rules verbatim; reference() is a high-precision RK4
 * integration of the equivalent conserved-angular-momentum force
 * a = -1.5 * rs * h_ang^2 * r_vec / r^5.
 *
 * Critically, the shader applies the velocity kick scaled by the SAME
 * stepSize the ray advances by. A mismatched kick (fixed baseStepSize
 * instead of stepSize) underdeflects rays by 5-10x and fails the
 * deflection tolerances here.
 */
import { describe, expect, test } from 'bun:test';

import { CONFIG } from '../lib/config';

const rs = CONFIG.rs;

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const norm = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 => {
  const n = norm(a);
  return [a[0] / n, a[1] / n, a[2] / n];
};

interface RayResult {
  escaped: boolean;
  deflection: number;
}

/**
 * Launch geometry shared by both integrators: ray starts at distance D with
 * impact parameter b, travelling in -z. Deflection is the angle between the
 * escape direction and the initial direction.
 */
const START_DISTANCE = 500;

/** RK4 reference: a = -1.5 * rs * h_ang^2 * r_vec / r^5, h_ang conserved. */
function reference(b: number, dt = 0.002): RayResult {
  let p: V3 = [b, 0, START_DISTANCE];
  let v: V3 = [0, 0, -1];
  const cross: V3 = [
    p[1] * v[2] - p[2] * v[1],
    p[2] * v[0] - p[0] * v[2],
    p[0] * v[1] - p[1] * v[0],
  ];
  const hAngSq = dot(cross, cross);
  const acc = (q: V3): V3 => {
    const r2 = dot(q, q);
    const k = (-1.5 * rs * hAngSq) / (r2 * r2 * Math.sqrt(r2));
    return [k * q[0], k * q[1], k * q[2]];
  };
  for (let i = 0; i < 4_000_000; i++) {
    const r = norm(p);
    if (r < rs * 1.0001) return { escaped: false, deflection: NaN };
    if (r > 2.5 * START_DISTANCE && dot(v, p) > 0) {
      return { escaped: true, deflection: Math.acos(Math.min(1, -unit(v)[2])) };
    }
    const k1v = acc(p);
    const k1p = v;
    const k2v = acc(add(p, k1p, dt / 2));
    const k2p = add(v, k1v, dt / 2);
    const k3v = acc(add(p, k2p, dt / 2));
    const k3p = add(v, k2v, dt / 2);
    const k4v = acc(add(p, k3p, dt));
    const k4p = add(v, k3v, dt);
    p = [
      p[0] + (dt / 6) * (k1p[0] + 2 * k2p[0] + 2 * k3p[0] + k4p[0]),
      p[1] + (dt / 6) * (k1p[1] + 2 * k2p[1] + 2 * k3p[1] + k4p[1]),
      p[2] + (dt / 6) * (k1p[2] + 2 * k2p[2] + 2 * k3p[2] + k4p[2]),
    ];
    v = [
      v[0] + (dt / 6) * (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]),
      v[1] + (dt / 6) * (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1]),
      v[2] + (dt / 6) * (k1v[2] + 2 * k2v[2] + 2 * k3v[2] + k4v[2]),
    ];
  }
  throw new Error(`reference integrator did not terminate for b=${b}`);
}

/**
 * Faithful port of the traceRay() stepping rules in raymarcher.glsl
 * (single-BH path, jitter off, disk-classification stepMultiplier omitted:
 * it only inflates steps already capped by the 0.75 clamp / far-field rule).
 */
function shaderMarch(b: number): RayResult {
  let p: V3 = [b, 0, START_DISTANCE];
  let v: V3 = [0, 0, -1];
  const h = CONFIG.rayMarching.baseStepSize;
  const curvatureAdaptation = CONFIG.rayMarching.curvatureAdaptation;
  const contentRadius = CONFIG.disk.outerRadius * 1.2;
  const escapeThreshold = Math.max(2 * START_DISTANCE, 100);

  for (let i = 0; i < 200_000; i++) {
    const rSq = dot(p, p);
    const r = Math.sqrt(rSq);
    if (rSq < rs * rs) return { escaped: false, deflection: NaN };

    const rHat = unit(p);
    const radialVel = dot(v, rHat);
    if (r > escapeThreshold && radialVel > 0) {
      return { escaped: true, deflection: Math.acos(Math.min(1, -unit(v)[2])) };
    }

    const vPerpSq = 1 - radialVel * radialVel;
    const accel = (-1.5 * rs * vPerpSq) / rSq;

    const baseStep = h * Math.max(1, (r - rs) / rs);
    const photonSphereCurvature = (1.5 * rs) / (2.25 * rs * rs);
    const normalizedCurvature = Math.min(1, Math.max(0, Math.abs(accel) / photonSphereCurvature));
    const minMultiplier = Math.max(0.15, 0.4 - curvatureAdaptation * 0.1);
    const adaptWeight = Math.min(
      1,
      Math.max(0, normalizedCurvature * normalizedCurvature * curvatureAdaptation)
    );
    const curvatureMultiplier = 1 + (minMultiplier - 1) * adaptWeight;

    let stepSize = baseStep * curvatureMultiplier;
    stepSize = Math.min(0.75, Math.max(0.01, stepSize));
    stepSize = Math.max(stepSize, (r - contentRadius) * 0.25);

    v = unit(add(v, rHat, accel * stepSize));
    p = add(p, v, stepSize);
  }
  throw new Error(`shader integrator did not terminate for b=${b}`);
}

/** Bisect the capture boundary: lo must be captured, hi must escape. */
function captureBoundary(captured: (b: number) => boolean, lo = 2.0, hi = 3.2): number {
  if (!captured(lo)) throw new Error(`bisection bracket invalid: b=${lo} escaped`);
  if (captured(hi)) throw new Error(`bisection bracket invalid: b=${hi} captured`);
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (captured(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Exact critical impact parameter for Schwarzschild: (3*sqrt(3)/2) * rs. */
const B_CRIT = ((3 * Math.sqrt(3)) / 2) * rs;

describe('raymarcher.glsl integrator vs RK4 reference', () => {
  test.each([4, 6, 10, 20])('deflection within 5%% of reference at b = %d rs', (b) => {
    const ref = reference(b);
    const shader = shaderMarch(b);
    expect(ref.escaped).toBe(true);
    expect(shader.escaped).toBe(true);
    const relErr = Math.abs(shader.deflection - ref.deflection) / ref.deflection;
    expect(relErr).toBeLessThan(0.05);
  });

  test('shader capture boundary within 3% of exact b_crit = 2.598 rs', () => {
    const bCapture = captureBoundary((b) => !shaderMarch(b).escaped);
    expect(Math.abs(bCapture - B_CRIT) / B_CRIT).toBeLessThan(0.03);
  });

  test('reference capture boundary reproduces exact b_crit (self-check)', () => {
    // Coarser dt keeps near-critical orbits cheap; still converges to <0.5%
    const bCapture = captureBoundary((b) => !reference(b, 0.005).escaped);
    expect(Math.abs(bCapture - B_CRIT) / B_CRIT).toBeLessThan(0.005);
  });
});

describe('disk.glsl relativistic g-factor', () => {
  // Mirrors sampleDisk(): g = sqrt(1 - 1.5*rs/r) / (1 - Omega*bz) with
  // Keplerian Omega = sqrt(0.5*rs/r^3) and the same 0.15 denominator floor.
  const gFactor = (r: number, bz: number) => {
    const omega = Math.sqrt((0.5 * rs) / (r * r * r));
    const dopplerTerm = Math.max(0.15, 1 - omega * bz);
    return Math.sqrt(Math.max(0, 1 - (1.5 * rs) / r)) / dopplerTerm;
  };

  test('g = sqrt(0.5) at the ISCO (r = 3rs) for bz = 0', () => {
    expect(gFactor(3 * rs, 0)).toBeCloseTo(Math.sqrt(0.5), 12);
  });

  test('prograde photons (Omega*bz > 0) blueshift, retrograde redshift', () => {
    const r = 5 * rs;
    expect(gFactor(r, 2)).toBeGreaterThan(gFactor(r, 0));
    expect(gFactor(r, -2)).toBeLessThan(gFactor(r, 0));
  });

  test('g vanishes at the photon sphere orbit radius', () => {
    expect(gFactor(1.5 * rs, 0)).toBe(0);
  });

  // Mirrors the m=1 eccentric extension in sampleDisk(): the azimuthal
  // Doppler term picks up (1 + 0.5*e*cos f) and a radial term
  // v_r * dot(rayDir, rHat) with v_r = sqrt(0.5*rs/r) * e*sin f, following
  // the same dopplerTerm = 1 - v.rayDir convention as the circular case.
  const gFactorEcc = (r: number, bz: number, ecc: number, f: number, rayDotRhat: number) => {
    const eccCosF = ecc * Math.cos(f);
    const eccSinF = ecc * Math.sin(f);
    const omega = Math.sqrt((0.5 * rs) / (r * r * r));
    const radialDoppler = Math.sqrt((0.5 * rs) / r) * eccSinF * rayDotRhat;
    const dopplerTerm = Math.max(0.15, 1 - omega * bz * (1 + 0.5 * eccCosF) - radialDoppler);
    return Math.sqrt(Math.max(0, 1 - (1.5 * rs) / r)) / dopplerTerm;
  };

  test('eccentric g-factor reduces to circular at e = 0', () => {
    for (const r of [3 * rs, 5 * rs, 10 * rs]) {
      for (const bz of [-2, 0, 2]) {
        expect(gFactorEcc(r, bz, 0, 1.234, 0.7)).toBeCloseTo(gFactor(r, bz), 12);
      }
    }
  });

  test('g still vanishes at the photon sphere with eccentricity on', () => {
    expect(gFactorEcc(1.5 * rs, 1, 0.3, 0.9, 0.5)).toBe(0);
  });

  test('radial Doppler shifts symmetrically around the circular value', () => {
    const r = 5 * rs;
    const e = 0.2;
    const circular = gFactor(r, 1);
    // f = pi/2: pure radial motion (eccCosF = 0), so flipping either the
    // ray projection or the radial phase mirrors blueshift <-> redshift
    const blue = gFactorEcc(r, 1, e, Math.PI / 2, 1);
    const red = gFactorEcc(r, 1, e, Math.PI / 2, -1);
    expect(blue).toBeGreaterThan(circular);
    expect(red).toBeLessThan(circular);
    expect(gFactorEcc(r, 1, e, -Math.PI / 2, 1)).toBeCloseTo(red, 12);
  });

  test('apsis phase modulates the azimuthal Doppler term', () => {
    const r = 5 * rs;
    const e = 0.2;
    // f = 0: no radial motion, azimuthal term scaled by (1 + 0.5e),
    // so prograde blueshift strengthens and retrograde redshift deepens
    expect(gFactorEcc(r, 2, e, 0, 0)).toBeGreaterThan(gFactor(r, 2));
    expect(gFactorEcc(r, -2, e, 0, 0)).toBeLessThan(gFactor(r, -2));
  });

  test('eccentricity tapers to zero at both disk edges', () => {
    // Mirrors ecc = e * smoothstep(inner, 2*inner, r)
    //               * (1 - smoothstep(inner + 0.45*range, inner + 0.8*range, r))
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const inner = CONFIG.disk.innerRadius;
    const outer = CONFIG.disk.outerRadius;
    const range = outer - inner;
    const taper = (r: number) =>
      smoothstep(inner, 2 * inner, r) *
      (1 - smoothstep(inner + 0.45 * range, inner + 0.8 * range, r));

    // Circular at the ISCO and at the outer edge, eccentric in between
    expect(taper(inner)).toBe(0);
    expect(taper(outer)).toBe(0);
    expect(taper(2 * inner)).toBe(1);
    expect(taper(1.5 * inner)).toBeGreaterThan(0);
    expect(taper(1.5 * inner)).toBeLessThan(1);

    // Zero before the alpha outer fade begins (outer - 0.25*range), so the
    // disk silhouette stays centered on the hole
    expect(taper(outer - 0.2 * range)).toBe(0);

    // Streamlines stay inside [inner, outer]: r*(1 +/- e(r)) bounded, so the
    // ray marcher's crossing band needs no eccentricity expansion
    const e = 0.4; // GUI slider max
    for (let i = 0; i <= 100; i++) {
      const r = inner + (range * i) / 100;
      const ecc = e * taper(r);
      expect(r * (1 - ecc)).toBeGreaterThanOrEqual(inner * 0.999);
      expect(r * (1 + ecc)).toBeLessThanOrEqual(outer * 1.001);
    }
  });
});
