uniform sampler2D starfield;
uniform sampler2D starfieldNext;
uniform float starfieldBlend;
uniform float starfieldExposure;
uniform sampler2D blackbodyLUT;
uniform sampler3D noiseLUT;
uniform float noiseTimeScale;
uniform vec3 cameraPos;
uniform mat4 inverseProjection;
uniform mat4 inverseView;
uniform float rs;
uniform int maxSteps;
uniform vec2 resolution;
uniform float diskInnerRadius;
uniform float diskOuterRadius;
uniform float diskTemperatureInner;
uniform float diskTemperatureOuter;
uniform float time;

// Volumetric disk parameters
uniform float diskHalfThickness;
uniform float diskVolumeDensity;

// MHD parameters
uniform float mhdTurbulenceIntensity;  // 0-1
uniform float mhdSpiralArms;           // 2-4
uniform float mhdSpiralTightness;      // How tightly wound
uniform float mhdHotspotIntensity;     // 0-1
uniform int mhdHotspotCount;           // 0-5
uniform float mhdPatternSpeed;         // Pattern rotation speed multiplier
uniform float mhdMinDensity;           // Minimum density for sparse areas (0-1)

// Luminance compression for detail preservation
uniform float diskLuminanceCompression;  // 0.0 = no compression, 1.0 = strong
uniform float diskTextureContrast;       // 0.0 = normal, 2.0 = high contrast survives bloom
uniform float diskMaterialSpeed;         // Multiplier for turbulence/material flow speed
uniform float diskOpacity;               // Base opacity (0 = transparent, 1 = opaque)

// Supersampling level (1 = off, 2 = 2x2, 4 = 4x4)
uniform int supersampleLevel;

// Black hole edge softness (0 = hard edge, 1 = very soft)
uniform float bhEdgeSoftness;

// Photon sphere glow intensity (0 = off, 1 = full)
uniform float photonSphereIntensity;

// Overlay visibility uniforms (0 = off, 1 = on)
uniform float overlayIsco;
uniform float overlayEventHorizon;
uniform float overlayDoppler;
uniform float overlayScale;

// Corona layer uniforms
uniform float coronaEnabled;
uniform float coronaRadius;
uniform float coronaDensity;
uniform float coronaTemperature;

// Jets layer uniforms
uniform float jetsEnabled;
uniform float jetsHalfOpeningAngle;
uniform float jetsLength;
uniform float jetsVelocity;
uniform float jetsDensity;

// Thick disk layer uniforms
uniform float thickDiskEnabled;
uniform float thickDiskHalfThickness;
uniform float thickDiskPuffiness;

// LOD uniforms
uniform float lodEnabled;
uniform float lodNearDistance;
uniform float lodFarDistance;

// Anti-banding step refinement uniforms
uniform float stepJitter;
uniform float curvatureAdaptation;
uniform float coronaStepRefinement;
uniform float baseStepSize;  // Base step size h (default 0.2) - controls band width

// Precomputed values (CPU-side optimization)
uniform float photonRingLogInner;   // log(rs * 1.5) - precomputed for photon ring mapping
uniform float photonRingLogOuter;   // log(diskInnerRadius) - precomputed for photon ring mapping
uniform float diskRadiusRange;      // diskOuterRadius - diskInnerRadius
uniform float anyOverlayEnabled;    // 1.0 if any overlay is on, 0.0 otherwise

varying vec2 vUv;

#define PI 3.14159265359
