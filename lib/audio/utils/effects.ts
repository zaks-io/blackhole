// Audio effects utilities

/**
 * Create a reverb impulse response buffer algorithmically
 * Uses early reflections followed by exponentially decaying noise tail
 */
export function createReverbImpulse(
  ctx: AudioContext,
  duration: number = 3,
  decay: number = 2
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  // Early reflection delays (in seconds) and gains
  const earlyDelays = [0.01, 0.015, 0.022, 0.03, 0.04, 0.055, 0.07];
  const earlyGains = [0.8, 0.6, 0.5, 0.45, 0.35, 0.25, 0.2];

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);

    // Add early reflections with slight stereo variation
    for (let i = 0; i < earlyDelays.length; i++) {
      const stereoOffset = channel === 0 ? 0 : 0.002 * (i % 2 === 0 ? 1 : -1);
      const sampleIndex = Math.floor((earlyDelays[i] + stereoOffset) * sampleRate);
      if (sampleIndex < length) {
        const sign = Math.random() > 0.5 ? 1 : -1;
        data[sampleIndex] += earlyGains[i] * sign;
      }
    }

    // Add diffuse tail (exponentially decaying noise)
    const tailStart = Math.floor(0.08 * sampleRate);
    for (let i = tailStart; i < length; i++) {
      const envelope = Math.exp(-(i - tailStart) / (sampleRate * decay));
      const noise = Math.random() * 2 - 1;
      data[i] += noise * envelope * 0.5;
    }
  }

  return buffer;
}

/**
 * Create a convolver node with generated reverb
 */
export function createReverb(
  ctx: AudioContext,
  duration: number = 3,
  decay: number = 2
): ConvolverNode {
  const convolver = ctx.createConvolver();
  convolver.buffer = createReverbImpulse(ctx, duration, decay);
  return convolver;
}

/**
 * Create a lowpass filter with configurable cutoff and resonance
 */
export function createFilter(
  ctx: AudioContext,
  type: BiquadFilterType = 'lowpass',
  frequency: number = 2000,
  Q: number = 1
): BiquadFilterNode {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  return filter;
}

/**
 * Create a stereo panner for 3D positioning
 * Configured for simulation coordinates (rs units, typically 0-100 range)
 */
export function createPanner(
  ctx: AudioContext,
  options: Partial<{
    panningModel: PanningModelType;
    distanceModel: DistanceModelType;
    refDistance: number;
    maxDistance: number;
    rolloffFactor: number;
  }> = {}
): PannerNode {
  const panner = ctx.createPanner();
  panner.panningModel = options.panningModel ?? 'HRTF';
  panner.distanceModel = options.distanceModel ?? 'inverse';
  panner.refDistance = options.refDistance ?? 1;
  panner.maxDistance = options.maxDistance ?? 200;
  panner.rolloffFactor = options.rolloffFactor ?? 0.5;
  panner.coneInnerAngle = 360;
  panner.coneOuterAngle = 360;
  return panner;
}

/**
 * Smoothly ramp a parameter to a target value
 */
export function rampTo(
  param: AudioParam,
  value: number,
  time: number,
  rampTime: number = 0.1
): void {
  param.setTargetAtTime(value, time, rampTime);
}

/**
 * Smoothly ramp frequency (exponential for musical pitch)
 */
export function rampFrequency(
  param: AudioParam,
  targetFreq: number,
  time: number,
  glideTime: number = 0.05
): void {
  // Clamp to positive values for exponential ramp
  const safeFreq = Math.max(0.01, targetFreq);
  param.exponentialRampToValueAtTime(safeFreq, time + glideTime);
}

/**
 * Linear interpolation helper
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map a value from one range to another
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  return lerp(outMin, outMax, t);
}
