// ============================================================================
// LOD System
// ============================================================================

float calculateLOD(float camDist) {
  if (lodEnabled < 0.5) return 1.0;
  return 1.0 - smoothstep(lodNearDistance * rs, lodFarDistance * rs, camDist);
}
