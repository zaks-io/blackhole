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

  // Distance from ring - use sharp falloff for crisp lines
  float dist = abs(hitR - targetRadius);
  float sharpThickness = thickness * 0.3; // Much thinner line
  float fade = 1.0 - smoothstep(0.0, sharpThickness, dist);
  // Add subtle glow around the sharp line
  float glow = (1.0 - smoothstep(sharpThickness, thickness, dist)) * 0.3;
  fade = max(fade, glow);

  if (fade > 0.0) {
    return vec4(ringColor * fade * intensity, fade * intensity * 0.9);
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

  // We crossed the shell - use sharp falloff for crisp lines
  float dist = min(abs(currentR - targetRadius), abs(prevR - targetRadius));
  float sharpThickness = thickness * 0.3;
  float fade = 1.0 - smoothstep(0.0, sharpThickness, dist);
  float glow = (1.0 - smoothstep(sharpThickness, thickness, dist)) * 0.3;
  fade = max(fade, glow);

  if (fade > 0.0) {
    return vec4(ringColor * fade * intensity, fade * intensity * 0.9);
  }
  return vec4(0.0);
}
