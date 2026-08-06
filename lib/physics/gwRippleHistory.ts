/**
 * Retarded-time emission history for the GW ripple overlay.
 *
 * A wave field carries the source's past outward: the field at radius r shows
 * the source as it was r / waveSpeed ago. Each frame the CPU records the
 * binary's actual quadrupole phase (2x the rendered orbital phase, so wave
 * crests are anchored to the pair's axis) and emitted amplitude on a fixed
 * time grid; the shader reads the sample at the retarded time, so chirp
 * tightening, amplitude growth, and the merger cutoff all propagate outward
 * instead of updating everywhere at once.
 *
 * The buffer starts (and resets to) silence: amplitude 0 in every slot. Waves
 * exist only where the source actually emitted them, so enabling the overlay
 * shows the first wavefront leaving the binary rather than a pre-built field.
 *
 * Samples are RGBA quads laid out for direct DataTexture upload:
 * [sin Φ, cos Φ, amplitude, 0], with Φ the quadrupole phase. The phase is
 * stored as a sin/cos pair rather than an unwrapped angle so float32
 * precision never degrades as the accumulated phase grows over a long
 * session.
 */
export class GwRippleHistory {
  readonly capacity: number;
  readonly sampleInterval: number;
  readonly data: Float32Array<ArrayBuffer>;

  private headIndex = -1;
  private headSampleTime = 0;
  private lastTime = 0;
  private lastPhase = 0;
  private lastAmplitude = 0;

  constructor(capacity: number, sampleInterval: number) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new RangeError('capacity must be an integer >= 2');
    }
    if (!Number.isFinite(sampleInterval) || sampleInterval <= 0) {
      throw new RangeError('sampleInterval must be positive and finite');
    }
    this.capacity = capacity;
    this.sampleInterval = sampleInterval;
    this.data = new Float32Array(capacity * 4);
  }

  /** Total index of the newest sample; its ring slot is head % capacity. */
  get head(): number {
    return this.headIndex;
  }

  /** Time of the newest sample. */
  get headTime(): number {
    return this.headSampleTime;
  }

  /** Forget all recorded emission; the next advance() re-primes to silence. */
  clear(): void {
    this.headIndex = -1;
  }

  /**
   * Advance to `time` with the source's current absolute quadrupole phase and
   * amplitude, writing every grid sample that has come due by interpolating
   * between the previous call's state and this one. Returns the number of
   * samples written. The first call (or the first after clear()) primes the
   * buffer to silence ending at `time`; a time regression (scene clock reset)
   * or a gap longer than the buffer re-primes the same way, since every
   * retained sample would be rewritten anyway.
   */
  advance(time: number, phase: number, amplitude: number): number {
    if (!Number.isFinite(time)) throw new RangeError('time must be finite');
    if (!Number.isFinite(phase)) throw new RangeError('phase must be finite');
    if (!Number.isFinite(amplitude) || amplitude < 0) {
      throw new RangeError('amplitude must be non-negative and finite');
    }

    const span = this.capacity * this.sampleInterval;
    if (this.headIndex < 0 || time < this.lastTime || time - this.headSampleTime > span) {
      return this.prime(time, phase, amplitude);
    }

    let written = 0;
    while (this.headSampleTime + this.sampleInterval <= time) {
      const sampleTime = this.headSampleTime + this.sampleInterval;
      // Due samples always fall in (lastTime, time]: anything earlier was
      // written by the call that covered it
      const f = (sampleTime - this.lastTime) / (time - this.lastTime);
      this.headSampleTime = sampleTime;
      this.headIndex += 1;
      this.writeSample(
        this.headIndex,
        this.lastPhase + f * (phase - this.lastPhase),
        this.lastAmplitude + f * (amplitude - this.lastAmplitude)
      );
      written += 1;
    }

    this.lastTime = time;
    this.lastPhase = phase;
    this.lastAmplitude = amplitude;
    return written;
  }

  private prime(time: number, phase: number, amplitude: number): number {
    this.headSampleTime = time;
    this.headIndex = this.headIndex < 0 ? this.capacity - 1 : this.headIndex + this.capacity;
    for (let stepsBack = 0; stepsBack < this.capacity; stepsBack++) {
      this.writeSample(this.headIndex - stepsBack, phase, 0);
    }
    this.lastTime = time;
    this.lastPhase = phase;
    this.lastAmplitude = amplitude;
    return this.capacity;
  }

  private writeSample(totalIndex: number, phase: number, amplitude: number): void {
    const offset = (totalIndex % this.capacity) * 4;
    this.data[offset] = Math.sin(phase);
    this.data[offset + 1] = Math.cos(phase);
    this.data[offset + 2] = amplitude;
  }
}
