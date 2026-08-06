import { rampTo } from '../utils/effects';

/**
 * Gravitational-wave chirp - a rising tone tracking the binary inspiral.
 * The GW frequency is twice the orbital rate, so f scales as a^-3/2; that
 * chirp is mapped into the audible range. Gain follows the strain envelope,
 * swelling toward merger and ringing down after.
 */
export class ChirpLayer {
  private ctx: AudioContext;
  private oscillator: OscillatorNode;
  private gainNode: GainNode;

  private volume = 0.5;
  private enabled = false;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;

    this.oscillator = ctx.createOscillator();
    this.oscillator.type = 'sine';
    this.oscillator.frequency.value = 55;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    this.oscillator.connect(this.gainNode);
    this.gainNode.connect(output);
    this.oscillator.start();
  }

  /**
   * @param separation - BH separation in rs
   * @param envelope - 0-1 strain envelope; 0 outside an inspiral
   */
  update(separation: number, envelope: number): void {
    if (!this.enabled) return;

    const now = this.ctx.currentTime;
    const a = Math.max(separation, 1);

    // f_GW ∝ a^-3/2, anchored at 55 Hz for the 8 rs starting separation
    const freq = Math.min(55 * Math.pow(8 / a, 1.5), 880);
    rampTo(this.oscillator.frequency, freq, now, 0.08);

    // Strain amplitude grows ~1/a through the inspiral
    const swell = Math.min(1, 1.4 / a + 0.3);
    rampTo(this.gainNode.gain, this.volume * envelope * swell, now, 0.1);
  }

  setVolume(vol: number): void {
    this.volume = vol;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      rampTo(this.gainNode.gain, 0, this.ctx.currentTime, 0.2);
    }
  }

  dispose(): void {
    this.oscillator.stop();
    this.oscillator.disconnect();
    this.gainNode.disconnect();
  }
}
