// E = 1 affine velocity from the direction in a local static observer's frame.
// The radial component is unchanged; the transverse component carries L/E.
vec3 schwarzschildVelocity(vec3 pos, vec3 localDir, float rsBH) {
  float r = length(pos);
  vec3 radial = pos * (dot(pos, localDir) / (r * r));
  return radial + (localDir - radial) / sqrt(1.0 - rsBH / r);
}

vec3 schwarzschildLocalDirection(vec3 pos, vec3 velocity, float rsBH) {
  float r = length(pos);
  vec3 radial = pos * (dot(pos, velocity) / (r * r));
  return normalize(radial + (velocity - radial) * sqrt(1.0 - rsBH / r));
}

// The double root of the radial potential is b^2 = 27 rs^2 / 4.
// Inside the photon sphere, only outward rays below that threshold escape.
bool schwarzschildCaptured(float radius, float radialVelocity, float angularMomentumSq, float rsBH) {
  float criticalSq = 6.75 * rsBH * rsBH;
  if (radius < 1.5 * rsBH) return radialVelocity <= 0.0 || angularMomentumSq >= criticalSq;
  return radialVelocity <= 0.0 && angularMomentumSq <= criticalSq;
}

// Exact spatial null-geodesic force, with conserved squared angular momentum.
// Belbruno & Pretorius (2011), section 3: https://arxiv.org/abs/1103.0585
vec3 schwarzschildAcceleration(vec3 pos, float angularMomentumSq, float rsBH) {
  // A step ending inside the horizon is absorbed before another advance.
  float rSq = max(dot(pos, pos), rsBH * rsBH);
  return pos * (-1.5 * rsBH * angularMomentumSq / (rSq * rSq * sqrt(rSq)));
}

// Velocity Verlet preserves angular momentum without renormalizing velocity.
// Convert the spatial sampling interval to affine time to retain content bounds.
vec3 advanceSchwarzschild(vec3 pos, inout vec3 velocity, inout vec3 acceleration,
                          float angularMomentumSq, float rsBH, float distanceStep) {
  float dt = distanceStep / length(velocity);
  vec3 halfVelocity = velocity + acceleration * (0.5 * dt);
  vec3 nextPos = pos + halfVelocity * dt;
  // Reuse this force for the next step's first half-kick.
  acceleration = schwarzschildAcceleration(nextPos, angularMomentumSq, rsBH);
  velocity = halfVelocity + acceleration * (0.5 * dt);
  return nextPos;
}
