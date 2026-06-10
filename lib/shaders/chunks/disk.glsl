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

vec4 sampleDisk(vec3 hitPos, vec3 rayDir, float r, int crossingIndex, float lod, float bz) {
  // Get azimuthal angle for MHD effects
  float phi = atan(hitPos.z, hitPos.x);

  // Exact frequency ratio for a circular geodesic orbit in Schwarzschild:
  //   g = sqrt(1 - 1.5*rs/r) / (1 - Omega * bz)
  // The numerator is 1/u^t and bundles gravitational redshift with orbital
  // time dilation; the denominator is the exact Doppler term built from the
  // photon's conserved angular momentum bz about the disk axis. Because bz
  // is a constant of the lensed path, this holds for every image order.
  float omega = sqrt(0.5 * rs / (r * r * r));
  float dopplerTerm = max(0.15, 1.0 - omega * bz);
  float g = sqrt(max(0.0, 1.0 - 1.5 * rs / r)) / dopplerTerm;

  // Get MHD modulations using optimized combined function
  MHDResult mhd = getMHDCombined(r, phi, time, lod);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Novikov-Thorne thin-disk profile: T ~ r^(-3/4) * (1 - sqrt(r_in/r))^(1/4).
  // Zero torque at the ISCO pulls T to zero at the inner edge; the peak sits
  // at r = (49/36)*r_in and is normalized to diskTemperatureInner (2.0487 = 1/peak).
  float x = r / diskInnerRadius;
  float thermal = 2.0487 * pow(x, -0.75) * pow(max(0.0, 1.0 - inversesqrt(x)), 0.25);
  float temp = diskTemperatureInner * thermal * g * mhdTemp;

  vec3 color = sampleBlackbody(temp);

  // Pure Doppler part of g, used by the indicator overlay
  float doppler = 1.0 / dopplerTerm;

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

  // A boosted blackbody is a blackbody at T_obs = g * T_emit, so bolometric
  // intensity scales as (g * thermal)^4 relative to the profile peak. The
  // thermal^4 term replaces the old artistic radial falloff.
  float dopplerBoost = pow(g, 4.0);

  // Reduce intensity boost when Doppler overlay is active to preserve colors
  if (overlayDoppler > 0.0) {
    // Mix from quartic to linear g for clearer color visualization
    dopplerBoost = mix(dopplerBoost, g, overlayDoppler * 0.7);
  }

  float baseIntensity = dopplerBoost * pow(thermal, 4.0);

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

  float alpha = innerFade * outerFade * diskOpacity;

  // Emissive boost for bloom - preserve texture/contrast on bright Doppler side
  // Use softer multipliers and clamp to prevent washout
  // (No ISCO rim brightening: the zero-torque profile dims the inner edge)
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.6 + (mhdTemp - 1.0) * 0.8;
  emissiveBoost = clamp(emissiveBoost, 0.3, 2.0);

  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}

// Compute impact parameter b = |r x v| (perpendicular distance from ray to origin at infinity)
// For Schwarzschild BH, rays with b > disk outer radius cannot hit the disk
float computeImpactParameter(vec3 pos, vec3 dir) {
  return length(cross(pos, dir));
}

// ============================================================================
// Mini-Disk Sampling for Binary System
// Uses the SAME high-quality pipeline as sampleDisk() but in BH-local coords
// ============================================================================

vec4 sampleMiniDisk(vec3 hitPos, vec3 rayDir, vec2 bhPos, float bhMass,
                    int crossingIndex, float lod) {
  // Transform to BH-local coordinates
  vec2 localPos = hitPos.xz - bhPos;
  float r = length(localPos);
  float phi = atan(localPos.y, localPos.x);

  // Per-BH Schwarzschild radius (total system rs conserved across the split)
  float bhRs = rs * bhMass;

  // Outer radius: from Roche lobe / separation constraint
  float outerR = getRocheRadius(bhMass);

  // Inner radius: ISCO at 3 * bhRs, but ensure disk has reasonable width
  // Must stay outside photon sphere (1.5*bhRs) to avoid horizon clipping
  float nominalISCO = 3.0 * bhRs;
  float minInner = 2.0 * bhRs; // Stay well outside event horizon
  float innerR = max(minInner, min(nominalISCO, outerR * 0.35));

  // Check disk bounds - use tighter inner check to avoid horizon clipping
  if (r < innerR * 0.95 || r > outerR * 1.1) {
    return vec4(0.0);
  }

  // Local circular-orbit speed (static-observer frame) about this BH, plus
  // the BH's own orbital velocity around the COM. The orbital term is what
  // makes each mini-disk brighten and dim over the orbit (Doppler boost
  // modulation, the classic binary signature).
  float vKep = sqrt(0.5 * bhRs / max(r - bhRs, 0.5 * bhRs));
  vec2 tangent2D = normalize(vec2(-localPos.y, localPos.x));
  vec2 orbVel = getBHOrbitalVelocity(bhPos);
  vec3 vel = vec3(tangent2D.x * vKep + orbVel.x, 0.0, tangent2D.y * vKep + orbVel.y);
  float speed = length(vel);
  if (speed > 0.99) {
    vel *= 0.99 / speed;
    speed = 0.99;
  }

  // Full special-relativistic Doppler (longitudinal + transverse)
  float gamma = inversesqrt(1.0 - speed * speed);
  float doppler = 1.0 / (gamma * (1.0 - dot(vel, -rayDir)));

  // Gravitational redshift at the emission radius, including the companion's
  // potential (companion position follows from the COM balance m1*p1 = -m2*p2)
  vec2 compPos = -bhPos * (bhMass / (1.0 - bhMass));
  float compRs = rs * (1.0 - bhMass);
  float rComp = max(length(hitPos.xz - compPos), 1.5 * compRs);
  float gravRedshift = sqrt(max(0.01, 1.0 - bhRs / r - compRs / rComp));

  // Combined relativistic g-factor: T_obs = g * T_emit, I_obs = g^4 * I_emit
  float g = doppler * gravRedshift;

  // Get MHD modulations - scale radius to get proper texture frequency
  // Mini-disks are smaller, so we scale up to get comparable feature sizes
  float scaledR = r * (diskOuterRadius / outerR);
  MHDResult mhd = getMHDCombined(scaledR, phi, time, lod);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Novikov-Thorne profile in BH-local coordinates. Peak temp scales as
  // M^(-1/4): a lighter BH runs a hotter disk at the same Eddington ratio.
  float x = r / innerR;
  float thermal = 2.0487 * pow(x, -0.75) * pow(max(0.0, 1.0 - inversesqrt(x)), 0.25);
  float peakTemp = diskTemperatureInner * pow(bhMass, -0.25);
  float temp = peakTemp * thermal * g * mhdTemp;

  vec3 color = sampleBlackbody(temp);

  // Doppler indicator overlay (same as single disk)
  if (overlayDoppler > 0.0) {
    float brightness = dot(color, vec3(0.299, 0.587, 0.114));
    if (doppler > 1.0) {
      float shift = clamp((doppler - 1.0) * 3.0, 0.0, 1.0);
      float blendStrength = shift * overlayDoppler;
      vec3 blueColor = vec3(0.3, 0.6, 1.0) * brightness * 1.5;
      color = mix(color, blueColor, blendStrength * 0.8);
    } else {
      float shift = clamp((1.0 - doppler) * 3.0, 0.0, 1.0);
      float blendStrength = shift * overlayDoppler;
      vec3 redColor = vec3(1.0, 0.4, 0.2) * brightness * 1.2;
      color = mix(color, redColor, blendStrength * 0.7);
    }
  }

  // Boosted blackbody: bolometric intensity scales as g^4, and the local
  // emission follows the thermal profile to the 4th power (sigma T^4)
  float dopplerBoost = pow(g, 4.0);
  if (overlayDoppler > 0.0) {
    dopplerBoost = mix(dopplerBoost, g, overlayDoppler * 0.7);
  }

  float baseIntensity = dopplerBoost * pow(thermal, 4.0);

  // Reinhard tonemapping (same as single disk)
  float compressedIntensity = baseIntensity / (1.0 + baseIntensity * diskLuminanceCompression);

  // Contrast boosting (same as single disk)
  float contrastMult = 1.0 + diskTextureContrast * sqrt(compressedIntensity);
  float boostedDensity = 1.0 + (mhdDensity - 1.0) * contrastMult;
  float intensity = compressedIntensity * boostedDensity;

  // Higher-order image decay
  int orbits = crossingIndex / 2;
  float higherOrderDecay = pow(0.25, float(orbits));
  intensity *= higherOrderDecay;

  // Edge fading
  float diskRange = outerR - innerR;
  float innerEdgeWidth = diskRange * 0.08;
  float innerFade = smoothstep(innerR * 0.9, innerR + innerEdgeWidth, r);
  float outerEdgeWidth = diskRange * 0.2;
  float outerFade = smoothstep(outerR * 1.1, outerR - outerEdgeWidth, r);

  float alpha = innerFade * outerFade * diskOpacity;

  // Emissive boost for bloom
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.6 + (mhdTemp - 1.0) * 0.8;
  emissiveBoost = clamp(emissiveBoost, 0.3, 2.0);

  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}

// ============================================================================
// Circumbinary Disk Sampling (outer disk around both BHs)
// ============================================================================

vec4 sampleCircumbinaryDisk(vec3 hitPos, vec3 rayDir, int crossingIndex, float lod) {
  vec2 pos2D = hitPos.xz;
  float r = length(pos2D);
  float phi = atan(pos2D.y, pos2D.x);

  // Circumbinary disk bounds
  float innerR = circumbinaryInnerRadius;
  float outerR = circumbinaryOuterRadius;

  // Warp coordinates for oblong cavity shape
  // Binary axis direction
  vec2 binaryAxis = normalize(bh2Pos - bh1Pos);
  vec2 perpAxis = vec2(-binaryAxis.y, binaryAxis.x);

  // Project position onto binary coordinate system
  float alongBinary = dot(pos2D, binaryAxis);
  float perpBinary = dot(pos2D, perpAxis);

  // Compress along binary axis - stretches cavity along binary axis
  float compressFactor = 0.75;
  vec2 warpedPos = binaryAxis * alongBinary * compressFactor + perpAxis * perpBinary;
  float warpedR = length(warpedPos);
  float warpedPhi = atan(warpedPos.y, warpedPos.x);

  // Bounds check uses warpedR so cavity shape is oblong
  if (warpedR < innerR * 0.4) {
    return vec4(0.0);
  }

  // Circular-orbit speed about the binary COM. Total mass is conserved
  // across the split, so the combined potential at this distance is the
  // same Schwarzschild rs as single mode.
  float v = sqrt(0.5 * rs / max(r - rs, rs));
  vec3 tangent = normalize(vec3(-hitPos.z, 0.0, hitPos.x));
  vec3 vel = tangent * v;

  // Full special-relativistic Doppler (longitudinal + transverse)
  float gamma = inversesqrt(1.0 - dot(vel, vel));
  float doppler = 1.0 / (gamma * (1.0 - dot(vel, -rayDir)));

  // Gravitational redshift at the emission radius (combined potential)
  float gravRedshift = sqrt(max(0.1, 1.0 - rs / r));

  // Combined relativistic g-factor
  float g = doppler * gravRedshift;

  // MHD turbulence - use warped coordinates so texture deforms with cavity
  MHDResult mhd = getMHDCombined(warpedR, warpedPhi, time, lod);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Thin-disk radial slope T ~ r^(-3/4), anchored at the cavity edge.
  // No zero-torque cutoff here: the cavity truncates the disk, not an ISCO.
  float thermalFrac = pow(max(r / innerR, 1.0), -0.75);
  float baseTemp = diskTemperatureOuter * thermalFrac;
  float temp = baseTemp * g * mhdTemp;

  vec3 color = sampleBlackbody(temp);

  // Doppler overlay
  if (overlayDoppler > 0.0) {
    float brightness = dot(color, vec3(0.299, 0.587, 0.114));
    if (doppler > 1.0) {
      float shift = clamp((doppler - 1.0) * 3.0, 0.0, 1.0);
      vec3 blueColor = vec3(0.3, 0.6, 1.0) * brightness * 1.5;
      color = mix(color, blueColor, shift * overlayDoppler * 0.8);
    } else {
      float shift = clamp((1.0 - doppler) * 3.0, 0.0, 1.0);
      vec3 redColor = vec3(1.0, 0.4, 0.2) * brightness * 1.2;
      color = mix(color, redColor, shift * overlayDoppler * 0.7);
    }
  }

  // Boosted blackbody: g^4 beaming, thermal^4 local emission
  float dopplerBoost = pow(g, 4.0);
  if (overlayDoppler > 0.0) {
    dopplerBoost = mix(dopplerBoost, g, overlayDoppler * 0.7);
  }

  float baseIntensity = dopplerBoost * pow(thermalFrac, 4.0) * 0.8;

  // Tonemapping and contrast
  float compressedIntensity = baseIntensity / (1.0 + baseIntensity * diskLuminanceCompression);
  float contrastMult = 1.0 + diskTextureContrast * sqrt(compressedIntensity);
  float boostedDensity = 1.0 + (mhdDensity - 1.0) * contrastMult;
  float intensity = compressedIntensity * boostedDensity;

  // Higher-order decay
  int orbits = crossingIndex / 2;
  float higherOrderDecay = pow(0.25, float(orbits));
  intensity *= higherOrderDecay;

  // Smooth edge fading - both use warpedR for consistent oblong shape
  float diskRange = outerR - innerR;
  float innerFade = smoothstep(innerR * 0.4, innerR + diskRange * 0.2, warpedR);
  float outerFade = 1.0 - smoothstep(outerR - diskRange * 0.3, outerR, warpedR);

  float alpha = innerFade * outerFade * diskOpacity;

  // Emissive boost
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.5 + (mhdTemp - 1.0) * 0.6;
  emissiveBoost = clamp(emissiveBoost, 0.4, 1.8);

  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}
