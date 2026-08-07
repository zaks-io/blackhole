// ============================================================================
// Long-throat ultrastatic Morris-Thorne wormhole
// ============================================================================
// Compiled in only when WORMHOLE_MODE is defined (set from LensingPass when
// the wormhole toggle flips), mirroring the BINARY_MODE specialization.
//
// Metric: ds^2 = -dt^2 + dl^2 + r(l)^2 dOmega^2, where l is proper radial
// distance running from -inf (far universe) through 0 to +inf (near), b is
// the throat radius, and a is half the independently adjustable neck length:
//   q(l) = sign(l) max(|l| - a, 0),  r(l) = sqrt(b^2 + q(l)^2).
// The region |l| <= a is an exact cylindrical neck. Outside it, each mouth
// has the Ellis profile; a = 0 recovers the massless Ellis wormhole exactly.
// Null geodesics stay in the plane spanned by the entry radial direction and
// the ray direction, conserve L = r^2 dphi/ds, and obey
//   d^2l/ds^2 = L^2 r'(l) / r^3,   dphi/ds = L / r^2
// (James, von Tunzelmann, Franklin & Thorne, Am. J. Phys. 83, 486 (2015)).
// The camera's 3D distance from the origin is interpreted as |l|, with
// wormholeCameraSide selecting the universe, so a fly-through stays smooth.
//
// The far universe additionally holds a Schwarzschild black hole with the
// main scene's accretion disk (wormholeFarBhPos). The two lenses are far
// enough apart that space between them is flat, so a ray is a sequence of
// legs: integrate whichever lens's influence sphere the ray is in, connect
// legs by straight lines, finish on a sky map. Rays that transit the throat
// and then march the black hole produce the doubly-lensed view of the disk
// through the throat.
#ifdef WORMHOLE_MODE

// Influence radii: outside these, each lens's remaining deflection is small
// enough to drop (the mouths fall off as (b/R)^2) or to apply analytically (the
// Schwarzschild 2rs/R kick below). The spheres must not overlap:
// |wormholeFarBhPos| > a + THROAT_INFLUENCE_RADII * b + FAR_BH_INFLUENCE_RADII * rs.
const float THROAT_INFLUENCE_RADII = 8.0; // x throat radius b
const float FAR_BH_INFLUENCE_RADII = 16.0; // x rs
// The BH march escapes at this radius; the weak-field kick for sphere-missing
// rays truncates at the same radius so the sphere edge has no deflection seam.
const float FAR_BH_ESCAPE_RADII = 48.0; // x rs
// Inside this radius the marched path is curved, so straight-line rewinds
// (used to recover overshoot past the other lens) must stay outside it.
const float FAR_BH_CURVED_RADII = 8.0; // x rs

// Far-universe sky: same seam-safe explicit-LOD sampling as sampleStarfield
// (see disk.glsl for the derivation), against the second sky map.
vec3 sampleStarfieldFar(vec3 dir) {
  vec2 uv = dirToUV(dir);

  vec3 ddx = dFdx(dir);
  vec3 ddy = dFdy(dir);
  float planarSq = max(dir.x * dir.x + dir.z * dir.z, 1e-6);
  float invCosLat = inversesqrt(max(1.0 - dir.y * dir.y, 1e-6));
  vec2 gradX = vec2((dir.x * ddx.z - dir.z * ddx.x) / (planarSq * 2.0 * PI), ddx.y * invCosLat / PI);
  vec2 gradY = vec2((dir.x * ddy.z - dir.z * ddy.x) / (planarSq * 2.0 * PI), ddy.y * invCosLat / PI);

  vec2 size = vec2(textureSize(starfieldFar, 0));
  vec2 gx = gradX * size;
  vec2 gy = gradY * size;
  float lod = clamp(0.5 * log2(max(max(dot(gx, gx), dot(gy, gy)), 1e-12)), 0.0, 12.0);

  return textureLod(starfieldFar, uv, lod).rgb * starfieldFarExposure;
}

// ---------------------------------------------------------------------------
// Landmark bodies: a sun and a planet pinned into the near sky at infinity,
// so the home universe is tellable apart and the lensing has something
// legible to distort. Drawn from the escape direction like the star maps,
// they lens and transit correctly for free. The far sky stays empty: its
// black hole and disk are landmark enough. Directions are pre-normalized
// unit vectors in the chart-mapped sky frame.
const vec3 NEAR_SUN_DIR = vec3(0.7964, 0.3982, 0.4551);
const vec3 NEAR_SUN_COLOR = vec3(1.0, 0.9, 0.72);
const vec3 NEAR_PLANET_DIR = vec3(-0.5880, 0.1069, 0.8018);
const vec3 NEAR_PLANET_ALBEDO = vec3(0.22, 0.45, 0.85);
const float SUN_ANGULAR_RADIUS = 0.04;
const float PLANET_ANGULAR_RADIUS = 0.12;

// fwidth-based edge AA, clamped because escape directions diverge wildly for
// near-critical rays (same reason the star samplers clamp their LOD); a huge
// aa just fades the body there instead of shimmering.
vec3 drawSun(vec3 color, vec3 dir, vec3 center, vec3 tint) {
  float angle = acos(clamp(dot(dir, center), -1.0, 1.0));
  float aa = clamp(fwidth(angle), 1e-4, SUN_ANGULAR_RADIUS);
  float disc = 1.0 - smoothstep(SUN_ANGULAR_RADIUS - aa, SUN_ANGULAR_RADIUS + aa, angle);
  float glow = exp(-max(angle - SUN_ANGULAR_RADIUS, 0.0) / (0.75 * SUN_ANGULAR_RADIUS));
  return color + tint * (6.0 * disc + 0.5 * glow);
}

// Sphere impostor lit by its own sky's sun: the terminator makes it read as
// a 3D body, the rim glow keeps the night side visible against the stars.
vec3 drawPlanet(vec3 color, vec3 dir, vec3 center, vec3 sunDir, vec3 albedo) {
  float cosA = clamp(dot(dir, center), -1.0, 1.0);
  float angle = acos(cosA);
  float aa = clamp(fwidth(angle), 1e-4, 0.5 * PLANET_ANGULAR_RADIUS);
  float disc = 1.0 - smoothstep(PLANET_ANGULAR_RADIUS - aa, PLANET_ANGULAR_RADIUS + aa, angle);
  if (disc <= 0.0) return color;

  vec3 e1 = normalize(cross(center, abs(center.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(center, e1);
  vec3 offset = dir - cosA * center;
  vec2 p = vec2(dot(offset, e1), dot(offset, e2)) / sin(PLANET_ANGULAR_RADIUS);
  float r2 = min(dot(p, p), 1.0);
  vec3 normal = normalize(p.x * e1 + p.y * e2 - sqrt(1.0 - r2) * center);

  float dayside = max(dot(normal, sunDir), 0.0);
  float rim = pow(r2, 2.5);
  vec3 surface = albedo * (0.04 + 0.9 * dayside) + albedo * 0.5 * rim * (0.2 + dayside);
  return mix(color, surface, disc);
}

// Signed Ellis-mouth coordinate. It is zero throughout the cylindrical neck.
float wormholeMouthQ(float l, float halfLength) {
  return sign(l) * max(abs(l) - halfLength, 0.0);
}

float wormholeRadiusSq(float l, float bSq, float halfLength) {
  float q = wormholeMouthQ(l, halfLength);
  return bSq + q * q;
}

// Geodesic RHS for state s = (l, dl/ds, phi). Since r r' = q outside the
// neck and zero inside it, the radial acceleration is L^2 q / r^4.
vec3 wormholeDeriv(vec3 s, float Lsq, float L, float bSq, float halfLength) {
  float q = wormholeMouthQ(s.x, halfLength);
  float rSq = bSq + q * q;
  return vec3(s.y, Lsq * q / (rSq * rSq), L / rSq);
}

// Ray-sphere entry along pos + t * dir. tMin < 0 permits rewinding along the
// line: legs integrated through flat space can overshoot the other lens's
// sphere, and because that stretch of path really is straight, backing up to
// the sphere entry is exact. Returns the clamped entry parameter.
bool sphereEnter(vec3 rel, vec3 dir, float radius, float tMin, out float tEnter) {
  float tc = -dot(rel, dir);
  float d2 = dot(rel, rel) - tc * tc;
  float r2 = radius * radius;
  tEnter = 0.0;
  if (d2 >= r2) return false;
  float dt = sqrt(r2 - d2);
  if (tc + dt <= tMin) return false;
  tEnter = max(tc - dt, tMin);
  return true;
}

// Integrate the wormhole geodesic from pos (physical frame, |pos| = |l|) heading
// dir on universe `side` (+1 near, -1 far), out to the escape radius. Exits
// in place with the straight-line state in the exit universe's frame.
void traceThroatLeg(inout int stepsLeft, inout vec3 pos, inout vec3 dir, inout float side) {
  float b = wormholeThroatRadius;
  float bSq = b * b;
  float halfLength = 0.5 * max(wormholeThroatLength, 0.0);

  // The transit path runs straight through the origin; guard the one frame
  // where the camera sits (numerically) on it.
  float dist = length(pos);
  vec3 rHat = dist > 1e-4 ? pos / dist : normalize(wormholeCameraAxis);

  // Plane basis: e1 radial, e2 tangential along the ray. Degenerate for
  // purely radial rays, which carry L = 0 and never leave the radial line,
  // so any perpendicular works.
  float vr = dot(dir, rHat);
  vec3 tang = dir - vr * rHat;
  float vt = length(tang);
  vec3 e1 = rHat;
  vec3 e2 = vt > 1e-5 ? tang / vt : normalize(cross(rHat, abs(rHat.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));

  // Initial conditions. On the far side (side = -1), moving away from the
  // origin in 3D means moving toward more negative l, hence the side factors.
  float l0 = side * dist;
  float r0 = sqrt(wormholeRadiusSq(l0, bSq, halfLength));
  float L = r0 * vt;
  float Lsq = L * L;
  vec3 s = vec3(l0, side * vr, 0.0);

  float escapeL = halfLength + max(2.0 * max(abs(l0) - halfLength, 0.0), 25.0 * b);

  int budget = min(stepsLeft, maxSteps);
  for (int i = 0; i < budget; i++) {
    stepsLeft--;

    // Escaped: far from the throat and still moving outward
    if (abs(s.x) > escapeL && s.y * sign(s.x) > 0.0) break;

    // The cylindrical neck has constant r, so u = dl/ds is constant and the
    // entire remaining neck segment can be advanced exactly in one step.
    // This makes throat length essentially free in the fragment shader. Rays
    // with u ~= 0 are the critical rays orbiting the cylinder; leave those to
    // the normal budget so they retain the same stable critical-ring limit.
    bool insideNeck = abs(s.x) < halfLength ||
      (halfLength > 0.0 && abs(abs(s.x) - halfLength) < 1e-4 * b && s.x * s.y < 0.0);
    if (insideNeck && abs(s.y) > 1e-5) {
      float neckExit = sign(s.y) * halfLength;
      float travel = (neckExit - s.x) / s.y;
      if (travel > 1e-6) {
        s.x = neckExit;
        s.z = mod(s.z + travel * L / bSq, 2.0 * PI);
        continue;
      }
    }

    // Fine steps near the throat where geodesics wind, growing linearly with
    // distance where spacetime is nearly flat. The 0.6b floor only engages
    // inside r < 1.6b, which rays with p >= 2b never reach, so weak-field
    // deflection stays within ~2% of a fine-step reference; near-critical
    // winding rays cost ~30 steps per orbit, keeping lip-distance cameras
    // inside the leg budget (see tests/wormhole-integrator.test.ts).
    float r = sqrt(wormholeRadiusSq(s.x, bSq, halfLength));
    float ds = 0.25 * max(r - b, 0.6 * b);

    vec3 k1 = wormholeDeriv(s, Lsq, L, bSq, halfLength);
    vec3 k2 = wormholeDeriv(s + 0.5 * ds * k1, Lsq, L, bSq, halfLength);
    vec3 k3 = wormholeDeriv(s + 0.5 * ds * k2, Lsq, L, bSq, halfLength);
    vec3 k4 = wormholeDeriv(s + ds * k3, Lsq, L, bSq, halfLength);
    s += (ds / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }

  // Reconstruct the escape state in the ray plane. u_r/u_t are the
  // radial/tangential units after sweeping phi; on the far side outward
  // radial motion is -dl/ds, which the sign(l) factor supplies. Rays that
  // exhaust the loop are still winding at the critical curve; reconstructing
  // from their current state shades the (sub-pixel) critical ring plausibly.
  float rEnd = sqrt(wormholeRadiusSq(s.x, bSq, halfLength));
  float sideEnd = s.x >= 0.0 ? 1.0 : -1.0;
  vec3 uR = cos(s.z) * e1 + sin(s.z) * e2;
  vec3 uT = -sin(s.z) * e1 + cos(s.z) * e2;
  dir = normalize(sideEnd * s.y * uR + (L / rEnd) * uT);
  pos = abs(s.x) * uR;
  side = sideEnd;
}

// Compact Schwarzschild march for the far-universe black hole: the same
// deflection kick, adaptive stepping, thin/thick disk sampling, photon-ring
// mapping, and photon-sphere glow as traceRay's single-BH path, minus the
// overlays, corona, and jets (scenery, not the primary subject). Positions
// are relative to the BH in the physical far frame; the disk lies in its
// y = 0 plane. Returns premultiplied disk color; escape state via out params.
vec4 marchFarBlackHole(vec3 pos, vec3 dir, float lod, inout int stepsLeft,
                       out vec3 endPos, out vec3 endDir, out bool captured) {
  captured = false;
  bool terminated = false;
  vec4 diskAccum = vec4(0.0);

  // Photon angular momentum about the disk axis for the relativistic
  // g-factor; the lapse correction matters little at sphere-entry distance.
  float startDist = max(length(pos), 1.5 * rs);
  float bz = cross(pos, dir).y / sqrt(max(1.0 - rs / startDist, 0.01));

  float rsSq = rs * rs;
  float escapeR = FAR_BH_ESCAPE_RADII * rs;
  float contentRadius = diskOuterRadius * 1.2;
  float slabH = thickDiskEnabled > 0.5 ? thickDiskHalfThickness : diskHalfThickness;
  float minRadius = 1e3;
  int diskCrossings = 0;

  bool canHitDisk = computeImpactParameter(pos, dir) < contentRadius;

  // The whole remaining pool, not min(stepsLeft, maxSteps): a disk-crossing
  // march to the 48rs escape radius needs more steps than low-end maxSteps
  // (64 on high-resolution displays) provides, and a starved ray exits
  // mid-deflection and sky-shades a half-bent direction. Throat legs keep
  // their per-leg cap, so single-BH-leg rays get up to the full 2x pool.
  int budget = stepsLeft;
  for (int i = 0; i < budget; i++) {
    stepsLeft--;

    float rSq = dot(pos, pos);
    float r = sqrt(rSq);
    minRadius = min(minRadius, r);

    if (diskAccum.a > 0.98) {
      terminated = true;
      break;
    }
    if (rSq < rsSq) {
      captured = true;
      break;
    }

    vec3 rHat = pos / r;
    float radialVel = dot(dir, rHat);
    if (r > escapeR && radialVel > 0.0) {
      terminated = true;
      break;
    }

    float vPerpSq = 1.0 - radialVel * radialVel;
    float accel = -1.5 * rs * vPerpSq / rSq;

    float prevY = pos.y;
    float stepSize = clamp(baseStepSize * max(1.0, (r - rs) / rs), 0.01, 0.75);
    // Distance-scaled growth outside renderable content, with the same
    // slab-aware bound as the main march so above-plane rays stay cheap
    // while the strong-field guard keeps lensing detail.
    float farDist = r - contentRadius;
    float slabDist = max(abs(pos.y) - slabH, length(pos.xz) - contentRadius);
    farDist = max(farDist, min(slabDist, r - 5.0 * rs));
    stepSize = max(stepSize, farDist * 0.25);

    // Deflect by the same path length the ray advances (see traceRay)
    dir = normalize(dir + (accel * stepSize) * rHat);
    vec3 newPos = pos + dir * stepSize;
    float currY = newPos.y;

    if (prevY * currY < 0.0 && canHitDisk) {
      float t = abs(prevY) / (abs(prevY) + abs(currY));
      vec3 hitPos = mix(pos, newPos, t);
      float hitR = length(hitPos.xz);

      if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
        float remaining = 1.0 - diskAccum.a;
        if (remaining > 0.002) {
          vec4 newDisk = sampleDisk(hitPos, dir, hitR, diskCrossings, lod, bz);
          diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
          diskAccum.a += newDisk.a * remaining;
        }
        if (diskAccum.a > 0.99 && diskCrossings >= 2) {
          terminated = true;
          break;
        }
      } else if (hitR > rs * 1.5 && hitR < diskInnerRadius && diskCrossings > 0) {
        // Photon-ring images: log-map crossings near the photon sphere onto
        // the disk, exactly as the main march does
        float logHit = log(hitR);
        float photonRingFrac = (logHit - photonRingLogInner) / (photonRingLogOuter - photonRingLogInner);
        float mappedR = diskInnerRadius + photonRingFrac * diskRadiusRange;
        vec3 virtualHitPos = vec3(hitPos.x, 0.0, hitPos.z) * (mappedR / hitR);

        float remaining = 1.0 - diskAccum.a;
        if (remaining > 0.002) {
          vec4 newDisk = sampleDisk(virtualHitPos, dir, mappedR, diskCrossings, lod, bz);
          diskAccum.rgb += newDisk.rgb * newDisk.a * remaining;
          diskAccum.a += newDisk.a * remaining;
        }
      }
      diskCrossings++;
    }

    pos = newPos;

    // Volumetric slab sampling, thick-disk profile included for parity with
    // the main scene's look
    if (canHitDisk) {
      float absY = abs(pos.y);
      if (absY < slabH) {
        float hitR = length(pos.xz);
        if (hitR > diskInnerRadius && hitR < diskOuterRadius) {
          float normalizedY = absY / slabH;
          float verticalDensity;
          if (thickDiskEnabled > 0.5) {
            float sigma = thickDiskPuffiness;
            verticalDensity = exp(-normalizedY * normalizedY / (2.0 * sigma * sigma));
          } else {
            verticalDensity = pow(1.0 - normalizedY, 2.0);
          }

          float remaining = 1.0 - diskAccum.a;
          float weightEst = verticalDensity * diskVolumeDensity * stepSize * remaining;
          if (weightEst > 2e-4) {
            vec4 volColor = sampleDisk(vec3(pos.x, 0.0, pos.z), dir, hitR, diskCrossings, lod, bz);
            float volAlpha = volColor.a * verticalDensity * diskVolumeDensity * stepSize;
            diskAccum.rgb += volColor.rgb * volAlpha * remaining;
            diskAccum.a += volAlpha * remaining;
          }
        }
      }
    }
  }

  // Rays that ran out of steps while still deep in the strong field are
  // winding near the photon sphere; their current direction is mid-deflection
  // garbage that would shimmer as sky. Shading them black is the plausible
  // limit (near-critical rays are captured or vanishingly dim) and holds
  // still as the camera moves.
  if (!captured && !terminated && dot(pos, pos) < 9.0 * rsSq) {
    captured = true;
  }

  // Photon sphere glow, additive like the main scene's
  if (!captured && minRadius < 2.5 * rs && minRadius > rs && photonSphereIntensity > 0.0) {
    float psDistance = abs(minRadius - 1.5 * rs);
    float sigma = 0.15 * rs;
    float psGlow = exp(-psDistance * psDistance / (2.0 * sigma * sigma));
    diskAccum.rgb += vec3(1.0, 0.92, 0.85) * psGlow * photonSphereIntensity * 0.2;
  }

  endPos = pos;
  endDir = dir;
  return diskAccum;
}

vec4 traceWormholeRay(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);

  // Chart map: a transit flies through the world origin while staying on the
  // same radial line of the chart, so each crossing maps world coordinates
  // into the chart through one more reflection across the plane perpendicular
  // to the crossing axis (composed CPU-side at the flip). The reflection is
  // the unique map that keeps every ray direction continuous on the crossing
  // frame, and being a fixed isometry it keeps both skies rigid as the camera
  // moves around afterwards. Identity while no crossing has happened.
  // Mapping the whole ray state up front puts all leg geometry in the fixed
  // physical frame the skies (and the far black hole) are pinned in.
  vec3 pos = wormholeChartBasis * cameraPos;
  vec3 dir = wormholeChartBasis * rayDir;
  float side = wormholeCameraSide;

  float whInfluence = 0.5 * max(wormholeThroatLength, 0.0) +
    THROAT_INFLUENCE_RADII * wormholeThroatRadius;
  float bhInfluence = FAR_BH_INFLUENCE_RADII * rs;

  // LOD keyed to the flight distance to the far BH; through-the-throat views
  // approximate it as camera-to-throat plus throat-to-BH.
  float bhDist = side > 0.0 ? length(pos) + length(wormholeFarBhPos)
                            : length(pos - wormholeFarBhPos);
  float lod = calculateLOD(bhDist);

  // Legs share a step pool so the doubly-lensed worst case stays capped
  int stepsLeft = maxSteps * 2;
  vec4 acc = vec4(0.0);
  bool captured = false;
  // Weak-field kick bookkeeping for the final sky lookup (far side only)
  bool kickAllowed = true;
  float kickRewind = 0.0;

  int LEG_THROAT = 0;
  int LEG_BH = 1;

  int next;
  if (side > 0.0) {
    // Near universe holds only the throat; integrate every ray from the
    // camera, exactly as before the far BH existed
    next = LEG_THROAT;
  } else {
    // Far universe: route to whichever influence sphere the ray meets first;
    // between/outside them space is flat
    float tWh;
    float tBh;
    bool hitWh = sphereEnter(pos, dir, whInfluence, 0.0, tWh);
    bool hitBh = sphereEnter(pos - wormholeFarBhPos, dir, bhInfluence, 0.0, tBh);
    if (hitWh && (!hitBh || tWh <= tBh)) {
      pos += dir * tWh;
      next = LEG_THROAT;
    } else if (hitBh) {
      pos += dir * tBh;
      next = LEG_BH;
    } else {
      next = -1;
    }
  }

  // Up to three legs covers every visible path (throat-BH-throat brings
  // near-sky light back around the BH); anything longer is sub-pixel
  for (int leg = 0; leg < 3; leg++) {
    if (next == LEG_THROAT) {
      traceThroatLeg(stepsLeft, pos, dir, side);
      if (side > 0.0) break; // near sky

      // Exited into the far universe: black hole ahead? The integrator flies
      // the flat outskirts straight and can overshoot the BH sphere, so the
      // test may rewind along the exit line, though never back into the
      // curved throat region.
      float rewind = -max(length(pos) - whInfluence, 0.0);
      float tEnter;
      if (sphereEnter(pos - wormholeFarBhPos, dir, bhInfluence, rewind, tEnter)) {
        pos += dir * tEnter;
        next = LEG_BH;
      } else {
        kickRewind = -rewind;
        break; // far sky
      }
    } else if (next == LEG_BH) {
      vec3 legStart = pos;
      vec3 endQ;
      vec3 endDir;
      vec4 diskCol = marchFarBlackHole(pos - wormholeFarBhPos, dir, lod, stepsLeft, endQ, endDir, captured);
      float remaining = 1.0 - acc.a;
      acc.rgb += diskCol.rgb * remaining;
      acc.a = min(acc.a + diskCol.a * remaining, 1.0);
      if (captured || acc.a > 0.98) break;

      pos = endQ + wormholeFarBhPos;
      dir = endDir;
      // The marched ray's residual deflection past the escape radius is
      // dropped, matching the kick truncation, so no second kick here
      kickAllowed = false;

      // Throat behind the black hole? The rewind stays outside the strong
      // field and never backs up past where this leg started: for legs
      // starting at the camera, light behind the eye never reaches it.
      float rewind = -min(length(endQ) - FAR_BH_CURVED_RADII * rs, distance(pos, legStart));
      float tEnter;
      if (sphereEnter(pos, dir, whInfluence, min(rewind, 0.0), tEnter)) {
        pos += dir * tEnter;
        next = LEG_THROAT;
      } else {
        break; // far sky
      }
    } else {
      break; // routed straight to the sky
    }
  }

  vec3 sky = vec3(0.0);
  if (!captured) {
    if (side > 0.0) {
      sky = sampleStarfield(dir);
      sky = drawPlanet(sky, dir, NEAR_PLANET_DIR, NEAR_SUN_DIR, NEAR_PLANET_ALBEDO);
      sky = drawSun(sky, dir, NEAR_SUN_DIR, NEAR_SUN_COLOR);
    } else {
      // Analytic weak-field deflection for rays passing the BH outside its
      // influence sphere, truncated at the march escape radius so the sphere
      // boundary is seamless. Only for rays that never marched the BH; the
      // closest-approach test respects the same rewind allowance as the
      // sphere test that just missed.
      if (kickAllowed) {
        vec3 rel = pos - wormholeFarBhPos;
        float tc = -dot(rel, dir);
        if (tc > -kickRewind) {
          vec3 closest = rel + tc * dir;
          float R = length(closest);
          // Clamped for the ray-budget fallback path, where the closest
          // approach can dip inside the sphere the ray had no steps to march
          float bend = min(2.0 * rs * (1.0 / R - 1.0 / (FAR_BH_ESCAPE_RADII * rs)), 0.2);
          if (bend > 0.0) {
            dir = normalize(dir - (bend / R) * closest);
          }
        }
      }
      sky = sampleStarfieldFar(dir);
    }
  }

  return vec4(acc.rgb + sky * (1.0 - acc.a), 1.0);
}

#endif // WORMHOLE_MODE
