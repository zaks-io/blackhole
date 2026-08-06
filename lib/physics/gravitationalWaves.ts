/**
 * Quadrupole-approximation gravitational wave helpers for the binary system.
 * Geometric units G = c = 1, with the total mass fixed by the Schwarzschild
 * radius: M_tot = rs / 2. Separations are in the same length unit as rs.
 */

/** Separation (in rs) where the ripple amplitude normalization equals 1. */
export const GW_REFERENCE_SEPARATION = 8;

/**
 * Separation (in rs) treated as horizon contact. The per-BH radii satisfy
 * rs1 + rs2 = rs, so the horizons touch at separation = rs; the small margin
 * hands off to ringdown just before the shadows fully overlap.
 */
export const GW_CONTACT_SEPARATION = 1.05;

/**
 * Separation (in rs) where the circumbinary disk decouples from the binary:
 * past this point the GW inspiral shrinks the orbit faster than the gas can
 * viscously follow, so the cavity edge stops tracking the separation and
 * freezes until the post-merger refill (GRMHD sims put this at a few M for
 * typical disk viscosities, e.g. Noble et al. 2012).
 */
export const GW_DECOUPLING_SEPARATION = 3.0;

/** Kepler's third law with GM_tot = rs / 2: omega = sqrt(rs / (2 a^3)). */
export function keplerianOrbitalFrequency(rs: number, separation: number): number {
  requirePositive('rs', rs);
  requirePositive('separation', separation);
  return Math.sqrt((0.5 * rs) / (separation * separation * separation));
}

/**
 * Peters (1964) circular-orbit decay rate, returned as a positive magnitude:
 * |da/dt| = (64/5) m1 m2 M_tot / a^3.
 */
export function petersSeparationDecayRate(
  rs: number,
  massFraction1: number,
  separation: number
): number {
  requirePositive('rs', rs);
  requirePositive('separation', separation);
  if (!Number.isFinite(massFraction1) || massFraction1 <= 0 || massFraction1 >= 1) {
    throw new RangeError('massFraction1 must be in (0, 1)');
  }
  const totalMass = rs / 2;
  const m1 = massFraction1 * totalMass;
  const m2 = (1 - massFraction1) * totalMass;
  return (64 / 5) * ((m1 * m2 * totalMass) / separation ** 3);
}

/**
 * Physical strain scaling: the quadrupole amplitude of a circular binary is
 * h = 4 m1 m2 / (a r), so at fixed r the ripple scales as 1/a. Normalized to
 * 1 at the reference separation, so the visualized brightness tracks the true
 * relative amplitude through the inspiral (~7.6x brighter at horizon contact
 * than at the default 8 rs separation). Below contact the quadrupole formula
 * no longer applies; the strain peaks there and the ringdown envelope decays
 * it, so the boost freezes at its contact value. Defined down to separation 0
 * (fully overlapped horizons) via the same freeze.
 */
export function gwRippleAmplitudeBoost(separation: number, rs: number): number {
  requireNonNegative('separation', separation);
  requirePositive('rs', rs);
  return (GW_REFERENCE_SEPARATION * rs) / Math.max(separation, GW_CONTACT_SEPARATION * rs);
}

/**
 * Mini-disk starvation through the late inspiral: once the orbit decays
 * faster than the streams can refill the mini-disks, they drain and dim
 * before tidal truncation swallows them. Smoothstep from fully fed at twice
 * the decoupling separation down to dark at horizon contact; the early onset
 * (relative to decoupling proper) keeps the dimming visible while the disks
 * still have area, since the Roche truncation has nearly degenerate radii by
 * the decoupling separation itself. Defined down to separation 0 (fully
 * overlapped horizons), where the disks are simply gone.
 */
export function miniDiskStarvationFactor(separation: number, rs: number): number {
  requireNonNegative('separation', separation);
  requirePositive('rs', rs);
  const full = 2 * GW_DECOUPLING_SEPARATION * rs;
  const dark = GW_CONTACT_SEPARATION * rs;
  const t = Math.min(Math.max((separation - dark) / (full - dark), 0), 1);
  return t * t * (3 - 2 * t);
}

function requirePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be positive and finite`);
}

function requireNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be non-negative and finite`);
}
