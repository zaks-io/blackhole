import { describe, expect, test } from 'bun:test';

import { CONFIG } from '../lib/config';
import {
  SCHWARZSCHILD_SHADOW_DIAMETER_RS,
  getEhtEquivalentDistanceKm,
  getEhtScreenBlur,
} from '../lib/physics/eht';

const calibration = {
  angularResolutionMicroarcseconds: CONFIG.ehtBlur.angularResolutionMicroarcseconds,
  referenceRingDiameterMicroarcseconds: CONFIG.ehtBlur.referenceRingDiameterMicroarcseconds,
  iterations: CONFIG.ehtBlur.iterations,
};

describe('EHT observation calibration', () => {
  test('uses the Schwarzschild critical-impact shadow diameter', () => {
    expect(SCHWARZSCHILD_SHADOW_DIAMETER_RS).toBeCloseTo(5.196152423, 9);
  });

  test('places an M87-mass Schwarzschild shadow near the observed M87 distance', () => {
    const distanceKm = getEhtEquivalentDistanceKm(
      1.92e10,
      CONFIG.ehtBlur.referenceRingDiameterMicroarcseconds
    );
    const megaparsecs = distanceKm / 3.0856775814913673e19;

    expect(megaparsecs).toBeCloseTo(15.88, 1);
  });

  test('maps the EHT beam to 25/42 of the projected shadow at every zoom', () => {
    for (const cameraDistanceRs of [10, 25, Math.hypot(30, 50)]) {
      const blur = getEhtScreenBlur(cameraDistanceRs, 60, 1080, calibration);
      expect(blur.beamFwhmPixels / blur.shadowDiameterPixels).toBeCloseTo(25 / 42, 12);
      expect(blur.shaderStrength).toBeGreaterThan(0);
    }
  });

  test('projects the EHT preset shadow and beam to their absolute screen sizes', () => {
    const blur = getEhtScreenBlur(Math.hypot(30, 50), 60, 1080, calibration);

    expect(blur.shadowDiameterPixels).toBeCloseTo(82.71, 1);
    expect(blur.beamFwhmPixels).toBeCloseTo(49.23, 1);
    expect(blur.shaderStrength).toBeCloseTo(3.99, 1);
  });

  test('scales both the shadow and beam with screen magnification', () => {
    const near = getEhtScreenBlur(25, 60, 1080, calibration);
    const far = getEhtScreenBlur(50, 60, 1080, calibration);

    expect(near.shadowDiameterPixels).toBeGreaterThan(far.shadowDiameterPixels * 1.9);
    expect(near.beamFwhmPixels).toBeGreaterThan(far.beamFwhmPixels * 1.9);
  });
});
