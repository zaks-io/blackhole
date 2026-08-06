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

// Gravitational-wave ripple in the orbital plane. Quadrupole strain of a
// circular binary: h ∝ cos(2*Phi_retarded - 2*phi) / r, evaluated with true
// retardation: the field at radius r reads the source sample emitted
// r / gwWaveSpeed ago from the CPU-recorded history. The recorded phase is
// the pair's actual rendered orbital phase, so crests emanate from the BH
// axis and rotate with it; the history primes to silence, so waves exist
// only where the source actually emitted them and chirp tightening, strain
// growth, and the merger cutoff propagate outward at the (exaggerated) wave
// speed instead of updating everywhere at once.
vec4 sampleGWRipple(vec3 hitPos) {
  float r = length(hitPos.xz);

  // Waves emerge outside the binary orbit and fade at the overlay boundary
  float rInner = max(1.2 * binarySeparation, 2.0 * rs);
  float fade = smoothstep(rInner, 1.7 * rInner, r) *
               (1.0 - smoothstep(0.8 * gwRippleOuter, gwRippleOuter, r));
  if (fade <= 0.0) return vec4(0.0);

  // Retarded sample index on the history grid; radii inside one grid step of
  // the source read the newest sample, radii older than the ring show nothing
  float tRet = time - r / gwWaveSpeed;
  float target = min(gwHistoryHead - (gwHistoryHeadTime - tRet) / gwHistoryInterval,
                     gwHistoryHead);
  int size = textureSize(gwHistory, 0).x;
  if (target < gwHistoryHead - float(size - 2) || target < 0.0) return vec4(0.0);

  float i0 = floor(target);
  float i1 = min(i0 + 1.0, gwHistoryHead);
  vec4 s0 = texelFetch(gwHistory, ivec2(int(mod(i0, float(size))), 0), 0);
  vec4 s1 = texelFetch(gwHistory, ivec2(int(mod(i1, float(size))), 0), 0);
  vec3 src = mix(s0.xyz, s1.xyz, target - i0);  // (sin 2Φ_ret, cos 2Φ_ret, amplitude)

  float phi = atan(hitPos.z, hitPos.x);
  // cos(2Φ_ret - 2φ) expanded from the stored sin/cos pair; peaks where the
  // retarded binary axis (orbital phase Φ_ret) points, i.e. through the BHs
  float wave = src.y * cos(2.0 * phi) + src.x * sin(2.0 * phi);
  // Sharpen the sinusoid into distinct wavefront crests
  float crest = pow(0.5 + 0.5 * wave, 2.0);

  // Physical 1/r strain falloff (h = 4 m1 m2 / (a r)); the 1/a growth, mass
  // factor, and ringdown envelope ride in the recorded amplitude (src.z),
  // gwRippleStrength is the display gate. Brightness is normalized so
  // amp = strength at r = 25 rs; the absolute map stays artistic because a
  // real strain of ~1e-3 would be invisible. Reinhard-compress so the ~8x
  // merger peak saturates to white instead of blowing out through bloom.
  float h = gwRippleStrength * src.z * fade * crest * ((25.0 * rs) / max(r, 3.0 * rs));
  float amp = h / (1.0 + h);
  return vec4(vec3(0.45, 0.6, 1.0) * amp, min(amp * 2.0, 1.0));
}

#endif // BINARY_MODE
