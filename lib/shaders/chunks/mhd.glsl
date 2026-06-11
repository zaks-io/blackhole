// ============================================================================
// MHD Effects
// ============================================================================
// Streak fields live in log-polar space (u = ln r, v = phi) so they wrap
// seamlessly around the disk and shear with the local Keplerian angular
// velocity. Differential rotation would wind the pattern up without bound,
// so each field is sampled at two time-cycled phases half a period apart
// and crossfaded; weights are renormalized to keep contrast constant.

struct MHDResult {
  float density;
  float temperature;
};

// The noise machinery below only compiles into the per-frame bake pass; the
// main ray-marching shader reads the baked LUT through sampleMHDLUT instead.
// Keeping getMHDCombined out of the main shader matters beyond dead code:
// the full binary-mode shader is large enough to crash Metal's pipeline
// compiler when this is inlined alongside it.
#ifdef MHD_BAKE_PASS

const float SHEAR_PERIOD = 4.5;

float keplerOmega(float r) {
  return sqrt(0.5 * rs / (r * r * r));
}

struct ShearSample {
  float dPhiA;  // angular advection offsets: sample the field at phi - dPhi
  float dPhiB;
  float wA;
  float wB;
};

ShearSample shearPhases(float r, float t) {
  float omega = keplerOmega(r) * diskMaterialSpeed;
  float tauA = mod(t, SHEAR_PERIOD);
  float tauB = mod(t + 0.5 * SHEAR_PERIOD, SHEAR_PERIOD);
  float wA = 1.0 - abs(2.0 * tauA / SHEAR_PERIOD - 1.0);
  float wB = 1.0 - wA;
  // wA + wB = 1, but a linear crossfade of independent noise dips in
  // contrast mid-fade; dividing by sqrt(wA^2 + wB^2) keeps variance flat
  float norm = inversesqrt(wA * wA + wB * wB);
  ShearSample s;
  s.dPhiA = omega * tauA;
  s.dPhiB = omega * tauB;
  s.wA = wA * norm;
  s.wB = wB * norm;
  return s;
}

// Log-polar streak field. v advances by 10*m per revolution and snoise tiles
// with period 10, so any integer m wraps seamlessly around the disk.
// radialFreq sets how thin the streaks are radially; m is the azimuthal
// cell count, so radialFreq >> m gives orbit-elongated streaks.
float streakField(float lnR, float phi, float radialFreq, float m, float offset) {
  float u = lnR * radialFreq + offset;
  float v = phi * (10.0 * m / (2.0 * PI)) + offset;
  return snoise(vec2(u, v));
}

// Large-scale turbulent streaks (3 fetches: warp + 2 phases)
float getLargeScaleTurbulence(float r, float phi, float t) {
  ShearSample s = shearPhases(r, t);
  float lnR = log(max(r, 0.05));
  float warp = streakField(lnR, phi, 3.0, 1.0, 0.0) * 0.35;
  float a = streakField(lnR, phi - s.dPhiA + warp, 12.0, 1.0, 2.7);
  float b = streakField(lnR, phi - s.dPhiB + warp, 12.0, 1.0, 2.7);
  return a * s.wA + b * s.wB;
}

// Sheared turbulence texture: 2-octave log-polar fbm at two cycled phases
// (5 fetches: warp + 2 octaves x 2 phases; 3 when LOD drops octaves to 1)
float advectedFBM(float r, float phi, float t, int octaves) {
  ShearSample s = shearPhases(r, t);
  float lnR = log(max(r, 0.05));
  float warp = streakField(lnR, phi, 5.0, 2.0, 4.2) * 0.2;
  float phiA = phi - s.dPhiA + warp;
  float phiB = phi - s.dPhiB + warp;
  float a = streakField(lnR, phiA, 18.0, 2.0, 0.0);
  float b = streakField(lnR, phiB, 18.0, 2.0, 0.0);
  if (octaves >= 2) {
    a = (a + 0.5 * streakField(lnR, phiA, 36.0, 5.0, 7.3)) / 1.5;
    b = (b + 0.5 * streakField(lnR, phiB, 36.0, 5.0, 7.3)) / 1.5;
  }
  return a * s.wA + b * s.wB;
}

// Fine detail layer (2 fetches)
float getFineDetail(float r, float phi, float t) {
  ShearSample s = shearPhases(r, t);
  float lnR = log(max(r, 0.05));
  float a = streakField(lnR, phi - s.dPhiA, 35.0, 3.0, 9.1);
  float b = streakField(lnR, phi - s.dPhiB, 35.0, 3.0, 9.1);
  return a * s.wA + b * s.wB;
}

// Spiral density wave pattern. Unlike material streaks, density waves have a
// constant pattern speed (slower than the material), so no shear cycling.
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

// Orbiting hot spots on epicyclic (eccentric) orbits: the guiding center
// circles at the Keplerian rate omega while the spot oscillates radially at
// the relativistic epicyclic frequency kappa = omega * sqrt(1 - 3 rs / r),
// with the 2:1 azimuthal libration of a first-order epicycle.
float getHotspots(float r, float phi, float t) {
  float hotspotSum = 0.0;

  for (int i = 0; i < 5; i++) {
    if (i >= mhdHotspotCount) break;

    // Each hot spot at different guiding-center radius
    float guideR = diskInnerRadius + float(i) * (diskOuterRadius - diskInnerRadius) / 5.0 + 1.0;

    // Initial angle - spread around disk
    float spotPhi0 = float(i) * 2.0 * PI / 5.0 + float(i) * 0.7;

    float omega = keplerOmega(guideR);
    // Floor keeps kappa finite inside r = 3 rs where circular orbits go unstable
    float kappa = omega * sqrt(max(1.0 - 3.0 * rs / guideR, 0.04));
    float tScaled = t * mhdPatternSpeed;
    float epiPhase = kappa * tScaled + float(i) * 2.3;
    float eSpot = mhdHotspotEccentricity;
    float spotR = guideR * (1.0 - eSpot * cos(epiPhase));
    float spotPhi = spotPhi0 + omega * tScaled + 2.0 * (omega / kappa) * eSpot * sin(epiPhase);

    // Angular difference (wrapped to -PI, PI)
    float dPhi = phi - spotPhi;
    dPhi = mod(dPhi + PI, 2.0 * PI) - PI;

    // Distance in disk plane (approximate arc length for angular component)
    float dr = r - spotR;
    float dArc = dPhi * r;
    float dist2 = dr * dr + dArc * dArc;

    // Gaussian falloff - size varies per spot
    float spotSize = 0.8 + 0.4 * sin(float(i) * 1.3);
    float spot = exp(-dist2 / (spotSize * spotSize));

    // Add some flickering/variability
    float flicker = 0.8 + 0.2 * sin(t * 3.0 + float(i) * 2.1);

    hotspotSum += spot * flicker;
  }

  return hotspotSum;
}

// LOD-aware FBM octave count
int getLodOctaves(float lod) {
  // lod: 1.0 = near (full detail), 0.0 = far (minimal detail)
  return int(mix(1.0, 4.0, lod));
}

// Combined MHD density and temperature modulation
// (16 noise fetches at full LOD: spiral 1 + large 3 + fbm 5 + fine 2 + temp fbm 5)
MHDResult getMHDCombined(float r, float phi, float t, float lod) {
  MHDResult result;

  // Spiral is shared by density and temperature - compute once
  float spiral = getSpiralDensity(r, phi, t);
  int octaves = getLodOctaves(lod);

  // === DENSITY ===

  float largeBlobs = getLargeScaleTurbulence(r, phi, t);
  float blobMod = 1.0 + largeBlobs * 0.6 * mhdTurbulenceIntensity;

  float turbulence = advectedFBM(r, phi, t, octaves);
  float turbMod = 1.0 + turbulence * 0.4 * mhdTurbulenceIntensity;

  float spiralMod = 0.95 + 0.1 * spiral * mhdTurbulenceIntensity;

  // Fine detail layer (skip at low LOD)
  float fineMod = 1.0;
  if (lod > 0.3) {
    float fineDetail = getFineDetail(r, phi, t);
    fineMod = 1.0 + fineDetail * 0.3 * mhdTurbulenceIntensity * lod;
  }

  result.density = clamp(blobMod * turbMod * spiralMod * fineMod, mhdMinDensity, 2.0);

  // === TEMPERATURE ===

  result.temperature = 1.0;
  result.temperature += getHotspots(r, phi, t) * 0.35 * mhdHotspotIntensity;

  // Spiral arms are slightly hotter (compressed gas)
  result.temperature += (spiral - 0.5) * 0.15 * mhdTurbulenceIntensity;

  // Small-scale temperature fluctuations, decorrelated from density
  float tempNoise = advectedFBM(r * 1.3 + 5.0, phi + 1.0, t, octaves);
  result.temperature += tempNoise * 0.1 * mhdTurbulenceIntensity;

  result.temperature = clamp(result.temperature, 0.7, 1.6);

  return result;
}

#else
// getMHDCombined costs 16 noise fetches per disk sample, which dominates the
// frame in binary mode. LensingPass bakes it once per frame into a log-polar
// LUT (u = phi wrapping, v = log r) so each disk sample is a single fetch.
uniform sampler2D mhdLUT;

MHDResult sampleMHDLUT(float r, float phi) {
  float u = phi / (2.0 * PI) + 0.5;
  float v = clamp(log(max(r, 1e-3) / mhdLutRMin) / mhdLutLogRange, 0.0, 1.0);
  vec2 dt = texture(mhdLUT, vec2(u, v)).rg;
  MHDResult result;
  result.density = dt.x;
  result.temperature = dt.y;
  return result;
}
#endif
