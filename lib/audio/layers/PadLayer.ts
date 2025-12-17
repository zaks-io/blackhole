import { createFilter, rampTo } from '../utils/effects';
import { midiToFreq } from '../utils/scales';

/**
 * Pad layer - warm atmospheric pad that responds to accretion disk
 * Uses detuned sawtooth oscillators for richness
 */
export class PadLayer {
  private ctx: AudioContext;
  private oscillators: OscillatorNode[] = [];
  private filter: BiquadFilterNode;
  private gainNode: GainNode;

  private baseFrequency: number;
  private volume = 0.2;

  constructor(ctx: AudioContext, output: AudioNode, rootMidi: number = 48) {
    // C3
    this.ctx = ctx;
    this.baseFrequency = midiToFreq(rootMidi);

    // Create 3 detuned oscillators for rich pad sound
    const detunes = [-7, 0, 7]; // Slight detuning in cents

    for (const detune of detunes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = this.baseFrequency;
      osc.detune.value = detune;
      this.oscillators.push(osc);
    }

    // Lowpass filter - key to pad warmth
    this.filter = createFilter(ctx, 'lowpass', 400, 2);

    // Volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    // Connect: oscillators -> filter -> gain -> output
    for (const osc of this.oscillators) {
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.33; // Equal mix
      osc.connect(oscGain);
      oscGain.connect(this.filter);
    }

    this.filter.connect(this.gainNode);
    this.gainNode.connect(output);

    // Start all oscillators
    for (const osc of this.oscillators) {
      osc.start();
    }
  }

  /**
   * Set the base frequency
   */
  setFrequency(freq: number): void {
    this.baseFrequency = freq;
    const now = this.ctx.currentTime;
    for (const osc of this.oscillators) {
      rampTo(osc.frequency, freq, now, 0.2);
    }
  }

  /**
   * Set filter cutoff - responds to disk intensity
   * Brighter disk = brighter sound
   */
  setFilterCutoff(freq: number): void {
    rampTo(this.filter.frequency, freq, this.ctx.currentTime, 0.2);
  }

  /**
   * Set volume (0-1)
   * Typically driven by disk opacity
   */
  setVolume(vol: number): void {
    this.volume = vol;
    rampTo(this.gainNode.gain, vol, this.ctx.currentTime, 0.15);
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
    this.filter.disconnect();
    this.gainNode.disconnect();
  }
}
