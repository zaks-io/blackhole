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

// MHD parameters
uniform float mhdTurbulenceIntensity;  // 0-1
uniform float mhdSpiralArms;           // 2-4
uniform float mhdSpiralTightness;      // How tightly wound
uniform float mhdHotspotIntensity;     // 0-1
uniform int mhdHotspotCount;           // 0-5
uniform float mhdPatternSpeed;         // Pattern rotation speed multiplier

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

// Advected FBM - noise that flows with Keplerian rotation
// Uses seamless cylindrical mapping to avoid seams at phi = ±π
float advectedFBM(float r, float phi, float t, int octaves) {
  // Keplerian angular velocity: omega = sqrt(GM/r^3) = sqrt(0.5*rs/r) / r
  float omega = sqrt(0.5 * rs / r) / r;
  
  // Advect phi by subtracting rotation (material moves counter-clockwise)
  float advectedPhi = phi - omega * t;
  
  // Convert to seamless cylindrical coordinates using cos/sin
  // This ensures no seam at phi = ±π
  float cx = cos(advectedPhi);
  float cy = sin(advectedPhi);
  
  // Scale radius for noise frequency, use 2D circle for azimuth
  // The noise samples a 3D-like space: (r, cos(phi), sin(phi))
  // We combine into 2D by using r + offset*cos and offset*sin
  float scale = 2.0;
  vec2 noiseCoord = vec2(r * scale + cx * 1.5, cy * 1.5 + r * 0.3);
  
  return fbm(noiseCoord, octaves);
}

// ============================================================================
// MHD Effects
// ============================================================================

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

// Combined MHD density modulation
float getMHDDensity(float r, float phi, float t) {
  float density = 1.0;
  
  // Turbulent clumpy structure (advected noise)
  float turbulence = advectedFBM(r, phi, t, 4);
  // Map from [-1,1] to density variation
  float turbMod = 1.0 + turbulence * 0.5 * mhdTurbulenceIntensity;
  
  // Spiral density waves
  float spiral = getSpiralDensity(r, phi, t);
  // Modulate density by 30-50%
  float spiralMod = 0.7 + 0.6 * spiral * mhdTurbulenceIntensity;
  
  // Fine-scale filamentary structure with seamless coordinates
  float omega = sqrt(0.5 * rs / r) / r;
  float advPhi = phi - omega * t * 0.5;
  float fcx = cos(advPhi * 3.0);
  float fcy = sin(advPhi * 3.0);
  float fineNoise = snoise(vec2(r * 4.0 + fcx * 0.5, fcy * 0.5 + r * 0.2));
  float fineMod = 1.0 + fineNoise * 0.15 * mhdTurbulenceIntensity;
  
  density *= turbMod * spiralMod * fineMod;
  
  return clamp(density, 0.3, 2.5);
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

vec4 sampleDisk(vec3 hitPos, vec3 rayDir, float r) {
  // Get azimuthal angle for MHD effects
  float phi = atan(hitPos.z, hitPos.x);
  
  // Keplerian velocity
  float v = sqrt(0.5 * rs / r);
  vec3 tangent = normalize(vec3(-hitPos.z, 0.0, hitPos.x));
  vec3 vel = tangent * v;
  
  // Doppler
  float vr = dot(vel, -rayDir);
  float doppler = sqrt((1.0 + vr) / (1.0 - vr));
  
  // Get MHD modulations
  float mhdDensity = getMHDDensity(r, phi, time);
  float mhdTemp = getMHDTemperature(r, phi, time);
  
  // Temperature with MHD modulation
  float frac = (r - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);
  float baseTemp = mix(diskTemperatureInner, diskTemperatureOuter, frac);
  float temp = baseTemp * doppler * mhdTemp;
  
  vec3 color = sampleBlackbody(temp);
  
  // Intensity: MHD density only - NO edge fade on brightness
  // Disk stays bright right to the edge
  float baseIntensity = pow(doppler, 3.0) / (1.0 + frac * 2.0);
  float intensity = baseIntensity * mhdDensity;
  
  // Alpha: smooth edge transition for compositing
  float edgeWidth = (diskOuterRadius - diskInnerRadius) * 0.08;
  float innerFade = smoothstep(diskInnerRadius, diskInnerRadius + edgeWidth, r);
  float outerFade = smoothstep(diskOuterRadius, diskOuterRadius - edgeWidth, r);
  float alpha = innerFade * outerFade;
  
  // Emissive boost for bloom - preserve texture/contrast on bright Doppler side
  // Use softer multipliers and clamp to prevent washout
  float emissiveBoost = 1.0 + (mhdDensity - 1.0) * 0.6 + (mhdTemp - 1.0) * 0.8;
  emissiveBoost = clamp(emissiveBoost, 0.3, 1.6);
  
  return vec4(color * intensity * 2.0 * emissiveBoost, alpha);
}

void main() {
  // Ray from camera through pixel
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);
  vec3 rayPos = cameraPos;
  
  // Store initial ray direction for background (before any bending)
  vec3 initialDir = rayDir;
  float camDist = length(cameraPos);
  
  vec3 color = vec3(0.0);  // Start black
  vec4 diskAccum = vec4(0.0);  // Accumulated disk color (front-to-back compositing)
  bool hitHorizon = false;
  bool escaped = false;
  
  // Step size - smaller = more accurate but slower
  float h = 0.2;
  
  // Trace the ray with gravitational deflection
  for (int i = 0; i < 300; i++) {
    if (i >= maxSteps) break;
    
    float r = length(rayPos);
    
    // Inside event horizon
    if (r < rs) {
      hitHorizon = true;
      break;
    }
    
    // Escaped: ray is moving away from black hole and far enough out
    // The ray has escaped if it's far from BH AND moving outward
    float radialVel = dot(rayDir, rayPos / r);
    if (r > max(camDist * 2.0, 100.0) && radialVel > 0.0) {
      color = sampleStarfield(rayDir);
      escaped = true;
      break;
    }
    
    // === Gravitational deflection ===
    // This is the key formula: acceleration perpendicular to velocity
    // a = -1.5 * rs * (v_perp)^2 / r^2 toward center
    // For light, |v| = 1, so v_perp^2 = 1 - (v·r_hat)^2
    
    vec3 rHat = rayPos / r;
    float vDotR = dot(rayDir, rHat);
    float vPerpSq = 1.0 - vDotR * vDotR;
    
    // Schwarzschild geodesic: light bending acceleration
    float accel = -1.5 * rs * vPerpSq / (r * r);
    
    // Update velocity (direction)
    vec3 dv = accel * rHat * h;
    rayDir = normalize(rayDir + dv);
    
    // Check disk crossing before moving
    float prevY = rayPos.y;
    
    // Adaptive step: smaller near black hole
    float step = h * max(1.0, (r - rs) / rs);
    step = min(step, 0.5);
    
    // Move ray
    vec3 newPos = rayPos + rayDir * step;
    float currY = newPos.y;
    
    // Disk intersection (y=0 plane crossing) - handle MULTIPLE crossings
    if (prevY * currY < 0.0) {
      float t = abs(prevY) / (abs(prevY) + abs(currY));
      vec3 hitPos = mix(rayPos, newPos, t);
      float hitR = length(hitPos.xz);
      
      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        vec4 newDisk = sampleDisk(hitPos, rayDir, hitR);
        
        // Front-to-back compositing: accumulate each disk crossing
        // This handles multiple crossings (front disk, lensed back disk, etc.)
        float remaining = 1.0 - diskAccum.a;
        diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
        diskAccum.a += newDisk.a * remaining;
        
        // Early out if disk is nearly opaque
        if (diskAccum.a > 0.99) break;
      }
    }
    
    rayPos = newPos;
  }
  
  // Determine background color
  vec3 backgroundColor = vec3(0.0);
  if (!hitHorizon) {
    // Ray escaped or ran out of steps - sample starfield
    if (escaped) {
      backgroundColor = color; // Already sampled in escape condition
    } else {
      backgroundColor = sampleStarfield(rayDir);
    }
  }
  // If hit horizon, background stays black
  
  // Final compositing: disk accumulated color over background
  if (diskAccum.a > 0.0) {
    // Front-to-back compositing complete - blend accumulated disk over background
    float remaining = 1.0 - diskAccum.a;
    color = diskAccum.rgb + backgroundColor * remaining;
  } else {
    color = backgroundColor;
  }
  
  gl_FragColor = vec4(color, 1.0);
}
