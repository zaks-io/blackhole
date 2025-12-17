// ============================================================================
// Binary Black Hole System - Core Functions Only
// ============================================================================

// Get BH positions as 3D vectors (Y=0 since disk is in XZ plane)
vec3 getBH1World() {
  return vec3(bh1Pos.x, 0.0, bh1Pos.y);
}

vec3 getBH2World() {
  return vec3(bh2Pos.x, 0.0, bh2Pos.y);
}

// Per-BH Schwarzschild radii (total rs is split by mass fraction)
float getBH1Rs() {
  return rs * binaryMass1 * 2.0;
}

float getBH2Rs() {
  return rs * binaryMass2 * 2.0;
}

// Mini-disk outer radius (simplified from Roche lobe)
// Each BH's disk extends to about 35-40% of the full separation
float getRocheRadius(float bhMass) {
  // Scale more aggressively with mass to compensate for larger ISCO
  // Larger BH needs proportionally larger outer radius for visible disk
  float massFactor = 0.5 + 1.0 * bhMass;
  return binarySeparation * 0.4 * massFactor;
}

// ============================================================================
// Binary Gravitational Acceleration
// ============================================================================

vec3 computeBinaryAcceleration(vec3 rayPos, vec3 rayDir) {
  // Sum Schwarzschild accelerations from both black holes
  vec3 bh1 = getBH1World();
  vec3 bh2 = getBH2World();

  float rs1 = getBH1Rs();
  float rs2 = getBH2Rs();

  // Acceleration from BH1
  vec3 toB1 = rayPos - bh1;
  float r1 = length(toB1);
  vec3 rHat1 = toB1 / r1;
  float vDotR1 = dot(rayDir, rHat1);
  float vPerpSq1 = 1.0 - vDotR1 * vDotR1;
  float accel1 = -1.5 * rs1 * vPerpSq1 / (r1 * r1);

  // Acceleration from BH2
  vec3 toB2 = rayPos - bh2;
  float r2 = length(toB2);
  vec3 rHat2 = toB2 / r2;
  float vDotR2 = dot(rayDir, rHat2);
  float vPerpSq2 = 1.0 - vDotR2 * vDotR2;
  float accel2 = -1.5 * rs2 * vPerpSq2 / (r2 * r2);

  // Superposition of accelerations
  return accel1 * rHat1 + accel2 * rHat2;
}

// Check if ray has hit either event horizon
bool checkBinaryHorizon(vec3 rayPos) {
  vec3 bh1 = getBH1World();
  vec3 bh2 = getBH2World();

  float rs1 = getBH1Rs();
  float rs2 = getBH2Rs();

  float r1 = length(rayPos - bh1);
  float r2 = length(rayPos - bh2);

  return r1 < rs1 || r2 < rs2;
}

// Get minimum distance to either BH (for photon sphere effects)
float getBinaryMinRadius(vec3 rayPos) {
  float r1 = length(rayPos - getBH1World());
  float r2 = length(rayPos - getBH2World());
  return min(r1, r2);
}
