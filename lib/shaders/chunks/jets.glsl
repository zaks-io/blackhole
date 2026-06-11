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
  // and collimates toward the axis with height. diskInnerRadius is already
  // in world units (3 rs by default).
  float launchRadius = diskInnerRadius;
  float collimationHeight = 10.0 * rs;  // Height over which jet collimates
  float collimationFactor = clamp(absY / collimationHeight, 0.0, 1.0);

  // Inner boundary shrinks from launchRadius to near-zero as height increases
  float innerR = launchRadius * (1.0 - collimationFactor * 0.9);
  // Outer boundary is the cone
  float outerR = launchRadius + absY * tan(halfAngleRad);

  // Must be within the hollow cone
  if (cylR > outerR || cylR < innerR * 0.3) return vec4(0.0);

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
  float density = jetsDensity * radialFalloff * heightFalloff * baseBrightening * baseFadeIn;

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

  // Helical structure at high LOD with noise to break up rhythmic pattern
  if (lod > 0.3) {
    float phi = atan(rayPos.z, rayPos.x);

    // Add noise to break up rhythmic pattern
    vec2 noiseCoord = vec2(absY * 0.1, phi * 0.5 + time * 0.3);
    float turbulence = snoise(noiseCoord) * 0.5;

    // Combine helix with noise for irregular pulsing
    float helix = 0.5 + 0.5 * sin(phi * 4.0 + absY * 0.5 - time * 2.0 + turbulence * 3.0);

    // Add additional density variation from noise
    float densityNoise = 0.8 + 0.2 * snoise(noiseCoord * 2.0);

    density *= (0.7 + 0.3 * helix) * densityNoise;
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

  // Emission is per unit path length; the ray marcher scales it by stepSize.
  // 0.6 reproduces the old look (was 3.0 unweighted with ~0.75 steps in the
  // jet body, i.e. an implicit ds/0.15 factor of ~5).
  float emission = density * beaming * 0.6;
  float alpha = density * 0.4;

  return vec4(color * emission, alpha);
}
