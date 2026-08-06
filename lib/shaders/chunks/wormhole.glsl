// ============================================================================
// Ellis Wormhole (massless Morris-Thorne throat)
// ============================================================================
// Compiled in only when WORMHOLE_MODE is defined (set from LensingPass when
// the wormhole toggle flips), mirroring the BINARY_MODE specialization.
//
// Metric: ds^2 = -dt^2 + dl^2 + r(l)^2 dOmega^2 with r(l) = sqrt(b^2 + l^2),
// where l is proper radial distance running from -inf (far universe) through
// 0 (the throat) to +inf (near universe) and b is the throat radius.
// Null geodesics stay in the plane spanned by the camera radial direction and
// the ray direction, conserve L = r^2 dphi/ds, and obey
//   d^2l/ds^2 = L^2 * l / r^4,   dphi/ds = L / r^2
// (James, von Tunzelmann, Franklin & Thorne, Am. J. Phys. 83, 486 (2015)).
// The camera's 3D distance from the origin is interpreted as |l|, with
// wormholeCameraSide selecting the universe, so a fly-through stays smooth.
#ifdef WORMHOLE_MODE

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
// Landmark bodies: a sun and a planet pinned into each sky at infinity, so
// the two universes are tellable apart and the lensing has something legible
// to distort. Drawn from the escape direction like the star maps, they lens
// and transit correctly for free. Distinct palettes per side: warm sun and
// ocean planet near, red sun and violet planet far. Directions are
// pre-normalized unit vectors in the chart-mapped sky frame.
const vec3 NEAR_SUN_DIR = vec3(0.7964, 0.3982, 0.4551);
const vec3 NEAR_SUN_COLOR = vec3(1.0, 0.9, 0.72);
const vec3 NEAR_PLANET_DIR = vec3(-0.5880, 0.1069, 0.8018);
const vec3 NEAR_PLANET_ALBEDO = vec3(0.22, 0.45, 0.85);
const vec3 FAR_SUN_DIR = vec3(-0.6527, 0.2720, -0.7071);
const vec3 FAR_SUN_COLOR = vec3(1.0, 0.42, 0.2);
const vec3 FAR_PLANET_DIR = vec3(0.5661, -0.2265, -0.7926);
const vec3 FAR_PLANET_ALBEDO = vec3(0.62, 0.32, 0.78);
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

// Geodesic RHS for state s = (l, dl/ds, phi)
vec3 wormholeDeriv(vec3 s, float Lsq, float L, float bSq) {
  float rSq = bSq + s.x * s.x;
  return vec3(s.y, Lsq * s.x / (rSq * rSq), L / rSq);
}

vec4 traceWormholeRay(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 clip = vec4(ndc, -1.0, 1.0);
  vec4 viewPos = inverseProjection * clip;
  viewPos = vec4(viewPos.xy, -1.0, 0.0);
  vec3 rayDir = normalize((inverseView * viewPos).xyz);

  float b = wormholeThroatRadius;
  float bSq = b * b;

  // The transit path runs straight through the origin; guard the one frame
  // where the camera sits (numerically) on it.
  float camDist = length(cameraPos);
  vec3 rHat = camDist > 1e-4 ? cameraPos / camDist : vec3(0.0, 0.0, 1.0);

  // Plane basis: e1 radial, e2 tangential along the ray. Degenerate for
  // purely radial rays, which carry L = 0 and never leave the radial line,
  // so any perpendicular works.
  float vr = dot(rayDir, rHat);
  vec3 tang = rayDir - vr * rHat;
  float vt = length(tang);
  vec3 e1 = rHat;
  vec3 e2 = vt > 1e-5 ? tang / vt : normalize(cross(rHat, abs(rHat.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));

  // Chart map: a transit flies through the world origin while staying on the
  // same radial line of the chart, so each crossing maps world coordinates
  // into the chart through one more reflection across the plane perpendicular
  // to the crossing axis (composed CPU-side at the flip). The reflection is
  // the unique map that keeps every ray direction continuous on the crossing
  // frame, and being a fixed isometry it keeps both skies rigid as the camera
  // moves around afterwards. Identity while no crossing has happened.
  e1 = wormholeChartBasis * e1;
  e2 = wormholeChartBasis * e2;

  // Initial conditions. On the far side (side = -1), moving away from the
  // origin in 3D means moving toward more negative l, hence the side factors.
  float l0 = wormholeCameraSide * camDist;
  float r0 = sqrt(bSq + l0 * l0);
  float L = r0 * vt;
  float Lsq = L * L;
  vec3 s = vec3(l0, wormholeCameraSide * vr, 0.0);

  float escapeL = max(2.0 * abs(l0), 25.0 * b);

  for (int i = 0; i < maxSteps; i++) {
    // Escaped: far from the throat and still moving outward
    if (abs(s.x) > escapeL && s.y * sign(s.x) > 0.0) break;

    // Fine steps near the throat where geodesics wind, growing linearly with
    // distance where spacetime is nearly flat. The 0.25 growth rate keeps
    // weak-field deflection within ~2% of a fine-step reference while
    // near-critical rays at typical camera distances still finish inside
    // maxSteps (see tests/wormhole-integrator.test.ts).
    float r = sqrt(bSq + s.x * s.x);
    float ds = 0.25 * max(r - b, 0.2 * b);

    vec3 k1 = wormholeDeriv(s, Lsq, L, bSq);
    vec3 k2 = wormholeDeriv(s + 0.5 * ds * k1, Lsq, L, bSq);
    vec3 k3 = wormholeDeriv(s + 0.5 * ds * k2, Lsq, L, bSq);
    vec3 k4 = wormholeDeriv(s + ds * k3, Lsq, L, bSq);
    s += (ds / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }

  // Reconstruct the escape direction in the ray plane. u_r/u_t are the
  // radial/tangential units after sweeping phi; on the far side outward
  // radial motion is -dl/ds, which the sign(l) factor supplies. Rays that
  // exhaust the loop are still winding at the critical curve; reconstructing
  // from their current state shades the (sub-pixel) critical ring plausibly.
  float rEnd = sqrt(bSq + s.x * s.x);
  float sideEnd = s.x >= 0.0 ? 1.0 : -1.0;
  vec3 uR = cos(s.z) * e1 + sin(s.z) * e2;
  vec3 uT = -sin(s.z) * e1 + cos(s.z) * e2;
  vec3 outDir = normalize(sideEnd * s.y * uR + (L / rEnd) * uT);

  vec3 color;
  if (sideEnd > 0.0) {
    color = sampleStarfield(outDir);
    color = drawPlanet(color, outDir, NEAR_PLANET_DIR, NEAR_SUN_DIR, NEAR_PLANET_ALBEDO);
    color = drawSun(color, outDir, NEAR_SUN_DIR, NEAR_SUN_COLOR);
  } else {
    color = sampleStarfieldFar(outDir);
    color = drawPlanet(color, outDir, FAR_PLANET_DIR, FAR_SUN_DIR, FAR_PLANET_ALBEDO);
    color = drawSun(color, outDir, FAR_SUN_DIR, FAR_SUN_COLOR);
  }
  return vec4(color, 1.0);
}

#endif // WORMHOLE_MODE
