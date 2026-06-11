// ============================================================================
// Corona Layer
// ============================================================================

// Sample corona around a specific black hole position
vec4 sampleCoronaAt(vec3 rayPos, vec3 rayDir, vec3 bhPos, float bhRs, float lod) {
  // Position relative to this black hole
  vec3 localPos = rayPos - bhPos;
  float r = length(localPos);

  // Scale corona radius with BH size
  float localCoronaRadius = coronaRadius * (bhRs / rs);

  if (r > localCoronaRadius || r < bhRs * 1.5) return vec4(0.0);

  // Suppress corona for rays likely to be captured
  vec3 radialDir = normalize(localPos);
  float radialVel = dot(rayDir, radialDir);
  if (r < bhRs * 2.0 && radialVel < 0.0) return vec4(0.0);

  // Spheroidal geometry - flatten in Y for sandwich corona
  float cylR = length(localPos.xz);
  float scaleHeight = localCoronaRadius * 0.5;
  float scaledY = localPos.y / scaleHeight;
  float spheroidR = sqrt(cylR * cylR + scaledY * scaledY);

  // Density falloff - peaks at inner edge, falls off outward
  float normalizedR = (spheroidR - bhRs) / (localCoronaRadius - bhRs);

  // Anti-banding noise
  float noiseOffset = 0.0;
  if (coronaStepRefinement > 0.0) {
    float phi = atan(localPos.z, localPos.x);
    float dither = snoise(vec2(spheroidR * 8.0, phi * 6.0 + time * 0.05));
    noiseOffset = dither * 0.08 * coronaStepRefinement;
  }

  float density = coronaDensity * exp(-(normalizedR + noiseOffset) * (normalizedR + noiseOffset) * 2.0);

  // Turbulent structure at high LOD
  if (lod > 0.5) {
    float phi = atan(localPos.z, localPos.x);
    float turb = snoise(vec2(r * 2.0 + time * 0.1, phi * 3.0));
    density *= 1.0 + turb * 0.4 * lod;
  }

  // Blue-white corona color
  vec3 color = vec3(0.7, 0.85, 1.0);

  float emission = density * 1.5;
  float alpha = density * 0.15;

  return vec4(color * emission, alpha);
}

// Single black hole corona (original behavior)
vec4 sampleCorona(vec3 rayPos, vec3 rayDir, float r, float lod) {
  if (coronaEnabled < 0.5) return vec4(0.0);
  return sampleCoronaAt(rayPos, rayDir, vec3(0.0), rs, lod);
}

#ifdef BINARY_MODE
// Binary black hole corona - samples around both BHs
vec4 sampleBinaryCorona(vec3 rayPos, vec3 rayDir, float lod) {
  if (coronaEnabled < 0.5) return vec4(0.0);

  vec3 bh1 = getBH1World();
  vec3 bh2 = getBH2World();
  float rs1 = getBH1Rs();
  float rs2 = getBH2Rs();

  // Sample corona around each BH
  vec4 corona1 = sampleCoronaAt(rayPos, rayDir, bh1, rs1, lod);
  vec4 corona2 = sampleCoronaAt(rayPos, rayDir, bh2, rs2, lod);

  // Use max blending to avoid bright overlap in center
  // Take the brighter corona contribution at each point
  vec4 combined;
  if (corona1.a > corona2.a) {
    combined = corona1;
  } else {
    combined = corona2;
  }

  return combined;
}
#endif // BINARY_MODE
