/**
 * Halton sequence generator for low-discrepancy sampling
 * Used for temporal accumulation jitter to achieve better anti-aliasing
 */

/**
 * Generate a single value in the Halton sequence
 * @param index - The index in the sequence (1-based works best)
 * @param base - The prime base (typically 2 or 3)
 */
export function halton(index: number, base: number): number {
  let result = 0;
  let f = 1;
  let i = index;

  while (i > 0) {
    f = f / base;
    result = result + f * (i % base);
    i = Math.floor(i / base);
  }

  return result;
}

/**
 * Generate a 2D jitter offset using Halton sequence
 * Returns values in range [-0.5, 0.5] for sub-pixel jittering
 * @param sampleIndex - The sample index (0-based)
 */
export function haltonJitter(sampleIndex: number): { x: number; y: number } {
  // Use index+1 to avoid (0,0) for first sample
  const idx = sampleIndex + 1;
  return {
    x: halton(idx, 2) - 0.5,
    y: halton(idx, 3) - 0.5,
  };
}

/**
 * Pre-generate a sequence of Halton jitter values
 * @param count - Number of samples to generate
 */
export function generateHaltonSequence(count: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => haltonJitter(i));
}
