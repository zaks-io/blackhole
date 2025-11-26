/**
 * Particle type definitions and orbital utilities
 */

import { buildParticleParams } from '../config';

export interface ParticleParams {
  // Particle count and distribution
  count: number;
  escapePercentage: number;  // 0-1, fraction on escape trajectories
  
  // Size and appearance
  sizeMin: number;
  sizeMax: number;
  brightness: number;
  
  // Distribution
  verticalSpread: number;  // Gaussian sigma for Y offset
  edgeBias: number;        // 0-1, how much to bias toward outer edge
  
  // Dynamics
  orbitSpeedMultiplier: number;
  escapeSpeed: number;     // Base escape velocity multiplier
  
  // Disk reference (to match disk boundaries)
  diskInnerRadius: number;
  diskOuterRadius: number;
  rs: number;  // Schwarzschild radius
}

// Default params built from centralized config
export const defaultParticleParams: ParticleParams = buildParticleParams();

export interface Particle {
  // Current state
  x: number;
  y: number;
  z: number;
  size: number;
  
  // Properties
  brightness: number;
  temperature: number;  // For color
  isEscaping: boolean;
  
  // Orbital elements (for bound particles)
  orbitalRadius: number;
  orbitalPhase: number;  // Current angle in orbit
  verticalOffset: number;
  
  // Escape trajectory (for escaping particles)
  escapeVelocityX: number;
  escapeVelocityY: number;
  escapeVelocityZ: number;
}

/**
 * Calculate Keplerian angular velocity at radius r
 * omega = sqrt(GM/r^3) = sqrt(0.5*rs/r) / r for our units
 */
export function keplerianAngularVelocity(r: number, rs: number): number {
  return Math.sqrt(0.5 * rs / r) / r;
}

/**
 * Calculate Keplerian orbital velocity magnitude
 * v = sqrt(GM/r) = sqrt(0.5*rs/r)
 */
export function keplerianVelocity(r: number, rs: number): number {
  return Math.sqrt(0.5 * rs / r);
}

/**
 * Gaussian random number (Box-Muller transform)
 */
export function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Generate radius with edge bias
 * Higher edgeBias = more particles near outer edge
 */
export function generateBiasedRadius(
  innerRadius: number,
  outerRadius: number,
  edgeBias: number
): number {
  // Use power distribution to bias toward outer edge
  const t = Math.pow(Math.random(), 1.0 - edgeBias * 0.8);
  return innerRadius + t * (outerRadius - innerRadius);
}

