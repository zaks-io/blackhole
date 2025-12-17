import { createFilter, rampTo } from '../utils/effects';

/**
 * Disk proximity hum layer
 * Low drone that activates when camera approaches the accretion disk
 * Uses multiple oscillators with filtered noise for a rich, ominous sound
 */
export class DiskHumLayer {
  private ctx: AudioContext;
  private oscillator: OscillatorNode;
  private harmonicOsc: OscillatorNode;
  private subOsc: OscillatorNode;
  private noiseBuffer: AudioBuffer | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;
  private filter: BiquadFilterNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private gainNode: GainNode;
  private subGain: GainNode;
  private mainGain: GainNode;
  private harmGain: GainNode;

  private volume = 0.5;
  private baseFrequency = 65; // C2 - low drone

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;

    // Sub oscillator - very low foundation
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = this.baseFrequency / 2; // Octave below

    // Main oscillator - low sine drone
    this.oscillator = ctx.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = this.baseFrequency;

    // Harmonic oscillator - adds presence and audibility
    this.harmonicOsc = ctx.createOscillator();
    this.harmonicOsc.type = 'triangle';
    this.harmonicOsc.frequency.value = this.baseFrequency * 2; // Octave above

    // LFO for amplitude modulation (breathing/pulsing effect)
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.1; // Very slow breathing

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.1; // Subtle modulation depth

    // Noise for texture (wind/rumble)
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.15;

    // Lowpass filter - opens up as you get closer
    this.filter = createFilter(ctx, 'lowpass', 300, 3);

    // Volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    // Create noise buffer
    this.createNoiseBuffer();

    // Mixing gains for oscillators
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.6;

    this.mainGain = ctx.createGain();
    this.mainGain.gain.value = 0.5;

    this.harmGain = ctx.createGain();
    this.harmGain.gain.value = 0.25;

    // Connect oscillators through individual gains
    this.subOsc.connect(this.subGain);
    this.oscillator.connect(this.mainGain);
    this.harmonicOsc.connect(this.harmGain);

    // All to filter
    this.subGain.connect(this.filter);
    this.mainGain.connect(this.filter);
    this.harmGain.connect(this.filter);
    this.noiseGain.connect(this.filter);

    // Filter to output gain
    this.filter.connect(this.gainNode);
    this.gainNode.connect(output);

    // Connect LFO to main gain for amplitude modulation
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.gainNode.gain);

    // Start oscillators
    this.subOsc.start();
    this.oscillator.start();
    this.harmonicOsc.start();
    this.lfo.start();
    this.startNoise();
  }

  private createNoiseBuffer(): void {
    // Create pink-ish noise (filtered white noise)
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);

    // Generate noise with low-frequency bias
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0555179;
      b1 = 0.963 * b1 + white * 0.0750759;
      b2 = 0.57 * b2 + white * 0.153852;
      data[i] = (b0 + b1 + b2) * 0.3;
    }
  }

  private startNoise(): void {
    if (!this.noiseBuffer) return;

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = this.noiseBuffer;
    this.noiseSource.loop = true;
    this.noiseSource.connect(this.noiseGain);
    this.noiseSource.start();
  }

  /**
   * Set proximity factor (0-1)
   * Higher = camera closer to disk = louder
   */
  setProximity(proximity: number): void {
    const targetGain = proximity * this.volume;
    rampTo(this.gainNode.gain, targetGain, this.ctx.currentTime, 0.2);
  }

  /**
   * Set filter intensity (brightness based on disk activity)
   * Opens up the filter as intensity increases
   */
  setIntensity(intensity: number): void {
    // Map intensity (0-1) to filter cutoff (150-800 Hz)
    const cutoff = 150 + intensity * 650;
    rampTo(this.filter.frequency, cutoff, this.ctx.currentTime, 0.2);

    // Modulate noise level - more turbulent sound when closer
    const noiseLevel = 0.08 + intensity * 0.12;
    rampTo(this.noiseGain.gain, noiseLevel, this.ctx.currentTime, 0.2);
  }

  /**
   * Set base frequency
   */
  setFrequency(freq: number): void {
    this.baseFrequency = freq;
    rampTo(this.subOsc.frequency, freq / 2, this.ctx.currentTime, 0.5);
    rampTo(this.oscillator.frequency, freq, this.ctx.currentTime, 0.5);
    rampTo(this.harmonicOsc.frequency, freq * 2, this.ctx.currentTime, 0.5);
  }

  /**
   * Set volume (0-1)
   */
  setVolume(vol: number): void {
    this.volume = vol;
  }

  /**
   * Enable/disable layer
   */
  setEnabled(enabled: boolean): void {
    if (!enabled) {
      rampTo(this.gainNode.gain, 0, this.ctx.currentTime, 0.3);
    }
    // Note: When enabled, gain is controlled by setProximity() in update loop
  }

  dispose(): void {
    this.subOsc.stop();
    this.oscillator.stop();
    this.harmonicOsc.stop();
    this.lfo.stop();
    this.noiseSource?.stop();

    this.subOsc.disconnect();
    this.oscillator.disconnect();
    this.harmonicOsc.disconnect();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.noiseSource?.disconnect();
    this.noiseGain.disconnect();
    this.subGain.disconnect();
    this.mainGain.disconnect();
    this.harmGain.disconnect();
    this.filter.disconnect();
    this.gainNode.disconnect();
  }
}
