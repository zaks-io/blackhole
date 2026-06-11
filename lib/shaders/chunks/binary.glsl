// ============================================================================
// Binary Black Hole System - Core Functions Only
// ============================================================================
#ifdef BINARY_MODE

// Get BH positions as 3D vectors (Y=0 since disk is in XZ plane)
vec3 getBH1World() {
  return vec3(bh1Pos.x, 0.0, bh1Pos.y);
}

vec3 getBH2World() {
  return vec3(bh2Pos.x, 0.0, bh2Pos.y);
}

// Per-BH Schwarzschild radii. Total mass is conserved across the split:
// rs1 + rs2 = rs, so binary mode lenses with the same total mass as single
// mode and the m -> 1 limit recovers the single black hole.
float getBH1Rs() {
  return rs * binaryMass1;
}

float getBH2Rs() {
  return rs * binaryMass2;
}

// Mini-disk outer radius (simplified from Roche lobe)
// Each BH's disk extends to about 35-40% of the full separation
float getRocheRadius(float bhMass) {
  // Scale more aggressively with mass to compensate for larger ISCO
  // Larger BH needs proportionally larger outer radius for visible disk
  float massFactor = 0.5 + 1.0 * bhMass;
  return binarySeparation * 0.4 * massFactor;
}

// Orbital velocity of a BH about the COM, in the XZ plane (matches the vec2
// position convention). Derived from the position uniform: v = Omega x r,
// with Omega^2 = GM_tot / a^3 and GM_tot = rs / 2 in G = c = 1 units.
vec2 getBHOrbitalVelocity(vec2 bhPos) {
  float omega = sqrt(0.5 * rs / (binarySeparation * binarySeparation * binarySeparation));
  return omega * vec2(-bhPos.y, bhPos.x);
}

#endif // BINARY_MODE
