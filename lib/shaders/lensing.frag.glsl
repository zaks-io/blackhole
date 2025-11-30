precision highp float;

uniform sampler2D starfield;
uniform sampler2D blackbodyLUT;
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
uniform float overlayPhotonSphere;
uniform float overlayEventHorizon;
uniform float overlayShadowEdge;
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

varying vec2 vUv;

#define PI 3.14159265359

// ============================================================================
// Noise Functions
// ============================================================================

// Permutation polynomial for hash
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

// Simplex 2D noise
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                   + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Fractal Brownian Motion - 4 octaves
float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float maxValue = 0.0;
  
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  
  return value / maxValue;
}

// RGB to HSV conversion
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Stable disk texture using uniform rotation + minimal warping
float advectedFBM(float r, float phi, float t, int octaves) {
  // Uniform rotation - entire pattern rotates together (prevents winding)
  float rot = t * diskMaterialSpeed * 0.1;
  float rotatedPhi = phi - rot;

  // Convert to Cartesian for seamless sampling
  float x = r * cos(rotatedPhi);
  float y = r * sin(rotatedPhi);
  vec2 pos = vec2(x, y);

  // Minimal warping - just enough to break perfect symmetry
  float warp = snoise(pos * 0.02 + t * 0.002) * 0.2;

  // Anisotropic noise stretched along rotation direction
  vec2 tangent = vec2(-sin(rotatedPhi), cos(rotatedPhi));
  vec2 radial = vec2(cos(rotatedPhi), sin(rotatedPhi));

  // Sample noise with tangential stretch (features elongated along orbit)
  // Higher radial = smaller/more streaks, lower tangent = longer streaks
  float tangentCoord = dot(pos, tangent) * 0.08 + warp;
  float radialCoord = dot(pos, radial) * 1.2;  // Much higher = smaller streaks

  return fbm(vec2(tangentCoord, radialCoord), octaves);
}

// ============================================================================
// MHD Effects
// ============================================================================

// Large-scale turbulent streaks using uniform rotation + minimal warping
float getLargeScaleTurbulence(float r, float phi, float t) {
  // Uniform rotation (no winding)
  float rot = t * diskMaterialSpeed * 0.08;
  float rotatedPhi = phi - rot;

  // Convert to Cartesian
  float x = r * cos(rotatedPhi);
  float y = r * sin(rotatedPhi);
  vec2 pos = vec2(x, y);

  // Minimal warping
  float warp = snoise(pos * 0.015 + t * 0.002) * 0.15;

  // Anisotropic stretch for arc-following streaks
  vec2 tangent = vec2(-sin(rotatedPhi), cos(rotatedPhi));
  vec2 radial = vec2(cos(rotatedPhi), sin(rotatedPhi));

  float tangentCoord = dot(pos, tangent) * 0.06 + warp;
  float radialCoord = dot(pos, radial) * 0.9;  // Higher = smaller streaks
  float blobs = snoise(vec2(tangentCoord, radialCoord));

  // Second layer at different rotation speed
  float rot2 = t * diskMaterialSpeed * 0.06;
  float x2 = r * cos(phi - rot2);
  float y2 = r * sin(phi - rot2);
  vec2 pos2 = vec2(x2, y2);

  vec2 tangent2 = vec2(-sin(phi - rot2), cos(phi - rot2));
  vec2 radial2 = vec2(cos(phi - rot2), sin(phi - rot2));
  float tc2 = dot(pos2, tangent2) * 0.07;
  float rc2 = dot(pos2, radial2) * 0.8;  // Higher = smaller streaks
  float blobs2 = snoise(vec2(tc2 + 5.0, rc2 + 5.0));

  return blobs * 0.6 + blobs2 * 0.4;
}

// Spiral density wave pattern
float getSpiralDensity(float r, float phi, float t) {
  // Logarithmic spiral: phase = m*phi + k*ln(r) - omega_p*t
  float k = mhdSpiralTightness;  // Spiral tightness
  float m = mhdSpiralArms;       // Number of arms
  
  // Pattern speed - slower than material (density wave)
  float patternOmega = 0.3 * mhdPatternSpeed;
  float spiralPhase = m * phi + k * log(r) - patternOmega * t;
  
  // Add some noise to break up perfect symmetry
  // Use seamless coordinates for noise
  float cx = cos(phi * 2.0 + t * 0.1);
  float cy = sin(phi * 2.0 + t * 0.1);
  float noisePhase = snoise(vec2(r * 0.5 + cx, cy)) * 0.4;
  
  // Soft sine wave for spiral arms
  float spiral = 0.5 + 0.5 * sin(spiralPhase + noisePhase);
  
  // Sharpen the arms slightly
  spiral = pow(spiral, 0.7);
  
  return spiral;
}

// Orbiting hot spots
float getHotspots(float r, float phi, float t) {
  float hotspotSum = 0.0;
  
  // Define hot spot properties (radius, initial angle, size)
  // These create asymmetric, orbiting bright regions
  
  for (int i = 0; i < 5; i++) {
    if (i >= mhdHotspotCount) break;
    
    // Each hot spot at different radius
    float spotRadius = diskInnerRadius + float(i) * (diskOuterRadius - diskInnerRadius) / 5.0 + 1.0;
    
    // Initial angle - spread around disk
    float spotPhi0 = float(i) * 2.0 * PI / 5.0 + float(i) * 0.7;
    
    // Keplerian orbit rate at this radius
    float omega = sqrt(0.5 * rs / spotRadius) / spotRadius;
    float spotPhi = spotPhi0 + omega * t * mhdPatternSpeed;
    
    // Angular difference (wrapped to -PI, PI)
    float dPhi = phi - spotPhi;
    dPhi = mod(dPhi + PI, 2.0 * PI) - PI;
    
    // Distance in disk plane (approximate arc length for angular component)
    float dr = r - spotRadius;
    float dArc = dPhi * r;
    float dist = sqrt(dr * dr + dArc * dArc);
    
    // Gaussian falloff - size varies per spot
    float spotSize = 0.8 + 0.4 * sin(float(i) * 1.3);
    float spot = exp(-dist * dist / (spotSize * spotSize));
    
    // Add some flickering/variability
    float flicker = 0.8 + 0.2 * sin(t * 3.0 + float(i) * 2.1);
    
    hotspotSum += spot * flicker;
  }
  
  return hotspotSum;
}

// Fine detail noise layer using uniform rotation + minimal warping
float getFineDetail(float r, float phi, float t) {
  // Uniform rotation (slightly faster for fine detail)
  float rot = t * diskMaterialSpeed * 0.12;
  float rotatedPhi = phi - rot;

  // Convert to Cartesian
  float x = r * cos(rotatedPhi);
  float y = r * sin(rotatedPhi);
  vec2 pos = vec2(x, y);

  // Tangential stretch for fine arc-following streaks
  vec2 tangent = vec2(-sin(rotatedPhi), cos(rotatedPhi));
  vec2 radial = vec2(cos(rotatedPhi), sin(rotatedPhi));

  float tangentCoord = dot(pos, tangent) * 0.15;
  float radialCoord = dot(pos, radial) * 1.4;  // Higher = finer detail
  float fine1 = snoise(vec2(tangentCoord, radialCoord));

  // Second fine layer at different rotation speed
  float rot2 = t * diskMaterialSpeed * 0.15;
  float x2 = r * cos(phi - rot2);
  float y2 = r * sin(phi - rot2);
  vec2 pos2 = vec2(x2, y2);

  vec2 tangent2 = vec2(-sin(phi - rot2), cos(phi - rot2));
  vec2 radial2 = vec2(cos(phi - rot2), sin(phi - rot2));
  float tc2 = dot(pos2, tangent2) * 0.18;
  float rc2 = dot(pos2, radial2) * 1.2;  // Higher = finer detail
  float fine2 = snoise(vec2(tc2 + 5.0, rc2 + 5.0));

  return fine1 * 0.6 + fine2 * 0.4;
}

// Combined MHD density modulation
float getMHDDensity(float r, float phi, float t) {
  float density = 1.0;

  // Large-scale turbulent streaks
  float largeBlobs = getLargeScaleTurbulence(r, phi, t);
  float blobMod = 1.0 + largeBlobs * 0.6 * mhdTurbulenceIntensity;  // Reduced

  // Motion-blurred turbulence for tangential streaks
  float turbulence = advectedFBM(r, phi, t, 3);
  float turbMod = 1.0 + turbulence * 0.4 * mhdTurbulenceIntensity;  // Reduced

  // Spiral density waves (minimal influence)
  float spiral = getSpiralDensity(r, phi, t);
  float spiralMod = 0.95 + 0.1 * spiral * mhdTurbulenceIntensity;  // Reduced

  // Fine detail layer for added texture richness
  float fineDetail = getFineDetail(r, phi, t);
  float fineMod = 1.0 + fineDetail * 0.3 * mhdTurbulenceIntensity;  // Reduced

  density *= blobMod * turbMod * spiralMod * fineMod;

  // Clamp with configurable minimum density - narrower range
  return clamp(density, mhdMinDensity, 2.0);
}

// Combined MHD temperature modulation
float getMHDTemperature(float r, float phi, float t) {
  float tempMod = 1.0;

  // Hot spots add temperature
  float hotspots = getHotspots(r, phi, t);
  tempMod += hotspots * 0.35 * mhdHotspotIntensity;

  // Spiral arms are slightly hotter (compressed gas)
  float spiral = getSpiralDensity(r, phi, t);
  tempMod += (spiral - 0.5) * 0.15 * mhdTurbulenceIntensity;

  // Small-scale temperature fluctuations using offset radius for variation
  float tempNoise = advectedFBM(r * 1.3 + 5.0, phi + 1.0, t, 3);
  tempMod += tempNoise * 0.1 * mhdTurbulenceIntensity;

  return clamp(tempMod, 0.7, 1.6);
}

// ============================================================================
// Optimized Combined MHD - caches shared calculations
// ============================================================================

struct MHDResult {
  float density;
  float temperature;
};

// LOD-aware FBM octave count
int getLodOctaves(float lod) {
  // lod: 1.0 = near (full detail), 0.0 = far (minimal detail)
  // Returns 1-4 octaves based on LOD
  return int(mix(1.0, 4.0, lod));
}

// Optimized combined MHD function - computes both density and temperature
// with shared calculations done only once
MHDResult getMHDCombined(float r, float phi, float t, float lod) {
  MHDResult result;
  result.density = 1.0;
  result.temperature = 1.0;

  // Compute spiral ONCE (was computed in both getMHDDensity and getMHDTemperature)
  float spiral = getSpiralDensity(r, phi, t);

  // Cache common rotation values
  float rot = t * diskMaterialSpeed * 0.1;
  float rotatedPhi = phi - rot;
  float cosRP = cos(rotatedPhi);
  float sinRP = sin(rotatedPhi);

  // LOD-based octave count for noise functions
  int octaves = getLodOctaves(lod);

  // === DENSITY CALCULATION ===

  // Large-scale turbulent streaks (using cached trig)
  float rot08 = t * diskMaterialSpeed * 0.08;
  float rotatedPhi08 = phi - rot08;
  float x = r * cos(rotatedPhi08);
  float y = r * sin(rotatedPhi08);
  vec2 pos = vec2(x, y);
  float warp = snoise(pos * 0.015 + t * 0.002) * 0.15;
  vec2 tangent = vec2(-sin(rotatedPhi08), cos(rotatedPhi08));
  vec2 radial = vec2(cos(rotatedPhi08), sin(rotatedPhi08));
  float tangentCoord = dot(pos, tangent) * 0.06 + warp;
  float radialCoord = dot(pos, radial) * 0.9;
  float blobs = snoise(vec2(tangentCoord, radialCoord));

  // Second layer at different rotation speed
  float rot2 = t * diskMaterialSpeed * 0.06;
  float x2 = r * cos(phi - rot2);
  float y2 = r * sin(phi - rot2);
  vec2 pos2 = vec2(x2, y2);
  vec2 tangent2 = vec2(-sin(phi - rot2), cos(phi - rot2));
  vec2 radial2 = vec2(cos(phi - rot2), sin(phi - rot2));
  float tc2 = dot(pos2, tangent2) * 0.07;
  float rc2 = dot(pos2, radial2) * 0.8;
  float blobs2 = snoise(vec2(tc2 + 5.0, rc2 + 5.0));

  float largeBlobs = blobs * 0.6 + blobs2 * 0.4;
  float blobMod = 1.0 + largeBlobs * 0.6 * mhdTurbulenceIntensity;

  // Motion-blurred turbulence (LOD-aware octaves)
  float turbulence = advectedFBM(r, phi, t, octaves);
  float turbMod = 1.0 + turbulence * 0.4 * mhdTurbulenceIntensity;

  // Spiral density waves (use cached spiral)
  float spiralMod = 0.95 + 0.1 * spiral * mhdTurbulenceIntensity;

  // Fine detail layer (skip at low LOD)
  float fineMod = 1.0;
  if (lod > 0.3) {
    // Fine detail (using cached trig for first layer)
    float rot12 = t * diskMaterialSpeed * 0.12;
    float rotatedPhi12 = phi - rot12;
    float xf = r * cos(rotatedPhi12);
    float yf = r * sin(rotatedPhi12);
    vec2 posf = vec2(xf, yf);
    vec2 tangentF = vec2(-sin(rotatedPhi12), cos(rotatedPhi12));
    vec2 radialF = vec2(cos(rotatedPhi12), sin(rotatedPhi12));
    float tcf = dot(posf, tangentF) * 0.15;
    float rcf = dot(posf, radialF) * 1.4;
    float fine1 = snoise(vec2(tcf, rcf));

    float rot15 = t * diskMaterialSpeed * 0.15;
    float xf2 = r * cos(phi - rot15);
    float yf2 = r * sin(phi - rot15);
    vec2 posf2 = vec2(xf2, yf2);
    vec2 tangentF2 = vec2(-sin(phi - rot15), cos(phi - rot15));
    vec2 radialF2 = vec2(cos(phi - rot15), sin(phi - rot15));
    float tcf2 = dot(posf2, tangentF2) * 0.18;
    float rcf2 = dot(posf2, radialF2) * 1.2;
    float fine2 = snoise(vec2(tcf2 + 5.0, rcf2 + 5.0));

    float fineDetail = fine1 * 0.6 + fine2 * 0.4;
    fineMod = 1.0 + fineDetail * 0.3 * mhdTurbulenceIntensity * lod;
  }

  result.density = blobMod * turbMod * spiralMod * fineMod;
  result.density = clamp(result.density, mhdMinDensity, 2.0);

  // === TEMPERATURE CALCULATION ===

  // Hot spots
  float hotspots = getHotspots(r, phi, t);
  result.temperature += hotspots * 0.35 * mhdHotspotIntensity;

  // Spiral arms are slightly hotter (use cached spiral)
  result.temperature += (spiral - 0.5) * 0.15 * mhdTurbulenceIntensity;

  // Small-scale temperature fluctuations (LOD-aware octaves)
  float tempNoise = advectedFBM(r * 1.3 + 5.0, phi + 1.0, t, octaves);
  result.temperature += tempNoise * 0.1 * mhdTurbulenceIntensity;

  result.temperature = clamp(result.temperature, 0.7, 1.6);

  return result;
}

// ============================================================================
// LOD System
// ============================================================================

float calculateLOD(float camDist) {
  if (lodEnabled < 0.5) return 1.0;
  return 1.0 - smoothstep(lodNearDistance * rs, lodFarDistance * rs, camDist);
}

// ============================================================================
// Corona Layer
// ============================================================================

vec4 sampleCorona(vec3 rayPos, vec3 rayDir, float r, float lod) {
  if (coronaEnabled < 0.5) return vec4(0.0);
  if (r > coronaRadius || r < rs * 1.5) return vec4(0.0);

  // Suppress corona for rays likely to be captured (heading inward near photon sphere)
  vec3 radialDir = normalize(rayPos);
  float radialVel = dot(rayDir, radialDir);
  if (r < rs * 2.0 && radialVel < 0.0) return vec4(0.0);

  // Spheroidal geometry - flatten in Y for sandwich corona
  float cylR = length(rayPos.xz);
  float scaleHeight = coronaRadius * 0.5;
  float scaledY = rayPos.y / scaleHeight;
  float spheroidR = sqrt(cylR * cylR + scaledY * scaledY);

  // Density falloff - peaks at inner edge, falls off outward
  float normalizedR = (spheroidR - rs) / (coronaRadius - rs);
  float density = coronaDensity * exp(-normalizedR * normalizedR * 2.0);

  // Turbulent structure at high LOD
  if (lod > 0.5) {
    float phi = atan(rayPos.z, rayPos.x);
    float turb = snoise(vec2(r * 2.0 + time * 0.1, phi * 3.0));
    density *= 1.0 + turb * 0.4 * lod;
  }

  // Blue-white corona color
  vec3 color = vec3(0.7, 0.85, 1.0);

  // Emission scales with density - reduced for subtle glow
  float emission = density * 1.5;
  float alpha = density * 0.15;

  return vec4(color * emission, alpha);
}

// ============================================================================
// Jets Layer
// ============================================================================

vec4 sampleJet(vec3 rayPos, vec3 rayDir, float r, float lod) {
  if (jetsEnabled < 0.5) return vec4(0.0);

  float absY = abs(rayPos.y);
  if (absY > jetsLength) return vec4(0.0);

  // Jets emerge from a funnel above the ISCO region
  // The jet base is at the ISCO radius (3rs), not at the origin
  // This creates a hollow cone that starts wide and collimates
  float cylR = length(rayPos.xz);
  float halfAngleRad = radians(jetsHalfOpeningAngle);

  // Jet inner edge: material launches from ~ISCO radius at disk level
  // and collimates toward the axis with height
  float launchRadius = diskInnerRadius * rs;  // ISCO = 3rs
  float collimationHeight = 10.0 * rs;  // Height over which jet collimates
  float collimationFactor = clamp(absY / collimationHeight, 0.0, 1.0);

  // Inner boundary shrinks from launchRadius to near-zero as height increases
  float innerR = launchRadius * (1.0 - collimationFactor * 0.9);
  // Outer boundary is the cone
  float outerR = launchRadius + absY * tan(halfAngleRad);

  // Must be within the hollow cone
  if (cylR > outerR || cylR < innerR * 0.3) return vec4(0.0);

  // Suppress jet emission for rays that would show the shadow
  // The shadow appears where rays have impact parameter < critical value (~2.6rs)
  // For rays near the axis looking at the black hole, don't render jet over shadow
  vec3 radialDir = normalize(rayPos);
  float radialVel = dot(rayDir, radialDir);

  // Calculate impact parameter: perpendicular distance from ray to origin
  vec3 toOrigin = -rayPos;
  vec3 perpendicular = toOrigin - dot(toOrigin, rayDir) * rayDir;
  float impactParam = length(perpendicular);

  // Smoothly fade jet near shadow region instead of hard cutoff
  // Critical impact parameter for capture is ~2.6rs (photon sphere crossing)
  float criticalImpact = 2.6 * rs;
  float shadowFade = 1.0;
  if (radialVel < 0.0) {
    // Smooth fade from criticalImpact to criticalImpact + 1rs
    shadowFade = smoothstep(criticalImpact, criticalImpact + 1.0 * rs, impactParam);
  }

  // Also fade near the hole
  float holeFade = smoothstep(rs * 1.2, rs * 2.0, r);

  // Density profile - concentrated toward center of hollow cone
  float coneCenter = (innerR + outerR) * 0.5;
  float coneWidth = outerR - innerR;
  float distFromCenter = abs(cylR - coneCenter) / max(coneWidth * 0.5, 0.01);
  float radialFalloff = exp(-distFromCenter * distFromCenter * 2.0);

  // Smooth fade-in from the disk plane - no hard cutoff
  // Jet gradually emerges from the disk over ~2rs height
  float baseFadeIn = smoothstep(0.0, 2.0 * rs, absY);

  // Height falloff - jets stay bright longer at distance
  float heightFalloff = 1.0 / (1.0 + absY / (30.0 * rs));
  // Brighter base region near the disk (but after fade-in)
  float baseBrightening = 1.0 + 1.5 * exp(-absY / (5.0 * rs));
  float density = jetsDensity * radialFalloff * heightFalloff * baseBrightening * baseFadeIn * shadowFade * holeFade;

  // Relativistic beaming
  float jetVelY = sign(rayPos.y) * jetsVelocity;
  vec3 jetVel = vec3(0.0, jetVelY, 0.0);
  float vDotRay = dot(jetVel, -rayDir);
  float gamma = 1.0 / sqrt(max(0.01, 1.0 - jetsVelocity * jetsVelocity));
  float doppler = 1.0 / (gamma * (1.0 - vDotRay));
  doppler = clamp(doppler, 0.1, 10.0);

  // Relativistic beaming - use full cubic power for physical accuracy
  // Approaching jet can be extremely bright (doppler > 1)
  // Receding jet is very dim but not invisible (doppler < 1)
  float beaming = pow(doppler, 3.0);
  beaming = max(beaming, 0.05);  // Minimum 5% visibility for receding jet

  // Helical structure at high LOD
  if (lod > 0.3) {
    float phi = atan(rayPos.z, rayPos.x);
    float helix = 0.5 + 0.5 * sin(phi * 4.0 + absY * 0.5 - time * 2.0);
    density *= 0.7 + 0.3 * helix;
  }

  // Synchrotron color - blue/cyan base, shifts based on Doppler
  // Approaching (doppler > 1): blueshift toward white/blue
  // Receding (doppler < 1): redshift toward red/orange
  vec3 baseColor = vec3(0.3, 0.6, 1.0);  // Blue synchrotron base (less red)
  vec3 blueShifted = vec3(0.7, 0.85, 1.0);  // Bright white-blue
  vec3 redShifted = vec3(1.0, 0.3, 0.1);  // Dim red-orange for receding

  vec3 color;
  if (doppler > 1.0) {
    color = mix(baseColor, blueShifted, clamp(doppler - 1.0, 0.0, 1.0));
  } else {
    color = mix(baseColor, redShifted, clamp(1.0 - doppler, 0.0, 0.8));
  }

  // Increased emission for visibility
  float emission = density * beaming * 3.0;
  float alpha = density * 0.4;

  return vec4(color * emission, alpha);
}

// ============================================================================
// Overlay Rendering
// ============================================================================

// Render a ring in a horizontal plane at given height and radius
// Returns color contribution if ray passes near the ring
vec4 renderHorizontalRing(vec3 rayPos, vec3 prevPos, float targetRadius, float targetY, float thickness, vec3 ringColor, float intensity) {
  // Check if ray crossed the target y plane
  if ((prevPos.y - targetY) * (rayPos.y - targetY) > 0.0) {
    return vec4(0.0);
  }

  // Find intersection point with y=targetY plane
  float t = abs(prevPos.y - targetY) / (abs(prevPos.y - targetY) + abs(rayPos.y - targetY));
  vec3 hitPos = mix(prevPos, rayPos, t);
  float hitR = length(hitPos.xz);

  // Distance from ring
  float dist = abs(hitR - targetRadius);
  float fade = 1.0 - smoothstep(0.0, thickness, dist);

  if (fade > 0.0) {
    return vec4(ringColor * fade * intensity, fade * intensity * 0.8);
  }
  return vec4(0.0);
}

// Render a ring in the disk plane (y=0) at given radius
vec4 renderDiskPlaneRing(vec3 rayPos, vec3 prevPos, float targetRadius, float thickness, vec3 ringColor, float intensity) {
  return renderHorizontalRing(rayPos, prevPos, targetRadius, 0.0, thickness, ringColor, intensity);
}

// Render a spherical shell overlay at given radius
vec4 renderSphereRing(float currentR, float prevR, float targetRadius, float thickness, vec3 ringColor, float intensity) {
  // Check if we crossed the target radius
  float minR = min(currentR, prevR);
  float maxR = max(currentR, prevR);

  if (targetRadius < minR || targetRadius > maxR) {
    return vec4(0.0);
  }

  // We crossed the shell - calculate fade based on how close we are
  float dist = min(abs(currentR - targetRadius), abs(prevR - targetRadius));
  float fade = 1.0 - smoothstep(0.0, thickness, dist);

  if (fade > 0.0) {
    return vec4(ringColor * fade * intensity, fade * intensity * 0.8);
  }
  return vec4(0.0);
}

// Equirectangular UV from direction
vec2 dirToUV(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(0.5 + phi / (2.0 * PI), 0.5 + theta / PI);
}

vec3 sampleStarfield(vec3 dir) {
  return texture2D(starfield, dirToUV(dir)).rgb;
}

vec3 sampleBlackbody(float temp) {
  float t = clamp((temp - 1000.0) / 14000.0, 0.0, 1.0);
  return texture2D(blackbodyLUT, vec2(t, 0.5)).rgb;
}

vec4 sampleDisk(vec3 hitPos, vec3 rayDir, float r, int crossingIndex, float lod) {
  // Get azimuthal angle for MHD effects
  float phi = atan(hitPos.z, hitPos.x);

  // Keplerian velocity
  float v = sqrt(0.5 * rs / r);
  vec3 tangent = normalize(vec3(-hitPos.z, 0.0, hitPos.x));
  vec3 vel = tangent * v;

  // Doppler shift
  float vr = dot(vel, -rayDir);
  float doppler = sqrt((1.0 + vr) / (1.0 - vr));

  // Gravitational redshift: photons lose energy climbing out of gravity well
  // Factor of sqrt(1 - rs/r) from Schwarzschild metric
  float gravRedshift = sqrt(1.0 - rs / r);

  // Get MHD modulations using optimized combined function
  MHDResult mhd = getMHDCombined(r, phi, time, lod);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;
  
  // Temperature with Doppler, gravitational redshift, and MHD modulation
  float frac = (r - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);
  float baseTemp = mix(diskTemperatureInner, diskTemperatureOuter, frac);
  float temp = baseTemp * doppler * gravRedshift * mhdTemp;
  
  vec3 color = sampleBlackbody(temp);

  // Doppler indicator overlay: use direct color replacement for clarity
  if (overlayDoppler > 0.0) {
    float brightness = dot(color, vec3(0.299, 0.587, 0.114));

    if (doppler > 1.0) {
      // Approaching (blueshift) - replace with cyan-blue
      float shift = clamp((doppler - 1.0) * 3.0, 0.0, 1.0);
      float blendStrength = shift * overlayDoppler;

      // Saturated blue color, scaled by original brightness
      vec3 blueColor = vec3(0.3, 0.6, 1.0) * brightness * 1.5;
      color = mix(color, blueColor, blendStrength * 0.8);

    } else {
      // Receding (redshift) - replace with orange-red
      float shift = clamp((1.0 - doppler) * 3.0, 0.0, 1.0);
      float blendStrength = shift * overlayDoppler;

      // Saturated orange-red color, scaled by original brightness
      vec3 redColor = vec3(1.0, 0.4, 0.2) * brightness * 1.2;
      color = mix(color, redColor, blendStrength * 0.7);
    }
  }

  // Intensity: Include gravitational redshift (photon energy loss)
  // Disk stays bright right to the edge
  float dopplerBoost = pow(doppler, 3.0);

  // Reduce intensity boost when Doppler overlay is active to preserve colors
  if (overlayDoppler > 0.0) {
    // Mix from cubic to linear Doppler for clearer color visualization
    dopplerBoost = mix(dopplerBoost, doppler, overlayDoppler * 0.7);
  }

  float baseIntensity = dopplerBoost * gravRedshift / (1.0 + frac * 2.0);
  
  // Apply Reinhard tonemapping to compress dynamic range while preserving local contrast
  // This prevents the bright Doppler-boosted side from washing out texture detail
  float compressedIntensity = baseIntensity / (1.0 + baseIntensity * diskLuminanceCompression);
  
  // Boost texture contrast on bright regions so it survives bloom blur
  // Higher brightness = more contrast boost needed to remain visible after blur
  float contrastMult = 1.0 + diskTextureContrast * sqrt(compressedIntensity);
  float boostedDensity = 1.0 + (mhdDensity - 1.0) * contrastMult;
  
  // MHD modulation with boosted contrast
  float intensity = compressedIntensity * boostedDensity;
  
  // Higher-order images (photon rings) are demagnified
  // Each orbit around BH loses ~60% of brightness due to photon loss
  float higherOrderDecay = pow(0.6, float(crossingIndex));
  intensity *= higherOrderDecay;
  
  // Alpha: smooth edge fading
  // Inner edge: fairly sharp at ISCO
  float innerEdgeWidth = (diskOuterRadius - diskInnerRadius) * 0.05;
  float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + innerEdgeWidth, r);
  // Outer edge: much wider/smoother fade for natural falloff
  float outerEdgeWidth = (diskOuterRadius - diskInnerRadius) * 0.25;
  float outerFade = smoothstep(diskOuterRadius, diskOuterRadius - outerEdgeWidth, r);
  
  // Bright rim at ISCO - material piles up at innermost stable orbit
  float innerRim = exp(-pow((r - diskInnerRadius) / (0.5 * rs), 2.0)) * 0.3;
  
  float alpha = innerFade * outerFade * diskOpacity;
  
  // Emissive boost for bloom - preserve texture/contrast on bright Doppler side
  // Use softer multipliers and clamp to prevent washout
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.6 + (mhdTemp - 1.0) * 0.8 + innerRim;
  emissiveBoost = clamp(emissiveBoost, 0.3, 2.0);
  
  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}

// Trace a single ray and return the color + TAA mask in alpha
vec4 traceRay(vec2 uv) {
  // Ray from camera through pixel
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;

  float camDist = length(cameraPos);
  float lod = calculateLOD(camDist);

  vec3 color = vec3(0.0);
  vec4 diskAccum = vec4(0.0);
  vec4 overlayAccum = vec4(0.0); // Accumulated overlay contributions
  bool hitHorizon = false;
  bool escaped = false;

  // Track minimum radius for black hole edge mask and photon sphere glow
  float minRadius = 1000.0;
  
  // Track disk plane crossings for higher-order photon ring images
  int diskCrossings = 0;
  
  float h = 0.2;
  
  // Precompute loop invariants for performance
  float rsSq = rs * rs;
  float escapeThreshold = max(camDist * 2.0, 100.0);
  float diskInnerSq = diskInnerRadius * diskInnerRadius;
  float diskOuterSq = diskOuterRadius * diskOuterRadius;

  for (int i = 0; i < 300; i++) {
    if (i >= maxSteps) break;

    // Use squared distance to avoid sqrt when possible
    float rSq = dot(rayPos, rayPos);
    float r = sqrt(rSq);

    // Track closest approach to black hole
    minRadius = min(minRadius, r);

    // Early opacity exit - stop if disk is fully opaque
    if (diskAccum.a > 0.98) break;

    if (rSq < rsSq) {
      hitHorizon = true;
      break;
    }

    vec3 rHat = rayPos / r;
    float radialVel = dot(rayDir, rHat);
    if (r > escapeThreshold && radialVel > 0.0) {
      color = sampleStarfield(rayDir);
      escaped = true;
      break;
    }

    float vDotR = radialVel; // Already computed above
    float vPerpSq = 1.0 - vDotR * vDotR;
    float accel = -1.5 * rs * vPerpSq / rSq;
    
    vec3 dv = accel * rHat * h;
    rayDir = normalize(rayDir + dv);
    
    float prevY = rayPos.y;
    float step = h * max(1.0, (r - rs) / rs);
    step = min(step, 0.5);
    
    vec3 newPos = rayPos + rayDir * step;
    float currY = newPos.y;
    
    // Disk plane crossing detection - track multiple crossings for photon rings
    if (prevY * currY < 0.0) {
      float t = abs(prevY) / (abs(prevY) + abs(currY));
      vec3 hitPos = mix(rayPos, newPos, t);
      float hitR = length(hitPos.xz);

      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        // Pass crossing index for higher-order image brightness decay
        vec4 newDisk = sampleDisk(hitPos, rayDir, hitR, diskCrossings, lod);
        float remaining = 1.0 - diskAccum.a;
        diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
        diskAccum.a += newDisk.a * remaining;

        // Allow multiple crossings (up to 4) for higher-order photon rings
        // Only break early if we've accumulated enough opacity
        if (diskAccum.a > 0.99 && diskCrossings >= 2) break;
      }

      // Check disk-plane overlay rings at this crossing
      float ringThickness = 0.15 * rs;

      // ISCO ring (3rs) - Cyan
      if (overlayIsco > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, 3.0 * rs, ringThickness, vec3(0.0, 0.85, 0.85), overlayIsco);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Shadow edge ring (~2.6rs) - Purple/Magenta
      if (overlayShadowEdge > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, 2.598 * rs, ringThickness, vec3(0.8, 0.3, 0.9), overlayShadowEdge);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Photon sphere ring (1.5rs) - Gold
      if (overlayPhotonSphere > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, 1.5 * rs, ringThickness * 0.8, vec3(1.0, 0.85, 0.0), overlayPhotonSphere);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Event horizon ring - Red - placed at 1.1rs to ensure rays detect it before terminating at horizon
      if (overlayEventHorizon > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, rs * 1.1, ringThickness, vec3(1.0, 0.15, 0.15), overlayEventHorizon);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Increment crossing counter regardless of whether we hit the disk
      // This tracks ray orbits around the black hole
      diskCrossings++;
    }

    // Scale rings at 5rs intervals - elevated above disk plane for visibility
    // Check every step, not just disk plane crossings
    if (overlayScale > 0.0) {
      float scaleHeight = 1.5 * rs;  // Height above disk plane
      float scaleThickness = 0.2 * rs;
      for (float scaleR = 5.0; scaleR <= 15.0; scaleR += 5.0) {
        // Render ring above the disk
        vec4 ringAbove = renderHorizontalRing(newPos, rayPos, scaleR * rs, scaleHeight, scaleThickness, vec3(0.7, 0.7, 0.75), overlayScale);
        overlayAccum.rgb += ringAbove.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ringAbove.a);
        // Render ring below the disk (mirror)
        vec4 ringBelow = renderHorizontalRing(newPos, rayPos, scaleR * rs, -scaleHeight, scaleThickness, vec3(0.7, 0.7, 0.75), overlayScale);
        overlayAccum.rgb += ringBelow.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ringBelow.a);
      }
    }
    
    rayPos = newPos;

    // Volumetric disk sampling with configurable thickness
    float effectiveThickness = thickDiskEnabled > 0.5 ? thickDiskHalfThickness : diskHalfThickness;
    float absY = abs(rayPos.y);
    if (absY < effectiveThickness) {
      float hitR = length(rayPos.xz);
      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        float normalizedY = absY / effectiveThickness;

        // Vertical density profile
        float verticalDensity;
        if (thickDiskEnabled > 0.5) {
          // Gaussian profile for thick disk (more realistic puffy appearance)
          float sigma = thickDiskPuffiness;
          verticalDensity = exp(-normalizedY * normalizedY / (2.0 * sigma * sigma));
        } else {
          // Original quadratic falloff for thin disk
          verticalDensity = pow(1.0 - normalizedY, 2.0);
        }

        // LOD-based sample skipping for thick disk
        bool shouldSample = true;
        if (thickDiskEnabled > 0.5 && lod < 0.7) {
          int skipRate = lod < 0.3 ? 3 : 2;
          shouldSample = (i % skipRate == 0);
        }

        if (shouldSample) {
          vec3 projectedPos = vec3(rayPos.x, 0.0, rayPos.z);
          vec4 volColor = sampleDisk(projectedPos, rayDir, hitR, diskCrossings, lod);

          // Adjust alpha for sample skipping
          float skipMultiplier = 1.0;
          if (thickDiskEnabled > 0.5 && lod < 0.7) {
            skipMultiplier = lod < 0.3 ? 3.0 : 2.0;
          }

          float volAlpha = volColor.a * verticalDensity * diskVolumeDensity * step * skipMultiplier;
          float remaining = 1.0 - diskAccum.a;
          diskAccum.rgb += volColor.rgb * volAlpha * remaining;
          diskAccum.a += volAlpha * remaining;
        }
      }
    }

    // Corona sampling
    if (coronaEnabled > 0.5 && r < coronaRadius * 2.0) {
      vec4 coronaSample = sampleCorona(rayPos, rayDir, r, lod);
      if (coronaSample.a > 0.001) {
        float remaining = 1.0 - diskAccum.a;
        diskAccum.rgb += coronaSample.rgb * coronaSample.a * remaining;
        diskAccum.a += coronaSample.a * remaining;
      }
    }

    // Jets sampling - additive emission (jets emit light, don't occlude)
    if (jetsEnabled > 0.5 && abs(rayPos.y) > rs * 0.3) {
      vec4 jetSample = sampleJet(rayPos, rayDir, r, lod);
      if (jetSample.a > 0.001) {
        // Pure additive blending - jet light adds to whatever is there
        diskAccum.rgb += jetSample.rgb;
        // Small alpha contribution so jets don't disappear entirely
        diskAccum.a = max(diskAccum.a, jetSample.a * 0.3);
      }
    }
  }
  
  // Determine background color
  vec3 backgroundColor = vec3(0.0);
  if (!hitHorizon) {
    if (escaped) {
      backgroundColor = color;
    } else {
      backgroundColor = sampleStarfield(rayDir);
    }
  }
  
  // Composite disk over background
  if (diskAccum.a > 0.0) {
    float remaining = 1.0 - diskAccum.a;
    color = diskAccum.rgb + backgroundColor * remaining;
  } else {
    color = backgroundColor;
  }
  
  // Photon sphere glow: rays passing near r = 1.5rs (photon sphere)
  // create the bright ring visible in EHT images
  if (!hitHorizon && minRadius < 2.5 * rs && minRadius > rs && photonSphereIntensity > 0.0) {
    float photonSphereRadius = 1.5 * rs;
    float psDistance = abs(minRadius - photonSphereRadius);
    
    // Gaussian glow centered on photon sphere
    float sigma = 0.15 * rs;
    float psGlow = exp(-psDistance * psDistance / (2.0 * sigma * sigma));
    
    // Scale by intensity and add warm white glow (slightly orange for hot gas)
    vec3 glowColor = vec3(1.0, 0.92, 0.85) * psGlow * photonSphereIntensity * 0.2;
    
    // Additive blend - photon sphere is bright!
    color += glowColor;
  }

  // Add accumulated overlay contributions (already computed during ray march)
  if (overlayAccum.a > 0.0) {
    // Additive blend for glowing overlays
    color += overlayAccum.rgb * overlayAccum.a;
  }

  return vec4(color, 1.0);
}

// Simple hash function for jitter
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

// Quick trace to detect if near black hole edge (returns minRadius)
float traceEdgeDetect(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;
  
  float camDist = length(cameraPos);
  float minR = 1000.0;
  float h = 0.3; // Larger step for speed
  
  // Quick march with fewer steps
  for (int i = 0; i < 80; i++) {
    float r = length(rayPos);
    minR = min(minR, r);
    
    if (r < rs) return minR; // Hit horizon
    if (r > max(camDist * 2.0, 100.0)) return minR; // Escaped
    
    vec3 rHat = rayPos / r;
    float vDotR = dot(rayDir, rHat);
    float vPerpSq = 1.0 - vDotR * vDotR;
    float accel = -1.5 * rs * vPerpSq / (r * r);
    
    rayDir = normalize(rayDir + accel * rHat * h);
    rayPos += rayDir * h;
  }
  return minR;
}

void main() {
  vec4 result;
  vec2 pixelSize = 1.0 / resolution;
  
  if (supersampleLevel <= 1) {
    // No supersampling requested, but check if we're near the BH edge
    // If bhEdgeSoftness > 0, do adaptive edge supersampling
    if (bhEdgeSoftness > 0.0) {
      float minR = traceEdgeDetect(vUv);
      float photonSphere = rs * 1.5;
      float edgeThreshold = rs * (2.0 + bhEdgeSoftness * 2.0); // 2-4 rs range
      
      // Near the photon sphere = potential edge aliasing
      if (minR < edgeThreshold && minR > rs * 0.5) {
        // Adaptive 2x2 supersampling for edge pixels
        vec4 accum = vec4(0.0);
        vec2 pixelCoord = vUv * resolution;
        
        for (int sy = 0; sy < 2; sy++) {
          for (int sx = 0; sx < 2; sx++) {
            vec2 cellIndex = vec2(float(sx), float(sy));
            vec2 jitter = hash2(pixelCoord + cellIndex * 17.31) - 0.5;
            vec2 offset = (cellIndex + 0.5 + jitter * 0.6) / 2.0 - 0.5;
            accum += traceRay(vUv + offset * pixelSize);
          }
        }
        result = accum / 4.0;
      } else {
        result = traceRay(vUv);
      }
    } else {
      result = traceRay(vUv);
    }
  } else {
    // Full supersampling with NxN jittered grid
    result = vec4(0.0);
    float n = float(supersampleLevel);
    float sampleCount = n * n;
    
    // Base pixel coordinate for consistent jitter pattern
    vec2 pixelCoord = vUv * resolution;
    
    for (int sy = 0; sy < 4; sy++) {
      if (sy >= supersampleLevel) break;
      for (int sx = 0; sx < 4; sx++) {
        if (sx >= supersampleLevel) break;
        
        // Stratified jitter: random offset within each grid cell
        // This breaks up regular aliasing patterns
        vec2 cellIndex = vec2(float(sx), float(sy));
        vec2 jitter = hash2(pixelCoord + cellIndex * 13.37) - 0.5; // -0.5 to 0.5
        
        // Sample position: grid cell center + jitter within cell
        vec2 cellOffset = (cellIndex + 0.5 + jitter * 0.8) / n - 0.5;
        vec2 sampleUv = vUv + cellOffset * pixelSize;
        
        result += traceRay(sampleUv);
      }
    }
    
    result /= sampleCount;
  }
  
  gl_FragColor = result;
}

