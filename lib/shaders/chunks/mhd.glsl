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

  // Large-scale turbulent streaks - cache trig values
  float rot08 = t * diskMaterialSpeed * 0.08;
  float rotatedPhi08 = phi - rot08;
  float cosRP08 = cos(rotatedPhi08);
  float sinRP08 = sin(rotatedPhi08);
  float x = r * cosRP08;
  float y = r * sinRP08;
  vec2 pos = vec2(x, y);
  float warp = snoise(pos * 0.015 + t * 0.002) * 0.15;
  vec2 tangent = vec2(-sinRP08, cosRP08);
  vec2 radial = vec2(cosRP08, sinRP08);
  float tangentCoord = dot(pos, tangent) * 0.06 + warp;
  float radialCoord = dot(pos, radial) * 0.9;
  float blobs = snoise(vec2(tangentCoord, radialCoord));

  // Second layer at different rotation speed - cache trig values
  float rot06 = t * diskMaterialSpeed * 0.06;
  float rotatedPhi06 = phi - rot06;
  float cosRP06 = cos(rotatedPhi06);
  float sinRP06 = sin(rotatedPhi06);
  float x2 = r * cosRP06;
  float y2 = r * sinRP06;
  vec2 pos2 = vec2(x2, y2);
  vec2 tangent2 = vec2(-sinRP06, cosRP06);
  vec2 radial2 = vec2(cosRP06, sinRP06);
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
    // Fine detail - cache trig values
    float rot12 = t * diskMaterialSpeed * 0.12;
    float rotatedPhi12 = phi - rot12;
    float cosRP12 = cos(rotatedPhi12);
    float sinRP12 = sin(rotatedPhi12);
    float xf = r * cosRP12;
    float yf = r * sinRP12;
    vec2 posf = vec2(xf, yf);
    vec2 tangentF = vec2(-sinRP12, cosRP12);
    vec2 radialF = vec2(cosRP12, sinRP12);
    float tcf = dot(posf, tangentF) * 0.15;
    float rcf = dot(posf, radialF) * 1.4;
    float fine1 = snoise(vec2(tcf, rcf));

    float rot15 = t * diskMaterialSpeed * 0.15;
    float rotatedPhi15 = phi - rot15;
    float cosRP15 = cos(rotatedPhi15);
    float sinRP15 = sin(rotatedPhi15);
    float xf2 = r * cosRP15;
    float yf2 = r * sinRP15;
    vec2 posf2 = vec2(xf2, yf2);
    vec2 tangentF2 = vec2(-sinRP15, cosRP15);
    vec2 radialF2 = vec2(cosRP15, sinRP15);
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
