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

varying vec2 vUv;

#define PI 3.14159265359

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

vec3 sampleDisk(vec3 hitPos, vec3 rayDir, float r) {
  // Keplerian velocity
  float v = sqrt(0.5 * rs / r);
  vec3 tangent = normalize(vec3(-hitPos.z, 0.0, hitPos.x));
  vec3 vel = tangent * v;
  
  // Doppler
  float vr = dot(vel, -rayDir);
  float doppler = sqrt((1.0 + vr) / (1.0 - vr));
  
  // Temperature
  float frac = (r - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);
  float temp = mix(diskTemperatureInner, diskTemperatureOuter, frac) * doppler;
  
  vec3 color = sampleBlackbody(temp);
  float intensity = pow(doppler, 3.0) / (1.0 + frac * 2.0);
  
  return color * intensity * 2.0;
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
  bool hitHorizon = false;
  bool hitDisk = false;
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
    
    // Disk intersection (y=0 plane crossing)
    if (prevY * currY < 0.0 && !hitDisk) {
      float t = abs(prevY) / (abs(prevY) + abs(currY));
      vec3 hitPos = mix(rayPos, newPos, t);
      float hitR = length(hitPos.xz);
      
      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        color = sampleDisk(hitPos, rayDir, hitR);
        hitDisk = true;
      }
    }
    
    rayPos = newPos;
  }
  
  // If we ran out of steps without hitting anything, sample starfield
  if (!hitHorizon && !hitDisk && !escaped) {
    color = sampleStarfield(rayDir);
  }
  
  // Black if fell into horizon and didn't hit disk
  if (hitHorizon && !hitDisk) {
    color = vec3(0.0);
  }
  
  gl_FragColor = vec4(color, 1.0);
}
