import { describe, expect, test } from 'bun:test';

import {
  GW_CONTACT_SEPARATION,
  GW_DECOUPLING_SEPARATION,
  GW_REFERENCE_SEPARATION,
  gwRippleAmplitudeBoost,
  keplerianOrbitalFrequency,
  miniDiskStarvationFactor,
  petersSeparationDecayRate,
} from '../lib/physics/gravitationalWaves';

const RS = 1;

describe('keplerianOrbitalFrequency', () => {
  test('matches Kepler with GM_tot = rs / 2', () => {
    const a = 8;
    expect(keplerianOrbitalFrequency(RS, a)).toBeCloseTo(Math.sqrt((0.5 * RS) / a ** 3), 14);
  });

  test('decreases with separation', () => {
    expect(keplerianOrbitalFrequency(RS, 4)).toBeGreaterThan(keplerianOrbitalFrequency(RS, 8));
  });

  test('rejects non-positive inputs', () => {
    expect(() => keplerianOrbitalFrequency(0, 8)).toThrow(RangeError);
    expect(() => keplerianOrbitalFrequency(RS, -1)).toThrow(RangeError);
    expect(() => keplerianOrbitalFrequency(RS, NaN)).toThrow(RangeError);
  });
});

describe('petersSeparationDecayRate', () => {
  test('is symmetric in the mass fraction', () => {
    expect(petersSeparationDecayRate(RS, 0.3, 8)).toBeCloseTo(
      petersSeparationDecayRate(RS, 0.7, 8),
      14
    );
  });

  test('is maximal at equal masses', () => {
    const equal = petersSeparationDecayRate(RS, 0.5, 8);
    expect(equal).toBeGreaterThan(petersSeparationDecayRate(RS, 0.2, 8));
    expect(equal).toBeGreaterThan(petersSeparationDecayRate(RS, 0.8, 8));
  });

  test('scales as separation^-3', () => {
    const rate8 = petersSeparationDecayRate(RS, 0.5, 8);
    const rate4 = petersSeparationDecayRate(RS, 0.5, 4);
    expect(rate4 / rate8).toBeCloseTo(8, 12);
  });

  test('matches the Peters coefficient for equal masses', () => {
    // M_tot = rs / 2 = 0.5, so m1 = m2 = 0.25
    const expected = (64 / 5) * ((0.25 * 0.25 * 0.5) / 8 ** 3);
    expect(petersSeparationDecayRate(RS, 0.5, 8)).toBeCloseTo(expected, 14);
  });

  test('integrated decay reaches contact monotonically in finite time', () => {
    let a = GW_REFERENCE_SEPARATION * RS;
    const dt = 0.01;
    const speedup = 30;
    let steps = 0;
    const maxSteps = 10_000_000;

    while (a > GW_CONTACT_SEPARATION * RS && steps < maxSteps) {
      const rate = petersSeparationDecayRate(RS, 0.5, a);
      expect(rate).toBeGreaterThan(0);
      a -= speedup * rate * dt;
      steps++;
    }

    expect(steps).toBeLessThan(maxSteps);
    expect(a).toBeLessThanOrEqual(GW_CONTACT_SEPARATION * RS);
  });

  test('rejects mass fractions outside (0, 1)', () => {
    expect(() => petersSeparationDecayRate(RS, 0, 8)).toThrow(RangeError);
    expect(() => petersSeparationDecayRate(RS, 1, 8)).toThrow(RangeError);
    expect(() => petersSeparationDecayRate(RS, NaN, 8)).toThrow(RangeError);
    expect(() => petersSeparationDecayRate(RS, 0.5, 0)).toThrow(RangeError);
  });
});

describe('gwRippleAmplitudeBoost', () => {
  test('is 1 at the reference separation', () => {
    expect(gwRippleAmplitudeBoost(GW_REFERENCE_SEPARATION * RS, RS)).toBeCloseTo(1, 14);
  });

  test('scales as 1/separation, matching h = 4 m1 m2 / (a r)', () => {
    expect(gwRippleAmplitudeBoost(4 * RS, RS)).toBeCloseTo(2, 14);
    expect(gwRippleAmplitudeBoost(16 * RS, RS)).toBeCloseTo(0.5, 14);
  });

  test('freezes at the contact value once the horizons touch', () => {
    const atContact = GW_REFERENCE_SEPARATION / GW_CONTACT_SEPARATION;
    expect(gwRippleAmplitudeBoost(GW_CONTACT_SEPARATION * RS, RS)).toBeCloseTo(atContact, 12);
    expect(gwRippleAmplitudeBoost(0.02 * RS, RS)).toBeCloseTo(atContact, 12);
    expect(gwRippleAmplitudeBoost(0, RS)).toBeCloseTo(atContact, 12);
  });

  test('rejects negative separation and non-positive rs', () => {
    expect(() => gwRippleAmplitudeBoost(-1, RS)).toThrow(RangeError);
    expect(() => gwRippleAmplitudeBoost(8, 0)).toThrow(RangeError);
  });
});

describe('miniDiskStarvationFactor', () => {
  test('fully fed at and above twice the decoupling separation', () => {
    expect(miniDiskStarvationFactor(2 * GW_DECOUPLING_SEPARATION * RS, RS)).toBe(1);
    expect(miniDiskStarvationFactor(GW_REFERENCE_SEPARATION * RS, RS)).toBe(1);
  });

  test('fully dark at and below horizon contact', () => {
    expect(miniDiskStarvationFactor(GW_CONTACT_SEPARATION * RS, RS)).toBe(0);
    expect(miniDiskStarvationFactor(0.02 * RS, RS)).toBe(0);
    expect(miniDiskStarvationFactor(0, RS)).toBe(0);
  });

  test('decreases monotonically through the starvation window', () => {
    const separations = [5.5, 4.5, 3.5, 2.5, 1.5];
    const factors = separations.map((a) => miniDiskStarvationFactor(a * RS, RS));
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThan(factors[i - 1]);
    }
    expect(factors[0]).toBeLessThan(1);
    expect(factors[factors.length - 1]).toBeGreaterThan(0);
  });

  test('matches smoothstep at the window midpoint', () => {
    const mid = ((2 * GW_DECOUPLING_SEPARATION + GW_CONTACT_SEPARATION) / 2) * RS;
    expect(miniDiskStarvationFactor(mid, RS)).toBeCloseTo(0.5, 14);
  });

  test('rejects negative separation and non-positive rs', () => {
    expect(() => miniDiskStarvationFactor(-1, RS)).toThrow(RangeError);
    expect(() => miniDiskStarvationFactor(8, 0)).toThrow(RangeError);
  });
});
