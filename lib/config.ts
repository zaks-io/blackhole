/**
 * Centralized configuration for the black hole visualization
 * All default values are defined here as the single source of truth
 */

export const CONFIG = {
  // Physics - Schwarzschild radius (base unit)
  rs: 1.0,

  // Camera settings
  camera: {
    fov: 60,
    minDistance: 5,
    maxDistance: 50,
    initialDistance: 20,
    near: 0.1,
    far: 1000,
  },

  // Renderer settings
  renderer: {
    targetFPS: 60,
    pixelRatioMax: 2,
    antialias: false,
    toneMapping: 'ACESFilmic' as const,
    toneMappingExposure: 1.0,
  },

  // Bloom post-processing
  bloom: {
    threshold: 0.1,
    strength: 0.7,
    radius: 0.5,
  },

  // Accretion disk
  disk: {
    innerRadius: 3.0,  // ISCO
    outerRadius: 12.0,
    temperatureInner: 10000,
    temperatureOuter: 3000,
    halfThickness: 0.1,
    volumeDensity: 0.15,
    luminanceCompression: 0.15,
    textureContrast: 1.0,
    materialSpeed: 15.0,
    opacity: 0.85,
  },

  // MHD turbulence effects
  mhd: {
    turbulenceIntensity: 0.8,
    spiralArms: 4.0,
    spiralTightness: 6.0,
    hotspotIntensity: 0.7,
    hotspotCount: 3,
    patternSpeed: 25.0,
  },

  // Ray marching settings
  rayMarching: {
    maxSteps: 100,
    autoSteps: true,
  },

  // Anti-aliasing settings
  antiAliasing: {
    supersampleLevel: 1,
    bhEdgeSoftness: 1,
    fxaaEnabled: true,
  },

  // Photon sphere settings
  photonSphere: {
    intensity: 0.5,  // 0 = off, 1 = full glow
  },

  // Particle system settings
  particles: {
    count: 150,
    escapePercentage: 0.15,
    sizeMin: 0.02,
    sizeMax: 0.06,
    brightness: 1.5,
    verticalSpread: 0.3,
    edgeBias: 0.6,
    orbitSpeedMultiplier: 8.0,
    escapeSpeed: 1.5,
  },

  // Controls settings
  controls: {
    enableDamping: true,
    dampingFactor: 0.05,
  },

  // EHT-style blur effect (replicates telescope diffraction)
  ehtBlur: {
    enabled: false,
    strength: 1.2,
    iterations: 6,
  },
};

// ============================================================================
// Helper functions to build flat param objects for existing APIs
// ============================================================================

import type { LensingParams } from './passes/LensingPass';
import type { ParticleParams } from './particles/particleTypes';

/**
 * Build the flat LensingParams object from CONFIG
 */
export function buildLensingParams(): LensingParams {
  return {
    rs: CONFIG.rs,
    maxSteps: CONFIG.rayMarching.maxSteps,
    diskInnerRadius: CONFIG.disk.innerRadius,
    diskOuterRadius: CONFIG.disk.outerRadius,
    diskTemperatureInner: CONFIG.disk.temperatureInner,
    diskTemperatureOuter: CONFIG.disk.temperatureOuter,
    diskHalfThickness: CONFIG.disk.halfThickness,
    diskVolumeDensity: CONFIG.disk.volumeDensity,
    diskLuminanceCompression: CONFIG.disk.luminanceCompression,
    diskTextureContrast: CONFIG.disk.textureContrast,
    diskMaterialSpeed: CONFIG.disk.materialSpeed,
    diskOpacity: CONFIG.disk.opacity,
    mhdTurbulenceIntensity: CONFIG.mhd.turbulenceIntensity,
    mhdSpiralArms: CONFIG.mhd.spiralArms,
    mhdSpiralTightness: CONFIG.mhd.spiralTightness,
    mhdHotspotIntensity: CONFIG.mhd.hotspotIntensity,
    mhdHotspotCount: CONFIG.mhd.hotspotCount,
    mhdPatternSpeed: CONFIG.mhd.patternSpeed,
    supersampleLevel: CONFIG.antiAliasing.supersampleLevel,
    bhEdgeSoftness: CONFIG.antiAliasing.bhEdgeSoftness,
    photonSphereIntensity: CONFIG.photonSphere.intensity,
  };
}

/**
 * Build the flat ParticleParams object from CONFIG
 */
export function buildParticleParams(): ParticleParams {
  return {
    count: CONFIG.particles.count,
    escapePercentage: CONFIG.particles.escapePercentage,
    sizeMin: CONFIG.particles.sizeMin,
    sizeMax: CONFIG.particles.sizeMax,
    brightness: CONFIG.particles.brightness,
    verticalSpread: CONFIG.particles.verticalSpread,
    edgeBias: CONFIG.particles.edgeBias,
    orbitSpeedMultiplier: CONFIG.particles.orbitSpeedMultiplier,
    escapeSpeed: CONFIG.particles.escapeSpeed,
    diskInnerRadius: CONFIG.disk.innerRadius,
    diskOuterRadius: CONFIG.disk.outerRadius,
    rs: CONFIG.rs,
  };
}

