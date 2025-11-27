precision highp float;

uniform sampler2D starfield;
uniform sampler2D blackbodyLUT;
uniform vec3 cameraPos;
uniform mat4 inverseProjection;
uniform mat4 inverseView;
uniform float rs;
uniform int maxSteps;
uniform vec2 resolution;
uniform float diskInnerRadius;
uniform float diskOuterRadius;
uniform float diskTemperatureInner;
uniform float diskTemperatureOuter;
uniform float time;

// Volumetric disk parameters
uniform float diskHalfThickness;
uniform float diskVolumeDensity;

// MHD parameters
uniform float mhdTurbulenceIntensity;  // 0-1
uniform float mhdSpiralArms;           // 2-4
uniform float mhdSpiralTightness;      // How tightly wound
uniform float mhdHotspotIntensity;     // 0-1
uniform int mhdHotspotCount;           // 0-5
uniform float mhdPatternSpeed;         // Pattern rotation speed multiplier
uniform float mhdMinDensity;           // Minimum density for sparse areas (0-1)

// Luminance compression for detail preservation
uniform float diskLuminanceCompression;  // 0.0 = no compression, 1.0 = strong
uniform float diskTextureContrast;       // 0.0 = normal, 2.0 = high contrast survives bloom
uniform float diskMaterialSpeed;         // Multiplier for turbulence/material flow speed
uniform float diskOpacity;               // Base opacity (0 = transparent, 1 = opaque)

// Supersampling level (1 = off, 2 = 2x2, 4 = 4x4)
uniform int supersampleLevel;

// Black hole edge softness (0 = hard edge, 1 = very soft)
uniform float bhEdgeSoftness;

// Photon sphere glow intensity (0 = off, 1 = full)
uniform float photonSphereIntensity;

// Overlay visibility uniforms (0 = off, 1 = on)
uniform float overlayIsco;
uniform float overlayPhotonSphere;
uniform float overlayEventHorizon;
uniform float overlayShadowEdge;
uniform float overlayDoppler;
uniform float overlayScale;

varying vec2 vUv;

#define PI 3.14159265359

// ============================================================================
// Noise Functions
// ============================================================================

// Permutation polynomial for hash
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

// Simplex 2D noise
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                   + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Fractal Brownian Motion - 4 octaves
float fbm(vec2 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float maxValue = 0.0;
  
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  
  return value / maxValue;
}

// Stable disk texture using uniform rotation + minimal warping
float advectedFBM(float r, float phi, float t, int octaves) {
  // Uniform rotation - entire pattern rotates together (prevents winding)
  float rot = t * diskMaterialSpeed * 0.1;
  float rotatedPhi = phi - rot;

  // Convert to Cartesian for seamless sampling
  float x = r * cos(rotatedPhi);
  float y = r * sin(rotatedPhi);
  vec2 pos = vec2(x, y);

  // Minimal warping - just enough to break perfect symmetry
  float warp = snoise(pos * 0.02 + t * 0.002) * 0.2;

  // Anisotropic noise stretched along rotation direction
  vec2 tangent = vec2(-sin(rotatedPhi), cos(rotatedPhi));
  vec2 radial = vec2(cos(rotatedPhi), sin(rotatedPhi));

  // Sample noise with tangential stretch (features elongated along orbit)
  // Higher radial = smaller/more streaks, lower tangent = longer streaks
  float tangentCoord = dot(pos, tangent) * 0.08 + warp;
  float radialCoord = dot(pos, radial) * 1.2;  // Much higher = smaller streaks

  return fbm(vec2(tangentCoord, radialCoord), octaves);
}

// ============================================================================
// MHD Effects
// ============================================================================

// Large-scale turbulent streaks using uniform rotation + minimal warping
float getLargeScaleTurbulence(float r, float phi, float t) {
  // Uniform rotation (no winding)
  float rot = t * diskMaterialSpeed * 0.08;
  float rotatedPhi = phi - rot;

  // Convert to Cartesian
  float x = r * cos(rotatedPhi);
  float y = r * sin(rotatedPhi);
  vec2 pos = vec2(x, y);

  // Minimal warping
  float warp = snoise(pos * 0.015 + t * 0.002) * 0.15;

  // Anisotropic stretch for arc-following streaks
  vec2 tangent = vec2(-sin(rotatedPhi), cos(rotatedPhi));
  vec2 radial = vec2(cos(rotatedPhi), sin(rotatedPhi));

  float tangentCoord = dot(pos, tangent) * 0.06 + warp;
  float radialCoord = dot(pos, radial) * 0.9;  // Higher = smaller streaks
  float blobs = snoise(vec2(tangentCoord, radialCoord));

  // Second layer at different rotation speed
  float rot2 = t * diskMaterialSpeed * 0.06;
  float x2 = r * cos(phi - rot2);
  float y2 = r * sin(phi - rot2);
  vec2 pos2 = vec2(x2, y2);

  vec2 tangent2 = vec2(-sin(phi - rot2), cos(phi - rot2));
  vec2 radial2 = vec2(cos(phi - rot2), sin(phi - rot2));
  float tc2 = dot(pos2, tangent2) * 0.07;
  float rc2 = dot(pos2, radial2) * 0.8;  // Higher = smaller streaks
  float blobs2 = snoise(vec2(tc2 + 5.0, rc2 + 5.0));

  return blobs * 0.6 + blobs2 * 0.4;
}

// Spiral density wave pattern
float getSpiralDensity(float r, float phi, float t) {
  // Logarithmic spiral: phase = m*phi + k*ln(r) - omega_p*t
  float k = mhdSpiralTightness;  // Spiral tightness
  float m = mhdSpiralArms;       // Number of arms
  
  // Pattern speed - slower than material (density wave)
  float patternOmega = 0.3 * mhdPatternSpeed;
  float spiralPhase = m * phi + k * log(r) - patternOmega * t;
  
  // Add some noise to break up perfect symmetry
  // Use seamless coordinates for noise
  float cx = cos(phi * 2.0 + t * 0.1);
  float cy = sin(phi * 2.0 + t * 0.1);
  float noisePhase = snoise(vec2(r * 0.5 + cx, cy)) * 0.4;
  
  // Soft sine wave for spiral arms
  float spiral = 0.5 + 0.5 * sin(spiralPhase + noisePhase);
  
  // Sharpen the arms slightly
  spiral = pow(spiral, 0.7);
  
  return spiral;
}

// Orbiting hot spots
float getHotspots(float r, float phi, float t) {
  float hotspotSum = 0.0;
  
  // Define hot spot properties (radius, initial angle, size)
  // These create asymmetric, orbiting bright regions
  
  for (int i = 0; i < 5; i++) {
    if (i >= mhdHotspotCount) break;
    
    // Each hot spot at different radius
    float spotRadius = diskInnerRadius + float(i) * (diskOuterRadius - diskInnerRadius) / 5.0 + 1.0;
    
    // Initial angle - spread around disk
    float spotPhi0 = float(i) * 2.0 * PI / 5.0 + float(i) * 0.7;
    
    // Keplerian orbit rate at this radius
    float omega = sqrt(0.5 * rs / spotRadius) / spotRadius;
    float spotPhi = spotPhi0 + omega * t * mhdPatternSpeed;
    
    // Angular difference (wrapped to -PI, PI)
    float dPhi = phi - spotPhi;
    dPhi = mod(dPhi + PI, 2.0 * PI) - PI;
    
    // Distance in disk plane (approximate arc length for angular component)
    float dr = r - spotRadius;
    float dArc = dPhi * r;
    float dist = sqrt(dr * dr + dArc * dArc);
    
    // Gaussian falloff - size varies per spot
    float spotSize = 0.8 + 0.4 * sin(float(i) * 1.3);
    float spot = exp(-dist * dist / (spotSize * spotSize));
    
    // Add some flickering/variability
    float flicker = 0.8 + 0.2 * sin(t * 3.0 + float(i) * 2.1);
    
    hotspotSum += spot * flicker;
  }
  
  return hotspotSum;
}

// Fine detail noise layer using uniform rotation + minimal warping
float getFineDetail(float r, float phi, float t) {
  // Uniform rotation (slightly faster for fine detail)
  float rot = t * diskMaterialSpeed * 0.12;
  float rotatedPhi = phi - rot;

  // Convert to Cartesian
  float x = r * cos(rotatedPhi);
  float y = r * sin(rotatedPhi);
  vec2 pos = vec2(x, y);

  // Tangential stretch for fine arc-following streaks
  vec2 tangent = vec2(-sin(rotatedPhi), cos(rotatedPhi));
  vec2 radial = vec2(cos(rotatedPhi), sin(rotatedPhi));

  float tangentCoord = dot(pos, tangent) * 0.15;
  float radialCoord = dot(pos, radial) * 1.4;  // Higher = finer detail
  float fine1 = snoise(vec2(tangentCoord, radialCoord));

  // Second fine layer at different rotation speed
  float rot2 = t * diskMaterialSpeed * 0.15;
  float x2 = r * cos(phi - rot2);
  float y2 = r * sin(phi - rot2);
  vec2 pos2 = vec2(x2, y2);

  vec2 tangent2 = vec2(-sin(phi - rot2), cos(phi - rot2));
  vec2 radial2 = vec2(cos(phi - rot2), sin(phi - rot2));
  float tc2 = dot(pos2, tangent2) * 0.18;
  float rc2 = dot(pos2, radial2) * 1.2;  // Higher = finer detail
  float fine2 = snoise(vec2(tc2 + 5.0, rc2 + 5.0));

  return fine1 * 0.6 + fine2 * 0.4;
}

// Combined MHD density modulation
float getMHDDensity(float r, float phi, float t) {
  float density = 1.0;

  // Large-scale turbulent streaks
  float largeBlobs = getLargeScaleTurbulence(r, phi, t);
  float blobMod = 1.0 + largeBlobs * 0.6 * mhdTurbulenceIntensity;  // Reduced

  // Motion-blurred turbulence for tangential streaks
  float turbulence = advectedFBM(r, phi, t, 3);
  float turbMod = 1.0 + turbulence * 0.4 * mhdTurbulenceIntensity;  // Reduced

  // Spiral density waves (minimal influence)
  float spiral = getSpiralDensity(r, phi, t);
  float spiralMod = 0.95 + 0.1 * spiral * mhdTurbulenceIntensity;  // Reduced

  // Fine detail layer for added texture richness
  float fineDetail = getFineDetail(r, phi, t);
  float fineMod = 1.0 + fineDetail * 0.3 * mhdTurbulenceIntensity;  // Reduced

  density *= blobMod * turbMod * spiralMod * fineMod;

  // Clamp with configurable minimum density - narrower range
  return clamp(density, mhdMinDensity, 2.0);
}

// Combined MHD temperature modulation
float getMHDTemperature(float r, float phi, float t) {
  float tempMod = 1.0;
  
  // Hot spots add temperature
  float hotspots = getHotspots(r, phi, t);
  tempMod += hotspots * 0.35 * mhdHotspotIntensity;
  
  // Spiral arms are slightly hotter (compressed gas)
  float spiral = getSpiralDensity(r, phi, t);
  tempMod += (spiral - 0.5) * 0.15 * mhdTurbulenceIntensity;
  
  // Small-scale temperature fluctuations using offset radius for variation
  float tempNoise = advectedFBM(r * 1.3 + 5.0, phi + 1.0, t, 3);
  tempMod += tempNoise * 0.1 * mhdTurbulenceIntensity;
  
  return clamp(tempMod, 0.7, 1.6);
}

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

  // Distance from ring
  float dist = abs(hitR - targetRadius);
  float fade = 1.0 - smoothstep(0.0, thickness, dist);

  if (fade > 0.0) {
    return vec4(ringColor * fade * intensity, fade * intensity * 0.8);
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

  // We crossed the shell - calculate fade based on how close we are
  float dist = min(abs(currentR - targetRadius), abs(prevR - targetRadius));
  float fade = 1.0 - smoothstep(0.0, thickness, dist);

  if (fade > 0.0) {
    return vec4(ringColor * fade * intensity, fade * intensity * 0.8);
  }
  return vec4(0.0);
}

// Equirectangular UV from direction
vec2 dirToUV(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -1.0, 1.0));
  return vec2(0.5 + phi / (2.0 * PI), 0.5 + theta / PI);
}

vec3 sampleStarfield(vec3 dir) {
  return texture2D(starfield, dirToUV(dir)).rgb;
}

vec3 sampleBlackbody(float temp) {
  float t = clamp((temp - 1000.0) / 14000.0, 0.0, 1.0);
  return texture2D(blackbodyLUT, vec2(t, 0.5)).rgb;
}

vec4 sampleDisk(vec3 hitPos, vec3 rayDir, float r, int crossingIndex) {
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
  // Factor of sqrt(1 - rs/r) from Schwarzschild metric
  float gravRedshift = sqrt(1.0 - rs / r);
  
  // Get MHD modulations
  float mhdDensity = getMHDDensity(r, phi, time);
  float mhdTemp = getMHDTemperature(r, phi, time);
  
  // Temperature with Doppler, gravitational redshift, and MHD modulation
  float frac = (r - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);
  float baseTemp = mix(diskTemperatureInner, diskTemperatureOuter, frac);
  float temp = baseTemp * doppler * gravRedshift * mhdTemp;
  
  vec3 color = sampleBlackbody(temp);

  // Doppler indicator overlay: tint blue for approaching, red for receding
  if (overlayDoppler > 0.0) {
    vec3 dopplerTint;
    if (doppler > 1.0) {
      // Approaching (blueshift)
      float shift = clamp((doppler - 1.0) * 2.0, 0.0, 1.0);
      dopplerTint = mix(vec3(1.0), vec3(0.3, 0.5, 1.0), shift);
    } else {
      // Receding (redshift)
      float shift = clamp((1.0 - doppler) * 2.0, 0.0, 1.0);
      dopplerTint = mix(vec3(1.0), vec3(1.0, 0.3, 0.3), shift);
    }
    color = mix(color, color * dopplerTint, overlayDoppler * 0.4);
  }

  // Intensity: Include gravitational redshift (photon energy loss)
  // Disk stays bright right to the edge
  float baseIntensity = pow(doppler, 3.0) * gravRedshift / (1.0 + frac * 2.0);
  
  // Apply Reinhard tonemapping to compress dynamic range while preserving local contrast
  // This prevents the bright Doppler-boosted side from washing out texture detail
  float compressedIntensity = baseIntensity / (1.0 + baseIntensity * diskLuminanceCompression);
  
  // Boost texture contrast on bright regions so it survives bloom blur
  // Higher brightness = more contrast boost needed to remain visible after blur
  float contrastMult = 1.0 + diskTextureContrast * sqrt(compressedIntensity);
  float boostedDensity = 1.0 + (mhdDensity - 1.0) * contrastMult;
  
  // MHD modulation with boosted contrast
  float intensity = compressedIntensity * boostedDensity;
  
  // Higher-order images (photon rings) are demagnified
  // Each orbit around BH loses ~60% of brightness due to photon loss
  float higherOrderDecay = pow(0.6, float(crossingIndex));
  intensity *= higherOrderDecay;
  
  // Alpha: smooth edge fading
  // Inner edge: fairly sharp at ISCO
  float innerEdgeWidth = (diskOuterRadius - diskInnerRadius) * 0.05;
  float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + innerEdgeWidth, r);
  // Outer edge: much wider/smoother fade for natural falloff
  float outerEdgeWidth = (diskOuterRadius - diskInnerRadius) * 0.25;
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

// Trace a single ray and return the color + TAA mask in alpha
vec4 traceRay(vec2 uv) {
  // Ray from camera through pixel
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;

  float camDist = length(cameraPos);

  vec3 color = vec3(0.0);
  vec4 diskAccum = vec4(0.0);
  vec4 overlayAccum = vec4(0.0); // Accumulated overlay contributions
  bool hitHorizon = false;
  bool escaped = false;

  // Track minimum radius for black hole edge mask and photon sphere glow
  float minRadius = 1000.0;
  
  // Track disk plane crossings for higher-order photon ring images
  int diskCrossings = 0;
  
  float h = 0.2;
  
  for (int i = 0; i < 300; i++) {
    if (i >= maxSteps) break;
    
    float r = length(rayPos);
    
    // Track closest approach to black hole
    minRadius = min(minRadius, r);
    
    if (r < rs) {
      hitHorizon = true;
      break;
    }
    
    float radialVel = dot(rayDir, rayPos / r);
    if (r > max(camDist * 2.0, 100.0) && radialVel > 0.0) {
      color = sampleStarfield(rayDir);
      escaped = true;
      break;
    }
    
    vec3 rHat = rayPos / r;
    float vDotR = dot(rayDir, rHat);
    float vPerpSq = 1.0 - vDotR * vDotR;
    float accel = -1.5 * rs * vPerpSq / (r * r);
    
    vec3 dv = accel * rHat * h;
    rayDir = normalize(rayDir + dv);
    
    float prevY = rayPos.y;
    float step = h * max(1.0, (r - rs) / rs);
    step = min(step, 0.5);
    
    vec3 newPos = rayPos + rayDir * step;
    float currY = newPos.y;
    
    // Disk plane crossing detection - track multiple crossings for photon rings
    if (prevY * currY < 0.0) {
      float t = abs(prevY) / (abs(prevY) + abs(currY));
      vec3 hitPos = mix(rayPos, newPos, t);
      float hitR = length(hitPos.xz);

      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        // Pass crossing index for higher-order image brightness decay
        vec4 newDisk = sampleDisk(hitPos, rayDir, hitR, diskCrossings);
        float remaining = 1.0 - diskAccum.a;
        diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
        diskAccum.a += newDisk.a * remaining;

        // Allow multiple crossings (up to 4) for higher-order photon rings
        // Only break early if we've accumulated enough opacity
        if (diskAccum.a > 0.99 && diskCrossings >= 2) break;
      }

      // Check disk-plane overlay rings at this crossing
      float ringThickness = 0.15 * rs;

      // ISCO ring (3rs) - Cyan
      if (overlayIsco > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, 3.0 * rs, ringThickness, vec3(0.0, 0.85, 0.85), overlayIsco);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Shadow edge ring (~2.6rs) - Purple/Magenta
      if (overlayShadowEdge > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, 2.598 * rs, ringThickness, vec3(0.8, 0.3, 0.9), overlayShadowEdge);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Photon sphere ring (1.5rs) - Gold
      if (overlayPhotonSphere > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, 1.5 * rs, ringThickness * 0.8, vec3(1.0, 0.85, 0.0), overlayPhotonSphere);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Event horizon ring - Red - placed at 1.1rs to ensure rays detect it before terminating at horizon
      if (overlayEventHorizon > 0.0) {
        vec4 ring = renderDiskPlaneRing(newPos, rayPos, rs * 1.1, ringThickness, vec3(1.0, 0.15, 0.15), overlayEventHorizon);
        overlayAccum.rgb += ring.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ring.a);
      }

      // Increment crossing counter regardless of whether we hit the disk
      // This tracks ray orbits around the black hole
      diskCrossings++;
    }

    // Scale rings at 5rs intervals - elevated above disk plane for visibility
    // Check every step, not just disk plane crossings
    if (overlayScale > 0.0) {
      float scaleHeight = 1.5 * rs;  // Height above disk plane
      float scaleThickness = 0.2 * rs;
      for (float scaleR = 5.0; scaleR <= 15.0; scaleR += 5.0) {
        // Render ring above the disk
        vec4 ringAbove = renderHorizontalRing(newPos, rayPos, scaleR * rs, scaleHeight, scaleThickness, vec3(0.7, 0.7, 0.75), overlayScale);
        overlayAccum.rgb += ringAbove.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ringAbove.a);
        // Render ring below the disk (mirror)
        vec4 ringBelow = renderHorizontalRing(newPos, rayPos, scaleR * rs, -scaleHeight, scaleThickness, vec3(0.7, 0.7, 0.75), overlayScale);
        overlayAccum.rgb += ringBelow.rgb * (1.0 - overlayAccum.a);
        overlayAccum.a = max(overlayAccum.a, ringBelow.a);
      }
    }
    
    rayPos = newPos;
    
    // Volumetric disk sampling
    float absY = abs(rayPos.y);
    if (absY < diskHalfThickness) {
      float hitR = length(rayPos.xz);
      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        float normalizedY = absY / diskHalfThickness;
        float verticalDensity = pow(1.0 - normalizedY, 2.0);
        vec3 projectedPos = vec3(rayPos.x, 0.0, rayPos.z);
        vec4 volColor = sampleDisk(projectedPos, rayDir, hitR, diskCrossings);
        float volAlpha = volColor.a * verticalDensity * diskVolumeDensity * step;
        float remaining = 1.0 - diskAccum.a;
        diskAccum.rgb += volColor.rgb * volAlpha * remaining;
        diskAccum.a += volAlpha * remaining;
      }
    }
  }
  
  // Determine background color
  vec3 backgroundColor = vec3(0.0);
  if (!hitHorizon) {
    if (escaped) {
      backgroundColor = color;
    } else {
      backgroundColor = sampleStarfield(rayDir);
    }
  }
  
  // Composite disk over background
  if (diskAccum.a > 0.0) {
    float remaining = 1.0 - diskAccum.a;
    color = diskAccum.rgb + backgroundColor * remaining;
  } else {
    color = backgroundColor;
  }
  
  // Photon sphere glow: rays passing near r = 1.5rs (photon sphere)
  // create the bright ring visible in EHT images
  if (!hitHorizon && minRadius < 2.5 * rs && minRadius > rs && photonSphereIntensity > 0.0) {
    float photonSphereRadius = 1.5 * rs;
    float psDistance = abs(minRadius - photonSphereRadius);
    
    // Gaussian glow centered on photon sphere
    float sigma = 0.15 * rs;
    float psGlow = exp(-psDistance * psDistance / (2.0 * sigma * sigma));
    
    // Scale by intensity and add warm white glow (slightly orange for hot gas)
    vec3 glowColor = vec3(1.0, 0.92, 0.85) * psGlow * photonSphereIntensity * 0.2;
    
    // Additive blend - photon sphere is bright!
    color += glowColor;
  }

  // Add accumulated overlay contributions (already computed during ray march)
  if (overlayAccum.a > 0.0) {
    // Additive blend for glowing overlays
    color += overlayAccum.rgb * overlayAccum.a;
  }

  return vec4(color, 1.0);
}

// Simple hash function for jitter
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

// Quick trace to detect if near black hole edge (returns minRadius)
float traceEdgeDetect(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;
  
  float camDist = length(cameraPos);
  float minR = 1000.0;
  float h = 0.3; // Larger step for speed
  
  // Quick march with fewer steps
  for (int i = 0; i < 80; i++) {
    float r = length(rayPos);
    minR = min(minR, r);
    
    if (r < rs) return minR; // Hit horizon
    if (r > max(camDist * 2.0, 100.0)) return minR; // Escaped
    
    vec3 rHat = rayPos / r;
    float vDotR = dot(rayDir, rHat);
    float vPerpSq = 1.0 - vDotR * vDotR;
    float accel = -1.5 * rs * vPerpSq / (r * r);
    
    rayDir = normalize(rayDir + accel * rHat * h);
    rayPos += rayDir * h;
  }
  return minR;
}

void main() {
  vec4 result;
  vec2 pixelSize = 1.0 / resolution;
  
  if (supersampleLevel <= 1) {
    // No supersampling requested, but check if we're near the BH edge
    // If bhEdgeSoftness > 0, do adaptive edge supersampling
    if (bhEdgeSoftness > 0.0) {
      float minR = traceEdgeDetect(vUv);
      float photonSphere = rs * 1.5;
      float edgeThreshold = rs * (2.0 + bhEdgeSoftness * 2.0); // 2-4 rs range
      
      // Near the photon sphere = potential edge aliasing
      if (minR < edgeThreshold && minR > rs * 0.5) {
        // Adaptive 2x2 supersampling for edge pixels
        vec4 accum = vec4(0.0);
        vec2 pixelCoord = vUv * resolution;
        
        for (int sy = 0; sy < 2; sy++) {
          for (int sx = 0; sx < 2; sx++) {
            vec2 cellIndex = vec2(float(sx), float(sy));
            vec2 jitter = hash2(pixelCoord + cellIndex * 17.31) - 0.5;
            vec2 offset = (cellIndex + 0.5 + jitter * 0.6) / 2.0 - 0.5;
            accum += traceRay(vUv + offset * pixelSize);
          }
        }
        result = accum / 4.0;
      } else {
        result = traceRay(vUv);
      }
    } else {
      result = traceRay(vUv);
    }
  } else {
    // Full supersampling with NxN jittered grid
    result = vec4(0.0);
    float n = float(supersampleLevel);
    float sampleCount = n * n;
    
    // Base pixel coordinate for consistent jitter pattern
    vec2 pixelCoord = vUv * resolution;
    
    for (int sy = 0; sy < 4; sy++) {
      if (sy >= supersampleLevel) break;
      for (int sx = 0; sx < 4; sx++) {
        if (sx >= supersampleLevel) break;
        
        // Stratified jitter: random offset within each grid cell
        // This breaks up regular aliasing patterns
        vec2 cellIndex = vec2(float(sx), float(sy));
        vec2 jitter = hash2(pixelCoord + cellIndex * 13.37) - 0.5; // -0.5 to 0.5
        
        // Sample position: grid cell center + jitter within cell
        vec2 cellOffset = (cellIndex + 0.5 + jitter * 0.8) / n - 0.5;
        vec2 sampleUv = vUv + cellOffset * pixelSize;
        
        result += traceRay(sampleUv);
      }
    }
    
    result /= sampleCount;
  }
  
  gl_FragColor = result;
}

