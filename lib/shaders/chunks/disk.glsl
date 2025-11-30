// ============================================================================
// Disk Sampling and Utility Functions
// ============================================================================

// Equirectangular UV from direction
vec2 dirToUV(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(0.5 + phi / (2.0 * PI), 0.5 + theta / PI);
}

vec3 sampleStarfield(vec3 dir) {
  vec2 uv = dirToUV(dir);
  vec3 current = texture2D(starfield, uv).rgb * starfieldExposure;
  vec3 next = texture2D(starfieldNext, uv).rgb * starfieldExposure;
  return mix(current, next, starfieldBlend);
}

vec3 sampleBlackbody(float temp) {
  float t = clamp((temp - 1000.0) / 14000.0, 0.0, 1.0);
  return texture2D(blackbodyLUT, vec2(t, 0.5)).rgb;
}

vec4 sampleDisk(vec3 hitPos, vec3 rayDir, float r, int crossingIndex, float lod, float rayMinRadius) {
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
  // Use the ray's closest approach radius, not the disk hit point
  // This correctly accounts for photon ring rays that dove deep near the photon sphere
  float effectiveR = min(r, rayMinRadius);
  float gravRedshift = sqrt(max(0.01, 1.0 - rs / effectiveR));

  // Get MHD modulations using optimized combined function
  MHDResult mhd = getMHDCombined(r, phi, time, lod);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Temperature with Doppler, gravitational redshift, and MHD modulation
  float frac = (r - diskInnerRadius) / diskRadiusRange;
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

  // Higher-order images (photon rings) are exponentially demagnified
  // Each full orbit around BH loses ~e^(-2*pi) of brightness
  // crossingIndex counts disk plane crossings; 2 crossings ≈ 1 orbit
  // Using 0.25 per half-orbit as a compromise between physical accuracy and visibility
  int orbits = crossingIndex / 2;  // Full orbits (2 crossings = 1 orbit)
  float higherOrderDecay = pow(0.25, float(orbits));
  intensity *= higherOrderDecay;

  // Alpha: smooth edge fading
  // Inner edge: fairly sharp at ISCO
  float innerEdgeWidth = diskRadiusRange * 0.05;
  float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + innerEdgeWidth, r);
  // Outer edge: much wider/smoother fade for natural falloff
  float outerEdgeWidth = diskRadiusRange * 0.25;
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

// Compute impact parameter b = |r x v| (perpendicular distance from ray to origin at infinity)
// For Schwarzschild BH, rays with b > disk outer radius cannot hit the disk
float computeImpactParameter(vec3 pos, vec3 dir) {
  return length(cross(pos, dir));
}
