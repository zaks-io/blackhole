import { createFilter, createPanner, rampTo, rampFrequency } from '../utils/effects';
import { getScaleDegreeFreq, ScaleType } from '../utils/scales';

/**
 * Arpeggio layer - melodic voice for each black hole
 * Uses a single oscillator with frequency changes (not note on/off)
 * Includes filter and 3D panning
 */
export class ArpeggioLayer {
  private ctx: AudioContext;
  private oscillator: OscillatorNode;
  private harmonicOsc: OscillatorNode;
  private harmonicGain: GainNode;
  private filter: BiquadFilterNode;
  private panner: PannerNode;
  private gainNode: GainNode;

  private rootMidi: number;
  private scale: ScaleType;
  private currentNoteIndex = 0;
  private volume = 0.3;
  private velocity = 1.0;

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    rootMidi: number = 36, // C2
    scale: ScaleType = 'pentatonic'
  ) {
    this.ctx = ctx;
    this.rootMidi = rootMidi;
    this.scale = scale;

    // Main oscillator - triangle for soft tone
    this.oscillator = ctx.createOscillator();
    this.oscillator.type = 'triangle';
    this.oscillator.frequency.value = getScaleDegreeFreq(rootMidi, scale, 0);

    // Sub oscillator - adds warmth (octave below)
    this.harmonicOsc = ctx.createOscillator();
    this.harmonicOsc.type = 'sine';
    this.harmonicOsc.frequency.value = this.oscillator.frequency.value / 2;

    this.harmonicGain = ctx.createGain();
    this.harmonicGain.gain.value = 0.3; // Warm sub layer

    // Lowpass filter for warmth
    this.filter = createFilter(ctx, 'lowpass', 800, 1);

    // 3D panner for spatial positioning
    this.panner = createPanner(ctx);

    // Volume control
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0;

    // Connect chain: oscillators -> filter -> panner -> gain -> output
    this.oscillator.connect(this.filter);
    this.harmonicOsc.connect(this.harmonicGain);
    this.harmonicGain.connect(this.filter);
    this.filter.connect(this.panner);
    this.panner.connect(this.gainNode);
    this.gainNode.connect(output);

    // Start oscillators
    this.oscillator.start();
    this.harmonicOsc.start();
  }

  /**
   * Set the current note by scale degree index
   * Uses smooth glide between notes
   */
  setNoteIndex(index: number): void {
    if (index === this.currentNoteIndex) return;
    this.currentNoteIndex = index;

    const freq = getScaleDegreeFreq(this.rootMidi, this.scale, index);
    const now = this.ctx.currentTime;

    rampFrequency(this.oscillator.frequency, freq, now, 0.08);
    rampFrequency(this.harmonicOsc.frequency, freq / 2, now, 0.08);
  }

  /**
   * Set the root note (MIDI number)
   */
  setRootNote(midi: number): void {
    this.rootMidi = midi;
    // Update current note with new root
    this.setNoteIndex(this.currentNoteIndex);
  }

  /**
   * Set the scale type
   */
  setScale(scale: ScaleType): void {
    this.scale = scale;
    this.setNoteIndex(this.currentNoteIndex);
  }

  /**
   * Set filter cutoff frequency
   * Higher = brighter sound
   */
  setFilterCutoff(freq: number): void {
    rampTo(this.filter.frequency, freq, this.ctx.currentTime, 0.1);
  }

  /**
   * Set filter resonance
   */
  setFilterResonance(q: number): void {
    rampTo(this.filter.Q, q, this.ctx.currentTime, 0.1);
  }

  /**
   * Set 3D position for spatial audio
   */
  setPosition(x: number, y: number, z: number): void {
    const now = this.ctx.currentTime;
    this.panner.positionX.setValueAtTime(x, now);
    this.panner.positionY.setValueAtTime(y, now);
    this.panner.positionZ.setValueAtTime(z, now);
  }

  /**
   * Set volume (0-1)
   */
  setVolume(vol: number): void {
    this.volume = vol;
    rampTo(this.gainNode.gain, vol * this.velocity, this.ctx.currentTime, 0.1);
  }

  /**
   * Set velocity/expression (0-1)
   * Multiplies with volume for per-note dynamics
   */
  setVelocity(vel: number): void {
    this.velocity = vel;
    rampTo(this.gainNode.gain, this.volume * vel, this.ctx.currentTime, 0.05);
  }

  /**
   * Set pitch detune in cents (for Doppler-like effect)
   * Positive = pitch up, negative = pitch down
   */
  setDetune(cents: number): void {
    const now = this.ctx.currentTime;
    this.oscillator.detune.setTargetAtTime(cents, now, 0.05);
    this.harmonicOsc.detune.setTargetAtTime(cents, now, 0.05);
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
    this.harmonicOsc.stop();
    this.oscillator.disconnect();
    this.harmonicOsc.disconnect();
    this.harmonicGain.disconnect();
    this.filter.disconnect();
    this.panner.disconnect();
    this.gainNode.disconnect();
  }
}
