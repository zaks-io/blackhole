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

  // Anti-banding: add noise to break up discrete sampling artifacts
  float noiseOffset = 0.0;
  if (coronaStepRefinement > 0.0) {
    float phi = atan(rayPos.z, rayPos.x);
    // High-frequency noise based on position to dither the density
    float dither = snoise(vec2(spheroidR * 8.0, phi * 6.0 + time * 0.05));
    noiseOffset = dither * 0.08 * coronaStepRefinement;
  }

  float density = coronaDensity * exp(-(normalizedR + noiseOffset) * (normalizedR + noiseOffset) * 2.0);

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
