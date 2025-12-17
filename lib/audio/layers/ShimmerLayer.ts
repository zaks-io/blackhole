import { createFilter, rampTo } from '../utils/effects';
import { midiToFreq } from '../utils/scales';

/**
 * Shimmer layer - high ethereal harmonics
 * Responds to camera distance and lensing intensity
 * Creates a sense of cosmic vastness
 */
export class ShimmerLayer {
  private ctx: AudioContext;
  private oscillators: OscillatorNode[] = [];
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private filter: BiquadFilterNode;
  private gainNode: GainNode;

  private volume = 0.15;

  constructor(ctx: AudioContext, output: AudioNode, rootMidi: number = 72) {
    // C5 - high register
    this.ctx = ctx;

    const baseFreq = midiToFreq(rootMidi);

    // Create harmonically related oscillators
    // Root, octave, fifth above octave
    const ratios = [1, 2, 3];

    for (const ratio of ratios) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = baseFreq * ratio;
      this.oscillators.push(osc);
    }

    // Slow LFO for gentle movement
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.2; // Very slow

    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0.1; // Subtle modulation

    // Highpass filter to keep it airy
    this.filter = createFilter(ctx, 'highpass', 1000, 0.5);

    // Volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    // Connect LFO to oscillator frequencies for subtle chorus effect
    this.lfo.connect(this.lfoGain);
    for (const osc of this.oscillators) {
      this.lfoGain.connect(osc.frequency);
    }

    // Connect oscillators -> filter -> gain -> output
    for (let i = 0; i < this.oscillators.length; i++) {
      const oscGain = ctx.createGain();
      // Higher harmonics quieter
      oscGain.gain.value = 0.3 / (i + 1);
      this.oscillators[i].connect(oscGain);
      oscGain.connect(this.filter);
    }

    this.filter.connect(this.gainNode);
    this.gainNode.connect(output);

    // Start all oscillators
    for (const osc of this.oscillators) {
      osc.start();
    }
    this.lfo.start();
  }

  /**
   * Set the shimmer intensity
   * Driven by camera distance - further = more shimmer
   */
  setIntensity(intensity: number): void {
    // Intensity affects both volume and filter
    const vol = this.volume * intensity;
    const filterFreq = 800 + intensity * 2000; // More intense = brighter

    rampTo(this.gainNode.gain, vol, this.ctx.currentTime, 0.2);
    rampTo(this.filter.frequency, filterFreq, this.ctx.currentTime, 0.2);
  }

  /**
   * Set the base volume (0-1)
   */
  setVolume(vol: number): void {
    this.volume = vol;
    rampTo(this.gainNode.gain, vol, this.ctx.currentTime, 0.2);
  }

  /**
   * Set modulation depth for chorus-like effect
   * Driven by lensing strength
   */
  setModulationDepth(depth: number): void {
    rampTo(this.lfoGain.gain, depth * 5, this.ctx.currentTime, 0.1);
  }

  /**
   * Enable/disable layer
   */
  setEnabled(enabled: boolean): void {
    const targetGain = enabled ? this.volume : 0;
    rampTo(this.gainNode.gain, targetGain, this.ctx.currentTime, 0.3);
  }

  dispose(): void {
    for (const osc of this.oscillators) {
      osc.stop();
      osc.disconnect();
    }
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.filter.disconnect();
    this.gainNode.disconnect();
  }
}
