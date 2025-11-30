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
    minDistance: 2.6,
    maxDistance: 50,
    initialDistance: 10,  // Start farther for intro
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
    strength: 0.3,
    radius: 0.3,
    resolutionScale: 0.5, // Render bloom at half resolution for performance
  },

  // Accretion disk
  disk: {
    innerRadius: 3.0,  // ISCO
    outerRadius: 12.0,
    temperatureInner: 10000,
    temperatureOuter: 3000,
    halfThickness: 0.1,
    volumeDensity: 0.15,
    luminanceCompression: 0.2,
    textureContrast: 1.0,
    materialSpeed: 15.0,
    opacity: 0.85,
  },

  // MHD turbulence effects
  mhd: {
    turbulenceIntensity: 0.8,
    spiralArms: 1.0,
    spiralTightness: 6.0,
    hotspotIntensity: 0.7,
    hotspotCount: 3,
    patternSpeed: 3.0,
    minDensity: 0,  // Minimum density for sparse areas (0-1)
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
    strength: 1.8, // Increased to compensate for fewer iterations
    iterations: 2, // Reduced from 6 for performance
  },

  // Multi-layer disk system
  layers: {
    corona: {
      enabled: true,
      radius: 3.0, // Outer boundary (rs) - concentrated near ISCO
      density: 0.2, // Subtle glow
      temperature: 100000, // Hot blue-white
    },
    jets: {
      enabled: false,
      halfOpeningAngle: 12.0, // Degrees
      length: 40.0, // rs units
      velocity: 0.85, // Fraction of c (affects beaming)
      density: 0.1,
    },
    thickDisk: {
      enabled: true,
      halfThickness: 0.4, // Enhanced thickness
      puffiness: 0.4, // Gaussian falloff
    },
    lod: {
      enabled: true,
      nearDistance: 10, // Full detail (rs)
      farDistance: 50, // Minimum detail (rs)
    },
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
    mhdMinDensity: CONFIG.mhd.minDensity,
    supersampleLevel: CONFIG.antiAliasing.supersampleLevel,
    bhEdgeSoftness: CONFIG.antiAliasing.bhEdgeSoftness,
    photonSphereIntensity: CONFIG.photonSphere.intensity,
    // Overlays default to off
    overlayIsco: 0,
    overlayPhotonSphere: 0,
    overlayEventHorizon: 0,
    overlayShadowEdge: 0,
    overlayDoppler: 0,
    overlayScale: 0,
    // Layer system
    coronaEnabled: CONFIG.layers.corona.enabled ? 1 : 0,
    coronaRadius: CONFIG.layers.corona.radius,
    coronaDensity: CONFIG.layers.corona.density,
    coronaTemperature: CONFIG.layers.corona.temperature,
    jetsEnabled: CONFIG.layers.jets.enabled ? 1 : 0,
    jetsHalfOpeningAngle: CONFIG.layers.jets.halfOpeningAngle,
    jetsLength: CONFIG.layers.jets.length,
    jetsVelocity: CONFIG.layers.jets.velocity,
    jetsDensity: CONFIG.layers.jets.density,
    thickDiskEnabled: CONFIG.layers.thickDisk.enabled ? 1 : 0,
    thickDiskHalfThickness: CONFIG.layers.thickDisk.halfThickness,
    thickDiskPuffiness: CONFIG.layers.thickDisk.puffiness,
    lodEnabled: CONFIG.layers.lod.enabled ? 1 : 0,
    lodNearDistance: CONFIG.layers.lod.nearDistance,
    lodFarDistance: CONFIG.layers.lod.farDistance,
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

