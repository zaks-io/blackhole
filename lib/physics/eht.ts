const MICROARCSECOND_RADIANS = (Math.PI / (180 * 3600)) * 1e-6;
const GAUSSIAN_PASS_VARIANCE = 4.5702;
const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.log(2));

export const SCHWARZSCHILD_SHADOW_DIAMETER_RS = 3 * Math.sqrt(3);

export interface EhtCalibration {
  angularResolutionMicroarcseconds: number;
  referenceRingDiameterMicroarcseconds: number;
  iterations: number;
}

export interface EhtScreenBlur {
  shadowDiameterPixels: number;
  beamFwhmPixels: number;
  shaderStrength: number;
}

export function getEhtEquivalentDistanceKm(
  schwarzschildRadiusKm: number,
  ringDiameterMicroarcseconds: number
): number {
  if (schwarzschildRadiusKm <= 0 || ringDiameterMicroarcseconds <= 0) {
    throw new Error('EHT distance requires positive radius and angular diameter');
  }

  const angularDiameter = ringDiameterMicroarcseconds * MICROARCSECOND_RADIANS;
  return (SCHWARZSCHILD_SHADOW_DIAMETER_RS * schwarzschildRadiusKm) / angularDiameter;
}

export function getEhtScreenBlur(
  cameraDistanceRs: number,
  verticalFovDegrees: number,
  viewportHeightPixels: number,
  calibration: EhtCalibration
): EhtScreenBlur {
  if (cameraDistanceRs <= 1.5 || verticalFovDegrees <= 0 || viewportHeightPixels <= 0) {
    throw new Error(
      'EHT screen blur requires a camera outside the photon sphere and a valid viewport'
    );
  }
  if (
    calibration.angularResolutionMicroarcseconds <= 0 ||
    calibration.referenceRingDiameterMicroarcseconds <= 0 ||
    calibration.iterations <= 0
  ) {
    throw new Error('EHT calibration values must be positive');
  }

  const criticalImpactParameterRs = SCHWARZSCHILD_SHADOW_DIAMETER_RS / 2;
  const lapse = Math.sqrt(1 - 1 / cameraDistanceRs);
  const sinAngularRadius = (criticalImpactParameterRs * lapse) / cameraDistanceRs;
  if (sinAngularRadius >= 1) {
    throw new Error('Projected Schwarzschild shadow does not fit a finite perspective view');
  }
  const angularRadius = Math.asin(sinAngularRadius);
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const shadowDiameterPixels =
    (viewportHeightPixels * Math.tan(angularRadius)) / Math.tan(halfVerticalFov);
  const beamFwhmPixels =
    shadowDiameterPixels *
    (calibration.angularResolutionMicroarcseconds /
      calibration.referenceRingDiameterMicroarcseconds);
  const kernelFwhmAtStrengthOne =
    FWHM_PER_SIGMA * Math.sqrt(calibration.iterations * GAUSSIAN_PASS_VARIANCE);

  return {
    shadowDiameterPixels,
    beamFwhmPixels,
    shaderStrength: beamFwhmPixels / kernelFwhmAtStrengthOne,
  };
}
