import { rampTo } from '../utils/effects';

/**
 * Sub-bass layer - deep pulsing sine wave
 * Pulses gently with the orbital period
 */
export class SubBassLayer {
  private ctx: AudioContext;
  private oscillator: OscillatorNode;
  private gainNode: GainNode;
  private lfoOscillator: OscillatorNode;
  private lfoGain: GainNode;

  private baseFrequency = 40; // ~E1, very low
  private volume = 0.4;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;

    // Main sub-bass oscillator
    this.oscillator = ctx.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = this.baseFrequency;

    // Volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    // LFO for gentle pulsing
    this.lfoOscillator = ctx.createOscillator();
    this.lfoOscillator.type = 'sine';
    this.lfoOscillator.frequency.value = 0.05; // Very slow pulse

    // LFO depth - modulates the gain
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.05; // Very subtle pulse depth

    // Connect: LFO -> lfoGain -> gainNode.gain
    this.lfoOscillator.connect(this.lfoGain);
    this.lfoGain.connect(this.gainNode.gain);

    // Connect: oscillator -> gain -> output
    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(output);

    // Start oscillators
    this.oscillator.start();
    this.lfoOscillator.start();
  }

  /**
   * Set the pulse rate based on orbital period
   * @param orbitalPeriod - Period in seconds
   */
  setPulseRate(orbitalPeriod: number): void {
    const pulseFreq = 1 / Math.max(1, orbitalPeriod);
    rampTo(this.lfoOscillator.frequency, pulseFreq, this.ctx.currentTime, 0.5);
  }

  /**
   * Set the base frequency
   */
  setFrequency(freq: number): void {
    this.baseFrequency = freq;
    rampTo(this.oscillator.frequency, freq, this.ctx.currentTime, 0.1);
  }

  /**
   * Set volume (0-1)
   */
  setVolume(vol: number): void {
    this.volume = vol;
    rampTo(this.gainNode.gain, vol, this.ctx.currentTime, 0.1);
  }

  /**
   * Set pitch detune in cents (for Doppler-like effect)
   * Sub-bass can handle pitch modulation without sounding melodically wrong
   */
  setDetune(cents: number): void {
    this.oscillator.detune.setTargetAtTime(cents, this.ctx.currentTime, 0.1);
  }

  /**
   * Enable/disable layer
   */
  setEnabled(enabled: boolean): void {
    const targetGain = enabled ? this.volume : 0;
    rampTo(this.gainNode.gain, targetGain, this.ctx.currentTime, 0.2);
  }

  dispose(): void {
    this.oscillator.stop();
    this.lfoOscillator.stop();
    this.oscillator.disconnect();
    this.lfoOscillator.disconnect();
    this.gainNode.disconnect();
    this.lfoGain.disconnect();
  }
}
