export type Vec3 = readonly [number, number, number];

export const schwarzschildCriticalImpactParameter = (rs: number): number => {
  requirePositive('rs', rs);
  return (3 * Math.sqrt(3) * rs) / 2;
};

export const schwarzschildPhotonSphereRadius = (rs: number): number => {
  requirePositive('rs', rs);
  return 1.5 * rs;
};

/** Impact parameter measured at infinity for a local static observer. */
export function finiteObserverImpactParameter(
  observerPosition: Vec3,
  localRayDirection: Vec3,
  rs: number
): number {
  requirePositive('rs', rs);
  const radius = magnitude(observerPosition);
  if (radius <= rs) throw new RangeError('A static observer must be outside the event horizon');

  const directionLength = magnitude(localRayDirection);
  if (directionLength === 0) throw new RangeError('localRayDirection must be non-zero');

  const crossMagnitude = magnitude(cross(observerPosition, localRayDirection)) / directionLength;
  return crossMagnitude / Math.sqrt(1 - rs / radius);
}

/** The dimensionless radial potential (dr/dlambda / E)^2. */
export function schwarzschildNullRadialPotential(
  radius: number,
  impactParameter: number,
  rs: number
): number {
  requirePositive('radius', radius);
  requirePositive('rs', rs);
  requireNonNegative('impactParameter', impactParameter);
  return 1 - (impactParameter * impactParameter * (1 - rs / radius)) / (radius * radius);
}

/** Outer periapsis for a scattering ray, or null for a captured ray. */
export function schwarzschildOuterTurningRadius(
  impactParameter: number,
  rs: number
): number | null {
  requirePositive('impactParameter', impactParameter);
  const criticalImpact = schwarzschildCriticalImpactParameter(rs);
  const scale = Math.max(criticalImpact, impactParameter);
  const tolerance = Number.EPSILON * scale * 16;
  if (impactParameter < criticalImpact - tolerance) return null;
  if (Math.abs(impactParameter - criticalImpact) <= tolerance) {
    return schwarzschildPhotonSphereRadius(rs);
  }

  let low = schwarzschildPhotonSphereRadius(rs);
  let high = Math.max(impactParameter, 2 * rs);
  for (let iteration = 0; iteration < 80; iteration++) {
    const middle = (low + high) / 2;
    if (schwarzschildNullRadialPotential(middle, impactParameter, rs) < 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export interface SchwarzschildNullTraceOptions {
  observerRadius: number;
  impactParameter: number;
  rs: number;
  initialDirection?: 'inward' | 'outward';
  angularStep?: number;
  maxAngularSweep?: number;
}

export interface SchwarzschildNullTrace {
  outcome: 'captured' | 'escaped' | 'trapped';
  angularSweep: number;
  finalRadius: number;
  periapsisRadius: number;
  steps: number;
  maxInvariantError: number;
}

/**
 * High-accuracy planar null-geodesic reference using the exact Schwarzschild
 * orbit equation u'' + u = 3 rs u^2 / 2, where u = 1/r.
 */
export function traceSchwarzschildNullRay(
  options: SchwarzschildNullTraceOptions
): SchwarzschildNullTrace {
  const { observerRadius, impactParameter, rs } = options;
  requirePositive('rs', rs);
  requirePositive('observerRadius', observerRadius);
  requirePositive('impactParameter', impactParameter);
  if (observerRadius <= rs)
    throw new RangeError('observerRadius must be outside the event horizon');

  const angularStep = options.angularStep ?? 0.0005;
  const maxAngularSweep = options.maxAngularSweep ?? 32 * Math.PI;
  requirePositive('angularStep', angularStep);
  requirePositive('maxAngularSweep', maxAngularSweep);

  let angle = 0;
  let u = 1 / observerRadius;
  const initialSlopeSquared = orbitSlopeSquared(u, impactParameter, rs);
  if (initialSlopeSquared < -1e-12 / (impactParameter * impactParameter)) {
    throw new RangeError('The requested ray cannot pass through the observer radius');
  }
  let slope = Math.sqrt(Math.max(0, initialSlopeSquared));
  if ((options.initialDirection ?? 'inward') === 'outward') slope = -slope;

  const invariant = 1 / (impactParameter * impactParameter);
  let maxInvariantError = 0;
  let periapsisRadius = observerRadius;
  let wasInward = slope >= 0;
  const maxSteps = Math.ceil(maxAngularSweep / angularStep);

  for (let steps = 1; steps <= maxSteps; steps++) {
    [u, slope] = rk4OrbitStep(u, slope, angularStep, rs);
    angle += angularStep;
    if (!Number.isFinite(u) || !Number.isFinite(slope)) {
      throw new Error('Null-geodesic integration became non-finite');
    }

    const radius = 1 / u;
    periapsisRadius = Math.min(periapsisRadius, radius);
    const currentInvariant = slope * slope + u * u - rs * u * u * u;
    maxInvariantError = Math.max(maxInvariantError, Math.abs(currentInvariant - invariant));

    if (u >= 1 / rs) {
      return {
        outcome: 'captured',
        angularSweep: angle,
        finalRadius: radius,
        periapsisRadius,
        steps,
        maxInvariantError,
      };
    }
    if (slope < 0) wasInward = false;
    if (!wasInward && u <= 1 / observerRadius) {
      return {
        outcome: 'escaped',
        angularSweep: angle,
        finalRadius: radius,
        periapsisRadius,
        steps,
        maxInvariantError,
      };
    }
  }

  return {
    outcome: 'trapped',
    angularSweep: angle,
    finalRadius: 1 / u,
    periapsisRadius,
    steps: maxSteps,
    maxInvariantError,
  };
}

function orbitSlopeSquared(u: number, impactParameter: number, rs: number): number {
  return 1 / (impactParameter * impactParameter) - u * u + rs * u * u * u;
}

function rk4OrbitStep(u: number, slope: number, step: number, rs: number): [number, number] {
  const acceleration = (inverseRadius: number) => -inverseRadius + 1.5 * rs * inverseRadius ** 2;
  const k1u = slope;
  const k1s = acceleration(u);
  const k2u = slope + (step * k1s) / 2;
  const k2s = acceleration(u + (step * k1u) / 2);
  const k3u = slope + (step * k2s) / 2;
  const k3s = acceleration(u + (step * k2u) / 2);
  const k4u = slope + step * k3s;
  const k4s = acceleration(u + step * k3u);
  return [
    u + (step * (k1u + 2 * k2u + 2 * k3u + k4u)) / 6,
    slope + (step * (k1s + 2 * k2s + 2 * k3s + k4s)) / 6,
  ];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function magnitude(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be positive and finite`);
}

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be non-negative and finite`);
}
