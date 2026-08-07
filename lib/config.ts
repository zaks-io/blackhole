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
    initialDistance: 10, // Start farther for intro
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
    innerRadius: 3.0, // ISCO
    outerRadius: 12.0,
    temperatureInner: 10000, // Peak temp of the Novikov-Thorne profile (mini-disks scale by mass^-1/4)
    temperatureOuter: 3000, // Circumbinary disk temp at the cavity edge (binary mode only)
    halfThickness: 0.1,
    volumeDensity: 0.15,
    luminanceCompression: 0.2,
    textureContrast: 1.0,
    materialSpeed: 15.0,
    opacity: 0.4,
    // m=1 eccentric mode (single-BH only): nested elliptical streamlines
    // precessing rigidly at the GR apsidal rate times the speed multiplier
    eccentricity: 0.18,
    eccentricityPrecessionSpeed: 1.0,
  },

  // MHD turbulence effects
  mhd: {
    turbulenceIntensity: 0.8,
    spiralArms: 1.0,
    spiralTightness: 6.0,
    hotspotIntensity: 0.7,
    hotspotCount: 3,
    patternSpeed: 3.0,
    minDensity: 0, // Minimum density for sparse areas (0-1)
    hotspotEccentricity: 0.3, // Epicyclic radial oscillation of hotspots
  },

  // Ray marching settings
  rayMarching: {
    maxSteps: 150,
    autoSteps: true,
    autoStepsMin: 64,
    autoStepsMax: 200,
    // Anti-banding step refinement
    stepJitter: false,
    curvatureAdaptation: 1.5, // Higher = more samples near photon sphere
    coronaStepRefinement: 1.0,
    baseStepSize: 0.15, // Controls band width - smaller = finer bands = more steps needed
  },

  // Anti-aliasing settings
  antiAliasing: {
    supersampleLevel: 1,
    bhEdgeSoftness: 1,
    fxaaEnabled: true,
  },

  // Photon sphere settings
  photonSphere: {
    intensity: 0.5, // 0 = off, 1 = full glow
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
    flyMovementSpeed: 10.0, // Scene units per second (throat radius is 3, orbits ~20)
    flyPointerSpeed: 1.0, // Mouse-look sensitivity multiplier while the pointer is captured
  },

  // EHT-style blur effect (replicates telescope diffraction)
  ehtBlur: {
    enabled: false,
    strength: 1.8,
    iterations: 6,
  },

  // Noise texture LUT settings
  noise: {
    textureSize: 64, // 64-256, controls quality/memory tradeoff
    timeScale: 0.02, // Animation speed through Z slices
  },

  // Static, spherically symmetric ultrastatic wormhole mode
  wormhole: {
    enabled: false, // Enable wormhole mode
    throatRadius: 3.0, // Throat radius b in scene units
    throatLength: 8.0, // Proper length of the cylindrical neck; 0 recovers Ellis
    farSky: 'nebulaBlue' as const, // Starfield key for the far universe
    farSkyExposure: 2.5, // Far sky is intrinsically darker than the near Milky Way texture
    // Schwarzschild black hole in the far universe, sharing the main scene's
    // rs and disk parameters. Position is in far-frame coordinates: ~45 units
    // from the throat keeps the two lenses' influence spheres (a + 8b and 16rs,
    // see wormhole.glsl) non-overlapping at defaults, and the y offset tilts the disk to a
    // shallow inclination as seen through the throat.
    farBlackHolePosition: [18.9, 13.5, -38.5] as [number, number, number],
  },

  // Binary black hole system
  binary: {
    enabled: false, // Enable binary mode
    mass1: 0.75, // Mass fraction of BH1 (0.1 to 0.9, BH2 = 1 - mass1)
    separation: 8.0, // Distance between BHs in rs units
    circumbinaryOuterRadius: 30.0, // Outer edge of circumbinary disk
    blendWidth: 2.0, // Transition smoothness between disk components
    streamWidth: 1.0, // Width of accretion streams
    streamDensity: 1.0, // Brightness of streams
  },

  // Multi-layer disk system
  layers: {
    corona: {
      enabled: true,
      radius: 3.0, // Outer boundary (rs) - concentrated near ISCO
      density: 0.1, // Subtle glow - lower density reduces banding visibility
      temperature: 100000, // Hot blue-white
    },
    jets: {
      enabled: false,
      halfOpeningAngle: 12.0, // Degrees
      length: 50.0, // rs units
      velocity: 0.85, // Fraction of c (affects beaming)
      density: 0.025,
    },
    thickDisk: {
      enabled: true,
      halfThickness: 0.4, // Enhanced thickness
      puffiness: 0.4, // Gaussian falloff
    },
    lod: {
      enabled: false,
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
    diskEccentricity: CONFIG.disk.eccentricity,
    diskEccentricityPrecessionSpeed: CONFIG.disk.eccentricityPrecessionSpeed,
    mhdTurbulenceIntensity: CONFIG.mhd.turbulenceIntensity,
    mhdSpiralArms: CONFIG.mhd.spiralArms,
    mhdSpiralTightness: CONFIG.mhd.spiralTightness,
    mhdHotspotIntensity: CONFIG.mhd.hotspotIntensity,
    mhdHotspotCount: CONFIG.mhd.hotspotCount,
    mhdPatternSpeed: CONFIG.mhd.patternSpeed,
    mhdMinDensity: CONFIG.mhd.minDensity,
    mhdHotspotEccentricity: CONFIG.mhd.hotspotEccentricity,
    supersampleLevel: CONFIG.antiAliasing.supersampleLevel,
    bhEdgeSoftness: CONFIG.antiAliasing.bhEdgeSoftness,
    photonSphereIntensity: CONFIG.photonSphere.intensity,
    // Overlays default to off
    overlayIsco: 0,
    overlayEventHorizon: 0,
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
    // Anti-banding step refinement
    stepJitter: CONFIG.rayMarching.stepJitter ? 1 : 0,
    curvatureAdaptation: CONFIG.rayMarching.curvatureAdaptation,
    coronaStepRefinement: CONFIG.rayMarching.coronaStepRefinement,
    baseStepSize: CONFIG.rayMarching.baseStepSize,
    // Noise LUT animation
    noiseTimeScale: CONFIG.noise.timeScale,
    // Binary black hole system
    wormholeEnabled: CONFIG.wormhole.enabled ? 1 : 0,
    wormholeThroatRadius: CONFIG.wormhole.throatRadius,
    wormholeThroatLength: CONFIG.wormhole.throatLength,
    wormholeFarBhPos: CONFIG.wormhole.farBlackHolePosition,
    binaryEnabled: CONFIG.binary.enabled ? 1 : 0,
    binaryMass1: CONFIG.binary.mass1,
    binarySeparation: CONFIG.binary.separation,
    circumbinaryOuterRadius: CONFIG.binary.circumbinaryOuterRadius,
    binaryBlendWidth: CONFIG.binary.blendWidth,
    streamWidth: CONFIG.binary.streamWidth,
    streamDensity: CONFIG.binary.streamDensity,
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
