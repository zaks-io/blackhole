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

  // Lensing compresses the sky near the shadow, so mip selection is essential
  // to avoid star shimmer and moire. Differentiating uv directly breaks at the
  // atan seam (u wraps 1 -> 0), so differentiate the seam-free direction and
  // convert analytically: du = (x*dz - z*dx)/(x^2+z^2)/2pi, dv = dy/cos(lat)/pi
  vec3 ddx = dFdx(dir);
  vec3 ddy = dFdy(dir);
  float planarSq = max(dir.x * dir.x + dir.z * dir.z, 1e-6);
  float invCosLat = inversesqrt(max(1.0 - dir.y * dir.y, 1e-6));
  vec2 gradX = vec2((dir.x * ddx.z - dir.z * ddx.x) / (planarSq * 2.0 * PI), ddx.y * invCosLat / PI);
  vec2 gradY = vec2((dir.x * ddy.z - dir.z * ddy.x) / (planarSq * 2.0 * PI), ddy.y * invCosLat / PI);

  // Explicit LOD from the major footprint axis. Near the critical curve the
  // whole sky compresses into a pixel, so the footprint legitimately spans
  // hundreds of texels; the only alias-free answer there is a heavy blur.
  // Conservative (isotropic) on purpose: driver anisotropic filtering via
  // textureGrad is unreliable under ANGLE/Metal and underblur reads as
  // blinking stars. The cap only guards divergent-march garbage derivatives.
  vec2 sizeA = vec2(textureSize(starfield, 0));
  vec2 gxA = gradX * sizeA;
  vec2 gyA = gradY * sizeA;
  float lodA = clamp(0.5 * log2(max(max(dot(gxA, gxA), dot(gyA, gyA)), 1e-12)), 0.0, 12.0);
  vec3 color = textureLod(starfield, uv, lodA).rgb;

  // starfieldNext only holds a real texture during crossfades - skip the
  // second fetch (and its gradient math) the rest of the time
  if (starfieldBlend > 0.001) {
    vec2 sizeB = vec2(textureSize(starfieldNext, 0));
    vec2 gxB = gradX * sizeB;
    vec2 gyB = gradY * sizeB;
    float lodB = clamp(0.5 * log2(max(max(dot(gxB, gxB), dot(gyB, gyB)), 1e-12)), 0.0, 12.0);
    color = mix(color, textureLod(starfieldNext, uv, lodB).rgb, starfieldBlend);
  }

  return color * starfieldExposure;
}

vec3 sampleBlackbody(float temp) {
  float t = clamp((temp - 1000.0) / 39000.0, 0.0, 1.0);
  return texture2D(blackbodyLUT, vec2(t, 0.5)).rgb;
}

// Higher-order images are demagnified as their rays wind around the hole.
float higherOrderAttenuation(int imageOrder) {
  int orbits = max(imageOrder, 0) / 2;
  return pow(0.25, float(orbits));
}

// diskOuterRadius marks the end of the bright disk, not a geometric cutoff.
// The ray marcher follows the exponential tail until it is visually negligible.
float getSingleDiskRenderOuterRadius() {
  return diskOuterRadius * 1.8;
}

// nY is normalized altitude |y|/H(r) in [0,1]: 0 for midplane crossings,
// rising through the volumetric slab. It drives the vertical shear and the
// midplane-to-atmosphere temperature gradient.
vec4 sampleDisk(vec3 hitPos, vec3 rayDir, float r, int crossingIndex, float lod,
                float bz, float nY, float observerLapse) {
  // Get azimuthal angle for MHD effects
  float phi = atan(hitPos.z, hitPos.x);

  // m=1 eccentric disk mode: gas streamlines are nested aligned ellipses,
  // r = a(1 - e cos f) to first order, precessing rigidly at diskEccPrecRate.
  // a is the streamline label; thermal structure, texture, and edge fades
  // advect with the gas, so they key off a instead of the instantaneous r.
  float a = r;
  float eccCosF = 0.0;
  float eccSinF = 0.0;
  if (diskEccentricity > 0.001) {
    float f = phi - diskEccPrecRate * time;
    // Taper to circular at the ISCO where eccentric orbits cannot survive,
    // and toward the outer edge where freshly supplied gas still orbits
    // circularly. The outer taper reaches zero before the alpha fade begins,
    // so the disk silhouette stays centered on the hole instead of forming
    // an m=1 offset oval around it.
    float ecc = diskEccentricity * smoothstep(diskInnerRadius, diskInnerRadius * 2.0, r) *
                (1.0 - smoothstep(diskInnerRadius + 0.45 * diskRadiusRange,
                                  diskInnerRadius + 0.8 * diskRadiusRange, r));
    eccCosF = ecc * cos(f);
    eccSinF = ecc * sin(f);
    a = r * (1.0 + eccCosF);
  }

  // Frequency ratio for a disk orbit in Schwarzschild:
  //   g = sqrt(1 - 1.5*rs/r) / (observerLapse * (1 - Omega*bz + radial))
  // The numerator is 1/u^t for a circular geodesic, bundling gravitational
  // redshift with orbital time dilation. The Doppler term uses the photon's
  // conserved angular momentum bz about the disk axis, so it is exact for
  // circular orbits at every image order; eccentricity enters at first order
  // via the v_phi correction (1 + 0.5 e cos f) and a radial term e sin f.
  float omega = sqrt(0.5 * rs / (r * r * r));
  // rayDir is traced from the camera toward the emitter, opposite the
  // photon's physical propagation direction. The radial velocity therefore
  // enters 1 - v.n_photon as 1 + v.rayDir.
  float radialDoppler = sqrt(0.5 * rs / r) * eccSinF * dot(rayDir, hitPos / max(r, 1e-4));
  float dopplerTerm = max(0.15,
    1.0 - omega * bz * (1.0 + 0.5 * eccCosF) + radialDoppler);
  float g = sqrt(max(0.0, 1.0 - 1.5 * rs / r)) /
    (dopplerTerm * observerLapse);

  // Get MHD modulations from the per-frame baked LUT (single fetch).
  // Vertical shear parallax: layers above the midplane orbit sub-Keplerian
  // and trail the midplane pattern, so the turbulence lookup skews with
  // altitude instead of extruding as vertical columns.
  MHDResult mhd = sampleMHDLUT(a, phi + diskVerticalShear * nY);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Newtonian zero-torque thin-disk profile:
  // T ~ r^(-3/4) * (1 - sqrt(r_in/r))^(1/4).
  // Zero torque at the ISCO pulls T to zero at the inner edge; the peak sits
  // at r = (49/36)*r_in and is normalized to diskTemperatureInner (2.0487 = 1/peak).
  float x = a / diskInnerRadius;
  float thermal = 2.0487 * pow(x, -0.75) * pow(max(0.0, 1.0 - inversesqrt(x)), 0.25);

  // Vertical temperature gradient: the upper layers are a cooler, dimmer
  // atmosphere over the hot midplane. Folding it into thermal makes both the
  // color (redder) and the intensity (via thermal^4) respond.
  thermal *= 1.0 - diskAtmosphereCool * nY * nY;

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
  // intensity scales as (g * thermal)^4 relative to the profile peak.
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

  intensity *= higherOrderAttenuation(crossingIndex);

  // Alpha: smooth edge fading (in streamline label a, so the disk edges
  // follow the eccentric flow instead of cutting circular holes in it)
  // Inner edge: fairly sharp at ISCO
  float innerEdgeWidth = diskRadiusRange * 0.05;
  float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + innerEdgeWidth, a);
  // The outer disk fades beyond its characteristic bright radius instead of
  // ending at a visible circular boundary. Emission and opacity share the
  // same tail so it cannot become a translucent shell.
  float outerDistance = max(a - diskOuterRadius, 0.0);
  // At the 1.8R render limit this reaches exp(-10), below 0.005%.
  float outerFade = exp(-outerDistance / (0.08 * diskOuterRadius));
  intensity *= outerFade;

  float alpha = innerFade * outerFade * diskOpacity;

  // Emissive boost for bloom - preserve texture/contrast on bright Doppler side
  // Use softer multipliers and clamp to prevent washout
  // (No ISCO rim brightening: the zero-torque profile dims the inner edge)
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.6 + (mhdTemp - 1.0) * 0.8;
  emissiveBoost = clamp(emissiveBoost, 0.3, 2.0);

  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}

// Conserved impact parameter L/E for a ray measured by a static observer at
// finite Schwarzschild radius. The lapse correction tends to one at infinity.
float computeImpactParameter(vec3 pos, vec3 dir, float rsBH) {
  float observerRadius = length(pos);
  float lapse = sqrt(max(1.0 - rsBH / observerRadius, 0.01));
  return length(cross(pos, dir)) / lapse;
}

#ifdef BINARY_MODE
// ============================================================================
// Mini-Disk Sampling for Binary System
// Uses the SAME high-quality pipeline as sampleDisk() but in BH-local coords
// ============================================================================

vec4 sampleMiniDisk(vec3 hitPos, vec3 rayDir, vec2 bhPos, float bhMass,
                    int crossingIndex, float lod) {
  // Starved mini-disks (late inspiral) have drained; skip the work
  if (miniDiskBrightness <= 0.0) {
    return vec4(0.0);
  }

  // Transform to BH-local coordinates
  vec2 localPos = hitPos.xz - bhPos;
  float r = length(localPos);
  float phi = atan(localPos.y, localPos.x);

  // Per-BH Schwarzschild radius (total system rs conserved across the split)
  float bhRs = rs * bhMass;

  // Outer radius: from Roche lobe / separation constraint
  float outerR = getRocheRadius(bhMass);

  // Stable circular gas orbits end at the Schwarzschild ISCO. When tidal
  // truncation reaches it, no ordinary mini-disk remains to sample.
  float innerR = 3.0 * bhRs;
  if (outerR <= innerR) {
    return vec4(0.0);
  }

  if (r < innerR || r > outerR * 1.1) {
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
  MHDResult mhd = sampleMHDLUT(scaledR, phi);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Newtonian zero-torque profile in BH-local coordinates. Peak temp scales as
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

  intensity *= higherOrderAttenuation(crossingIndex);

  // Edge fading
  float diskRange = outerR - innerR;
  float innerEdgeWidth = diskRange * 0.08;
  float innerFade = smoothstep(innerR, innerR + innerEdgeWidth, r);
  float outerEdgeWidth = diskRange * 0.2;
  float outerFade = 1.0 - smoothstep(outerR - outerEdgeWidth, outerR * 1.1, r);

  float alpha = innerFade * outerFade * diskOpacity;

  // Emissive boost for bloom
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.6 + (mhdTemp - 1.0) * 0.8;
  emissiveBoost = clamp(emissiveBoost, 0.3, 2.0);

  // Starvation dims the gas and thins it out (alpha) rather than painting
  // a black disk over the starfield
  return vec4(color * intensity * 2.0 * emissiveBoost * miniDiskBrightness,
              alpha * miniDiskBrightness);
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
  // Binary axis direction. At zero separation both BHs sit at the origin and
  // the axis is undefined (normalize(0) is NaN); any unit vector works since
  // the merged disk is circular (compressFactor = 1).
  vec2 axisDelta = bh2Pos - bh1Pos;
  vec2 binaryAxis = length(axisDelta) > 1e-6 ? normalize(axisDelta) : vec2(1.0, 0.0);
  vec2 perpAxis = vec2(-binaryAxis.y, binaryAxis.x);

  // Project position onto binary coordinate system
  float alongBinary = dot(pos2D, binaryAxis);
  float perpBinary = dot(pos2D, perpAxis);

  // Post-merger relaxation: as the viscous refill brings the cavity edge
  // down to the ISCO, accretion onto the remnant resumes and the disk
  // relaxes to the ordinary single-BH profile (same zero-torque curve
  // and peak as sampleDisk). 1 = fully relaxed, 0 = binary cavity regime.
  float ntBlend = 1.0 - smoothstep(diskInnerRadius, 2.0 * diskInnerRadius, innerR);

  // Compress along binary axis - stretches cavity along binary axis.
  // The oblong cavity is a binary feature; relax it to circular post-merger
  float compressFactor = mix(0.75, 1.0, ntBlend);
  vec2 warpedPos = binaryAxis * alongBinary * compressFactor + perpAxis * perpBinary;
  float warpedR = length(warpedPos);
  float warpedPhi = atan(warpedPos.y, warpedPos.x);

  // Bounds check uses warpedR so cavity shape is oblong; outerFade hits zero
  // at outerR so the early-out past it skips pure-zero samples
  if (warpedR < innerR * 0.4 || warpedR > outerR) {
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
  MHDResult mhd = sampleMHDLUT(warpedR, warpedPhi);
  float mhdDensity = mhd.density;
  float mhdTemp = mhd.temperature;

  // Thin-disk radial slope T ~ r^(-3/4), anchored at the cavity edge.
  // No zero-torque cutoff here: the cavity truncates the disk, not an ISCO.
  float thermalFrac = pow(max(r / innerR, 1.0), -0.75);

  // Relaxed profile: Newtonian zero-torque curve anchored at the ISCO, peaking at
  // diskTemperatureInner exactly like the single-BH disk
  float x = max(r / diskInnerRadius, 1.0);
  float ntThermal = 2.0487 * pow(x, -0.75) * pow(max(0.0, 1.0 - inversesqrt(x)), 0.25);

  float relThermal = mix(thermalFrac, ntThermal, ntBlend);
  float baseTemp = mix(diskTemperatureOuter * thermalFrac, diskTemperatureInner * ntThermal, ntBlend);
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

  float baseIntensity = dopplerBoost * pow(relThermal, 4.0) * mix(0.8, 1.0, ntBlend);

  // Tonemapping and contrast
  float compressedIntensity = baseIntensity / (1.0 + baseIntensity * diskLuminanceCompression);
  float contrastMult = 1.0 + diskTextureContrast * sqrt(compressedIntensity);
  float boostedDensity = 1.0 + (mhdDensity - 1.0) * contrastMult;
  float intensity = compressedIntensity * boostedDensity;

  intensity *= higherOrderAttenuation(crossingIndex);

  // Smooth edge fading - both use warpedR for consistent oblong shape
  float diskRange = outerR - innerR;
  // The wide cavity-edge fade suits the binary regime; relax to the tight
  // inner edge of the single disk so the remnant's hot edge isn't washed out
  float innerFadeEnd = mix(innerR + diskRange * 0.2, innerR + diskRange * 0.08, ntBlend);
  float innerFade = smoothstep(innerR * mix(0.4, 0.9, ntBlend), innerFadeEnd, warpedR);
  float outerFade = 1.0 - smoothstep(outerR - diskRange * 0.3, outerR, warpedR);

  float alpha = innerFade * outerFade * diskOpacity;

  // Emissive boost
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.5 + (mhdTemp - 1.0) * 0.6;
  emissiveBoost = clamp(emissiveBoost, 0.4, 1.8);

  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}
#endif // BINARY_MODE
