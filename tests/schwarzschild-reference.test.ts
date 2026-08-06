import { describe, expect, test } from 'bun:test';

import {
  finiteObserverImpactParameter,
  schwarzschildCriticalAngularRadius,
  schwarzschildCriticalImpactParameter,
  schwarzschildNullRadialPotential,
  schwarzschildOuterTurningRadius,
  schwarzschildPhotonSphereRadius,
  traceSchwarzschildNullRay,
} from '../lib/physics/schwarzschild';

const RS = 1;

describe('finite static observer', () => {
  test('critical curve angular radius shrinks with observer distance', () => {
    const near = schwarzschildCriticalAngularRadius(10, RS);
    const far = schwarzschildCriticalAngularRadius(20, RS);

    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  test('converts local angle to the impact parameter measured at infinity', () => {
    const radius = 10;
    const angle = Math.PI / 6;
    const direction: readonly [number, number, number] = [-Math.cos(angle), Math.sin(angle), 0];
    const expected = (radius * Math.sin(angle)) / Math.sqrt(1 - RS / radius);

    expect(finiteObserverImpactParameter([radius, 0, 0], direction, RS)).toBeCloseTo(expected, 13);
  });

  test('is invariant to ray-direction magnitude', () => {
    expect(finiteObserverImpactParameter([10, 0, 0], [-2, 1, 0], RS)).toBeCloseTo(
      finiteObserverImpactParameter([10, 0, 0], [-4, 2, 0], RS),
      14
    );
  });
});

describe('capture boundary and turning point', () => {
  const criticalImpact = (3 * Math.sqrt(3)) / 2;

  test('reproduces the analytic photon-sphere critical point', () => {
    expect(schwarzschildCriticalImpactParameter(RS)).toBeCloseTo(criticalImpact, 14);
    expect(schwarzschildOuterTurningRadius(criticalImpact, RS)).toBeCloseTo(
      schwarzschildPhotonSphereRadius(RS),
      14
    );
  });

  test('captured rays have no outer turning point', () => {
    expect(schwarzschildOuterTurningRadius(criticalImpact * 0.999, RS)).toBeNull();
  });

  test('scattering periapsis solves the exact radial potential', () => {
    const impactParameter = 4;
    const periapsis = schwarzschildOuterTurningRadius(impactParameter, RS);

    expect(periapsis).not.toBeNull();
    expect(schwarzschildNullRadialPotential(periapsis!, impactParameter, RS)).toBeCloseTo(0, 13);
    expect(periapsis!).toBeGreaterThan(schwarzschildPhotonSphereRadius(RS));
    expect(periapsis!).toBeLessThan(impactParameter);
  });
});

describe('exact Schwarzschild null-orbit reference', () => {
  test('optionally samples a bounded ray path', () => {
    const trace = traceSchwarzschildNullRay({
      observerRadius: 20,
      impactParameter: schwarzschildCriticalImpactParameter(RS) * 1.1,
      rs: RS,
      angularStep: 0.004,
      maxAngularSweep: 4 * Math.PI,
      pathSampleStride: 8,
    });

    expect(trace.path?.length).toBeGreaterThan(2);
    expect(trace.path?.length).toBeLessThan(500);
  });

  test('separates capture and escape around the analytic critical impact', () => {
    const criticalImpact = schwarzschildCriticalImpactParameter(RS);
    const common = { observerRadius: 100, rs: RS, angularStep: 0.0005 };

    expect(
      traceSchwarzschildNullRay({ ...common, impactParameter: criticalImpact * 0.99 }).outcome
    ).toBe('captured');
    expect(
      traceSchwarzschildNullRay({ ...common, impactParameter: criticalImpact * 1.01 }).outcome
    ).toBe('escaped');
  });

  test('periapsis agrees with the independently solved turning point', () => {
    const impactParameter = 4;
    const trace = traceSchwarzschildNullRay({
      observerRadius: 100,
      impactParameter,
      rs: RS,
      angularStep: 0.00025,
    });
    const exactPeriapsis = schwarzschildOuterTurningRadius(impactParameter, RS)!;

    expect(trace.outcome).toBe('escaped');
    expect(Math.abs(trace.periapsisRadius - exactPeriapsis)).toBeLessThan(2e-7);
    expect(trace.maxInvariantError).toBeLessThan(1e-13);
  });

  test('converges to the weak-field deflection 2rs/b', () => {
    const observerRadius = 20_000;
    const impactParameter = 100;
    const trace = traceSchwarzschildNullRay({
      observerRadius,
      impactParameter,
      rs: RS,
      angularStep: 0.00025,
    });
    const flatSweep = Math.PI - 2 * Math.asin(impactParameter / observerRadius);
    const deflection = trace.angularSweep - flatSweep;

    expect(trace.outcome).toBe('escaped');
    expect(Math.abs(deflection - (2 * RS) / impactParameter)).toBeLessThan(5e-4);
  });
});
