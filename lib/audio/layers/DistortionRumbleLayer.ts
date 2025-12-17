import { createFilter, rampTo } from '../utils/effects';

/**
 * Distortion rumble layer
 * Deep, intense rumble that activates when camera is near black holes
 * where gravitational lensing distortion is extreme
 */
export class DistortionRumbleLayer {
  private ctx: AudioContext;
  private oscillator1: OscillatorNode;
  private oscillator2: OscillatorNode;
  private noiseBuffer: AudioBuffer | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode;
  private filter: BiquadFilterNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private gainNode: GainNode;
  private osc1Gain: GainNode;
  private osc2Gain: GainNode;

  private volume = 0.6;
  private baseFrequency = 30; // Very low rumble

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;

    // Primary rumble oscillator - very low
    this.oscillator1 = ctx.createOscillator();
    this.oscillator1.type = 'sine';
    this.oscillator1.frequency.value = this.baseFrequency;

    // Secondary oscillator - slightly detuned for thickness
    this.oscillator2 = ctx.createOscillator();
    this.oscillator2.type = 'sine';
    this.oscillator2.frequency.value = this.baseFrequency * 1.02; // Slight detune

    // Slow LFO for subtle movement
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.5; // Slow wobble

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.15; // Subtle depth

    // Rumble noise - low frequency content
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.4;

    // Very low filter for deep rumble
    this.filter = createFilter(ctx, 'lowpass', 80, 4);

    // Volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    // Create noise buffer
    this.createRumbleNoise();

    // Mixing
    this.osc1Gain = ctx.createGain();
    this.osc1Gain.gain.value = 0.7;

    this.osc2Gain = ctx.createGain();
    this.osc2Gain.gain.value = 0.5;

    // Connect oscillators
    this.oscillator1.connect(this.osc1Gain);
    this.oscillator2.connect(this.osc2Gain);

    this.osc1Gain.connect(this.filter);
    this.osc2Gain.connect(this.filter);
    this.noiseGain.connect(this.filter);

    this.filter.connect(this.gainNode);
    this.gainNode.connect(output);

    // LFO modulates the gain for tremolo effect
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.gainNode.gain);

    // Start
    this.oscillator1.start();
    this.oscillator2.start();
    this.lfo.start();
    this.startNoise();
  }

  private createRumbleNoise(): void {
    // Create very low frequency rumble noise
    const bufferSize = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);

    // Brown noise - even lower frequency content than pink
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5; // Boost level
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
   * Set distortion intensity (0-1)
   * Higher = more intense rumble
   */
  setIntensity(intensity: number): void {
    const targetGain = intensity * this.volume;
    rampTo(this.gainNode.gain, targetGain, this.ctx.currentTime, 0.15);

    // Open filter slightly with intensity
    const cutoff = 60 + intensity * 60;
    rampTo(this.filter.frequency, cutoff, this.ctx.currentTime, 0.2);

    // Subtle noise increase with intensity
    const noiseLevel = 0.2 + intensity * 0.3;
    rampTo(this.noiseGain.gain, noiseLevel, this.ctx.currentTime, 0.2);
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
    // Note: When enabled, gain is controlled by setIntensity() in update loop
  }

  dispose(): void {
    this.oscillator1.stop();
    this.oscillator2.stop();
    this.lfo.stop();
    this.noiseSource?.stop();

    this.oscillator1.disconnect();
    this.oscillator2.disconnect();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.noiseSource?.disconnect();
    this.noiseGain.disconnect();
    this.osc1Gain.disconnect();
    this.osc2Gain.disconnect();
    this.filter.disconnect();
    this.gainNode.disconnect();
  }
}
