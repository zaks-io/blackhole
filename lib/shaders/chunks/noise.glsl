// ============================================================================
// Noise Functions (3D Texture LUT based)
// ============================================================================

// Interleaved Gradient Noise - Jorge Jimenez 2014
// Better than white noise for breaking up banding - has blue noise properties
float interleavedGradientNoise(vec2 screenPos) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(screenPos, magic.xy)));
}

// Fast noise using 3D texture lookup
// Z dimension is animated by time for temporal variation
float snoise(vec2 p) {
  float z = fract(time * noiseTimeScale);
  // Scale p to get good noise frequency, normalize to [0,1] for texture coords
  vec2 uv = fract(p * 0.1);
  float n = texture(noiseLUT, vec3(uv, z)).r;
  return n * 2.0 - 1.0;  // Convert from [0,1] to [-1,1]
}

// Fractal Brownian Motion using texture lookups
float fbm(vec2 p, int octaves) {
  float z = fract(time * noiseTimeScale);
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float maxValue = 0.0;

  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    vec2 uv = fract(p * frequency * 0.1);
    float n = texture(noiseLUT, vec3(uv, z + float(i) * 0.13)).r * 2.0 - 1.0;
    value += amplitude * n;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }

  return value / maxValue;
}
