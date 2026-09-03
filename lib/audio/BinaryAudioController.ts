import { SubBassLayer } from './layers/SubBassLayer';
import { ArpeggioLayer } from './layers/ArpeggioLayer';
import { PadLayer } from './layers/PadLayer';
import { ShimmerLayer } from './layers/ShimmerLayer';
import { DiskHumLayer } from './layers/DiskHumLayer';
import { DistortionRumbleLayer } from './layers/DistortionRumbleLayer';
import { ChirpLayer } from './layers/ChirpLayer';
import { createReverb, mapRange } from './utils/effects';
import {
  noteToMidi,
  phaseToNoteIndex,
  massRatioToInterval,
  ScaleType,
  ArpeggioPattern,
} from './utils/scales';

export interface AudioState {
  isBinaryMode: boolean; // true for binary, false for single BH
  orbitalPhase: number; // 0-2π, drives arpeggio
  separation: number; // BH separation in rs (or disk radius for single mode)
  cameraDistance: number; // Distance from origin
  cameraPosition: { x: number; y: number; z: number }; // Actual camera position
  cameraAngle: number; // Angle to orbital plane (0 = edge-on, π/2 = face-on)
  diskOpacity: number; // 0-1, drives pad layer
  diskOuterRadius: number; // Outer edge of accretion disk
  mass1: number; // BH1 mass fraction
  bh1Pos: { x: number; z: number }; // BH1 position for panning
  bh2Pos: { x: number; z: number }; // BH2 position for panning (unused in single mode)
  gwChirpEnvelope: number; // 0-1 gravitational wave strain envelope; 0 outside an inspiral
  deltaTime: number; // Time since last frame in seconds
}

export interface BinaryAudioConfig {
  masterVolume: number;
  rootNote: string; // e.g., "C2"
  scale: ScaleType;
  arpeggioPattern: ArpeggioPattern;
  reverbWet: number; // 0-1
  subBassVolume: number;
  arpeggioVolume: number;
  padVolume: number;
  shimmerVolume: number;
  diskHumVolume: number;
  distortionRumbleVolume: number;
  chirpVolume: number;
}

const DEFAULT_CONFIG: BinaryAudioConfig = {
  masterVolume: 0.4,
  rootNote: 'C2',
  scale: 'lydian',
  arpeggioPattern: 'pulse',
  reverbWet: 0.3,
  subBassVolume: 0.4,
  arpeggioVolume: 0.3,
  padVolume: 0.2,
  shimmerVolume: 0.15,
  diskHumVolume: 0.5,
  distortionRumbleVolume: 0.6,
  chirpVolume: 0.5,
};

export class BinaryAudioController {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private dcBlocker: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;

  // Layers
  private subBass: SubBassLayer | null = null;
  private bh1Arpeggio: ArpeggioLayer | null = null;
  private bh2Arpeggio: ArpeggioLayer | null = null;
  private pad: PadLayer | null = null;
  private shimmer: ShimmerLayer | null = null;
  private diskHum: DiskHumLayer | null = null;
  private distortionRumble: DistortionRumbleLayer | null = null;
  private chirp: ChirpLayer | null = null;

  private enabled = false;
  private initialized = false;
  private config: BinaryAudioConfig;
  private isBinaryMode = true;

  // Track last note to avoid redundant updates
  private lastNoteIndex = -1;

  // Track distances for Doppler effect
  private lastBh1Dist = 0;
  private lastBh2Dist = 0;

  constructor(config?: Partial<BinaryAudioConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.audioContext = new AudioContext();

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.setupAudioGraph();
    this.initialized = true;
  }

  private setupAudioGraph(): void {
    if (!this.audioContext) return;

    const ctx = this.audioContext;

    // DC blocking high-pass filter (removes sub-audible offset)
    this.dcBlocker = ctx.createBiquadFilter();
    this.dcBlocker.type = 'highpass';
    this.dcBlocker.frequency.value = 20;
    this.dcBlocker.Q.value = 0.7;

    // Limiter (prevents clipping when multiple layers peak)
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    // Analyser for visualization
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyserData = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    // Master output chain: masterGain → dcBlocker → limiter → destination
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.masterGain.connect(this.dcBlocker);
    this.dcBlocker.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // Connect analyser to master gain (pre-limiter for accurate level reading)
    this.masterGain.connect(this.analyser);

    // Reverb send/return
    this.reverb = createReverb(ctx, 4, 2.5);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = this.config.reverbWet;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);

    // Dry path
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1 - this.config.reverbWet;
    this.dryGain.connect(this.masterGain);

    // Pre-reverb mix bus (layers connect here)
    const mixBus = ctx.createGain();
    mixBus.gain.value = 1;
    mixBus.connect(this.reverb);
    mixBus.connect(this.dryGain);

    // Create layers
    const rootMidi = noteToMidi(this.config.rootNote);

    this.subBass = new SubBassLayer(ctx, mixBus);
    this.subBass.setVolume(this.config.subBassVolume);

    this.bh1Arpeggio = new ArpeggioLayer(ctx, mixBus, rootMidi, this.config.scale);
    this.bh1Arpeggio.setVolume(this.config.arpeggioVolume);

    // BH2 arpeggio starts at a small interval above BH1
    const bh2RootMidi = rootMidi + 3; // Default minor 3rd above, updated in update()
    this.bh2Arpeggio = new ArpeggioLayer(ctx, mixBus, bh2RootMidi, this.config.scale);
    this.bh2Arpeggio.setVolume(this.config.arpeggioVolume);

    this.pad = new PadLayer(ctx, mixBus, rootMidi); // Same octave as root
    this.pad.setVolume(this.config.padVolume);

    this.shimmer = new ShimmerLayer(ctx, mixBus, rootMidi + 12); // 1 octave above
    this.shimmer.setVolume(this.config.shimmerVolume);

    this.diskHum = new DiskHumLayer(ctx, mixBus);
    this.diskHum.setVolume(this.config.diskHumVolume);

    this.distortionRumble = new DistortionRumbleLayer(ctx, mixBus);
    this.distortionRumble.setVolume(this.config.distortionRumbleVolume);

    this.chirp = new ChirpLayer(ctx, mixBus);
    this.chirp.setVolume(this.config.chirpVolume);

    // Set up vector for listener (Y-up)
    const listener = ctx.listener;
    if (listener.upX) {
      listener.upX.setValueAtTime(0, ctx.currentTime);
      listener.upY.setValueAtTime(1, ctx.currentTime);
      listener.upZ.setValueAtTime(0, ctx.currentTime);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;
    const targetGain = enabled ? this.config.masterVolume : 0;
    this.masterGain.gain.setTargetAtTime(targetGain, now, 0.2);

    // Enable/disable all layers (BH2 arpeggio only in binary mode)
    this.subBass?.setEnabled(enabled);
    this.bh1Arpeggio?.setEnabled(enabled);
    this.bh2Arpeggio?.setEnabled(enabled && this.isBinaryMode);
    this.pad?.setEnabled(enabled);
    this.shimmer?.setEnabled(enabled);
    this.diskHum?.setEnabled(enabled);
    this.distortionRumble?.setEnabled(enabled);
    this.chirp?.setEnabled(enabled && this.isBinaryMode);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  update(state: AudioState): void {
    if (!this.enabled || !this.audioContext) return;

    const now = this.audioContext.currentTime;

    // Handle mode change
    if (state.isBinaryMode !== this.isBinaryMode) {
      this.isBinaryMode = state.isBinaryMode;
      this.bh2Arpeggio?.setEnabled(state.isBinaryMode && this.enabled);
      this.chirp?.setEnabled(state.isBinaryMode && this.enabled);
    }

    // Gravitational wave chirp follows the inspiral
    if (state.isBinaryMode) {
      this.chirp?.update(state.separation, state.gwChirpEnvelope);
    }

    // Update listener position and orientation for proper 3D audio
    const listener = this.audioContext.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(state.cameraPosition.x, now);
      listener.positionY.setValueAtTime(state.cameraPosition.y, now);
      listener.positionZ.setValueAtTime(state.cameraPosition.z, now);

      // Listener faces toward origin (where black holes are)
      const dist = Math.sqrt(
        state.cameraPosition.x ** 2 + state.cameraPosition.y ** 2 + state.cameraPosition.z ** 2
      );
      if (dist > 0.1) {
        // Normalized direction from camera toward origin
        const fx = -state.cameraPosition.x / dist;
        const fy = -state.cameraPosition.y / dist;
        const fz = -state.cameraPosition.z / dist;
        listener.forwardX.setValueAtTime(fx, now);
        listener.forwardY.setValueAtTime(fy, now);
        listener.forwardZ.setValueAtTime(fz, now);
      }
    }

    // Orbital phase -> note index with humanization
    const noteIndex = phaseToNoteIndex(state.orbitalPhase, this.config.arpeggioPattern);
    if (noteIndex !== this.lastNoteIndex) {
      this.lastNoteIndex = noteIndex;

      // BH1 arpeggio (always plays)
      const bh1Skip = Math.random() < 0.1; // 10% chance to skip note
      if (!bh1Skip) {
        const bh1Velocity = 0.7 + Math.random() * 0.3; // Velocity variation
        this.bh1Arpeggio?.setVelocity(bh1Velocity);
        this.bh1Arpeggio?.setNoteIndex(noteIndex);
      }

      // BH2 arpeggio (binary mode only)
      if (state.isBinaryMode) {
        const bh2Offset = 2 + Math.floor(Math.random() * 3); // 2-4 step offset (not always 3)
        const bh2Skip = Math.random() < 0.15; // 15% chance to skip (slightly more)
        if (!bh2Skip) {
          const bh2Velocity = 0.6 + Math.random() * 0.3;
          this.bh2Arpeggio?.setVelocity(bh2Velocity);
          this.bh2Arpeggio?.setNoteIndex((noteIndex + bh2Offset) % 8);
        }
      }
    }

    // Update BH2 root based on mass ratio (binary mode only)
    if (state.isBinaryMode) {
      const interval = massRatioToInterval(state.mass1);
      const rootMidi = noteToMidi(this.config.rootNote);
      this.bh2Arpeggio?.setRootNote(rootMidi + interval);
    }

    // Calculate distance from each BH to camera for wobble effects
    const distToBh1 = Math.sqrt(
      (state.cameraPosition.x - state.bh1Pos.x) ** 2 +
        state.cameraPosition.y ** 2 +
        (state.cameraPosition.z - state.bh1Pos.z) ** 2
    );
    // For single mode, distToBh2 equals distToBh1 (no second BH)
    const distToBh2 = state.isBinaryMode
      ? Math.sqrt(
          (state.cameraPosition.x - state.bh2Pos.x) ** 2 +
            state.cameraPosition.y ** 2 +
            (state.cameraPosition.z - state.bh2Pos.z) ** 2
        )
      : distToBh1;

    // Distance-based volume modulation: louder when closer
    // Use square root for gentler curve than inverse square
    const avgDist = state.cameraDistance;
    const bh1VolumeFactor = Math.pow(avgDist / Math.max(distToBh1, 1), 0.5);
    this.bh1Arpeggio?.setVolume(this.config.arpeggioVolume * Math.min(bh1VolumeFactor, 1.5));
    if (state.isBinaryMode) {
      const bh2VolumeFactor = Math.pow(avgDist / Math.max(distToBh2, 1), 0.5);
      this.bh2Arpeggio?.setVolume(this.config.arpeggioVolume * Math.min(bh2VolumeFactor, 1.5));
    }

    // Calculate approach velocity for Doppler-like effects (positive = approaching camera)
    const dt = Math.max(state.deltaTime, 0.001); // Avoid division by zero
    const bh1ApproachSpeed = (this.lastBh1Dist - distToBh1) / dt;
    const bh2ApproachSpeed = state.isBinaryMode
      ? (this.lastBh2Dist - distToBh2) / dt
      : bh1ApproachSpeed;
    const approachSpeedScale = 2; // rs/second for max effect

    // Doppler-like FILTER effect on arpeggios: brighter when approaching, darker when receding
    // (Pitch Doppler sounds dissonant on melodic voices, filter Doppler sounds natural)
    const baseFilterCutoff = mapRange(state.separation, 4, 20, 2000, 400);
    const filterModRange = 800; // Hz of modulation range
    const bh1FilterMod = Math.max(
      -filterModRange,
      Math.min(filterModRange, (bh1ApproachSpeed / approachSpeedScale) * filterModRange)
    );
    this.bh1Arpeggio?.setFilterCutoff(baseFilterCutoff + bh1FilterMod);
    if (state.isBinaryMode) {
      const bh2FilterMod = Math.max(
        -filterModRange,
        Math.min(filterModRange, (bh2ApproachSpeed / approachSpeedScale) * filterModRange)
      );
      this.bh2Arpeggio?.setFilterCutoff(baseFilterCutoff * 1.2 + bh2FilterMod);
    }

    // Doppler pitch effect on SUB-BASS (drones can pitch-shift without sounding melodically wrong)
    const combinedApproachSpeed = state.isBinaryMode
      ? (bh1ApproachSpeed + bh2ApproachSpeed) / 2
      : bh1ApproachSpeed;
    const subBassDoppler = 30; // Max cents for sub-bass
    const subBassDetune = Math.max(
      -subBassDoppler,
      Math.min(subBassDoppler, (combinedApproachSpeed / approachSpeedScale) * subBassDoppler)
    );
    this.subBass?.setDetune(subBassDetune);

    // Update distance tracking for next frame
    this.lastBh1Dist = distToBh1;
    this.lastBh2Dist = distToBh2;

    // Update arpeggio positions for 3D panning with stereo exaggeration
    const stereoExaggeration = 2.0;
    this.bh1Arpeggio?.setPosition(
      state.bh1Pos.x * stereoExaggeration,
      0,
      state.bh1Pos.z * stereoExaggeration
    );
    if (state.isBinaryMode) {
      this.bh2Arpeggio?.setPosition(
        state.bh2Pos.x * stereoExaggeration,
        0,
        state.bh2Pos.z * stereoExaggeration
      );
    }

    // Camera distance -> reverb wet and shimmer
    // Further = more atmospheric and distant sounding
    const distanceFactor = mapRange(state.cameraDistance, 10, 80, 0, 1);
    // Reverb: 0.15 when close, up to 0.85 when far (very wet/spacey)
    this.setReverbWet(0.15 + distanceFactor * 0.7);
    this.shimmer?.setIntensity(0.2 + distanceFactor * 0.8);

    // Disk opacity -> pad volume
    this.pad?.setVolume(this.config.padVolume * state.diskOpacity);
    this.pad?.setFilterCutoff(200 + state.diskOpacity * 600);

    // Sub-bass pulse follows the Keplerian P ∝ a^(3/2) scaling with the
    // total mass normalized to one; only the shape matters for the sound
    const orbitalPeriod = 2 * Math.PI * Math.sqrt(Math.pow(state.separation, 3));
    this.subBass?.setPulseRate(orbitalPeriod);

    // Disk proximity hum - activates when camera is near accretion disk
    const diskHeight = Math.abs(state.cameraPosition.y);
    const diskRadialDistance = Math.sqrt(state.cameraPosition.x ** 2 + state.cameraPosition.z ** 2);
    const outerRadius = (state.diskOuterRadius || 30) * 1.5; // Extend detection zone

    // More generous proximity detection
    const heightThreshold = 15; // rs units above/below disk
    const nearDiskPlane = diskHeight < heightThreshold;
    const nearDiskRadially = diskRadialDistance < outerRadius;

    if (nearDiskPlane && nearDiskRadially && state.diskOpacity > 0) {
      // Height factor: strongest at Y=0, fades as you go up/down
      const heightFactor = Math.pow(1 - diskHeight / heightThreshold, 1.5);

      // Radial factor: stronger when inside the disk area
      const radialFactor = diskRadialDistance < outerRadius * 0.7 ? 1 : 0.5;

      // Combined proximity
      const diskProximity = heightFactor * radialFactor * Math.max(0.3, state.diskOpacity);
      this.diskHum?.setProximity(diskProximity);
      this.diskHum?.setIntensity(heightFactor * state.diskOpacity);
    } else {
      this.diskHum?.setProximity(0);
    }

    // Distortion rumble - activates when very close to black holes
    // (distToBh1 and distToBh2 already calculated above for wobble effects)
    const minDistToBh = Math.min(distToBh1, distToBh2);

    // Distortion is extreme within ~10 rs of a black hole
    // Photon sphere is at 1.5 rs, event horizon at 1 rs
    const distortionThreshold = 15; // Start rumbling at this distance
    const maxDistortion = 3; // Maximum intensity at this distance

    if (minDistToBh < distortionThreshold) {
      // Exponential increase as you get closer
      const normalizedDist = (minDistToBh - maxDistortion) / (distortionThreshold - maxDistortion);
      const distortionIntensity = Math.pow(1 - Math.max(0, Math.min(1, normalizedDist)), 2);
      this.distortionRumble?.setIntensity(distortionIntensity);
    } else {
      this.distortionRumble?.setIntensity(0);
    }
  }

  // Configuration methods for dev GUI

  setVolume(volume: number): void {
    this.config.masterVolume = volume;
    if (this.enabled && this.masterGain && this.audioContext) {
      this.masterGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
    }
  }

  setReverbWet(wet: number): void {
    this.config.reverbWet = wet;
    if (this.reverbGain && this.dryGain && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.reverbGain.gain.setTargetAtTime(wet, now, 0.1);
      this.dryGain.gain.setTargetAtTime(1 - wet, now, 0.1);
    }
  }

  setScale(scale: ScaleType): void {
    this.config.scale = scale;
    this.bh1Arpeggio?.setScale(scale);
    this.bh2Arpeggio?.setScale(scale);
  }

  setRootNote(note: string): void {
    this.config.rootNote = note;
    const midi = noteToMidi(note);
    this.bh1Arpeggio?.setRootNote(midi);
    // BH2 root will be updated in next update() call
  }

  setArpeggioPattern(pattern: ArpeggioPattern): void {
    this.config.arpeggioPattern = pattern;
  }

  setSubBassVolume(vol: number): void {
    this.config.subBassVolume = vol;
    this.subBass?.setVolume(vol);
  }

  setArpeggioVolume(vol: number): void {
    this.config.arpeggioVolume = vol;
    this.bh1Arpeggio?.setVolume(vol);
    this.bh2Arpeggio?.setVolume(vol);
  }

  setPadVolume(vol: number): void {
    this.config.padVolume = vol;
    this.pad?.setVolume(vol);
  }

  setShimmerVolume(vol: number): void {
    this.config.shimmerVolume = vol;
    this.shimmer?.setVolume(vol);
  }

  setDiskHumVolume(vol: number): void {
    this.config.diskHumVolume = vol;
    this.diskHum?.setVolume(vol);
  }

  setDistortionRumbleVolume(vol: number): void {
    this.config.distortionRumbleVolume = vol;
    this.distortionRumble?.setVolume(vol);
  }

  setChirpVolume(vol: number): void {
    this.config.chirpVolume = vol;
    this.chirp?.setVolume(vol);
  }

  // Audio visualization methods

  getFrequencyData(): Uint8Array<ArrayBuffer> | null {
    if (!this.analyser || !this.analyserData) return null;
    this.analyser.getByteFrequencyData(this.analyserData);
    return this.analyserData;
  }

  getWaveformData(): Uint8Array<ArrayBuffer> | null {
    if (!this.analyser || !this.analyserData) return null;
    this.analyser.getByteTimeDomainData(this.analyserData);
    return this.analyserData;
  }

  getAudioLevel(): number {
    const data = this.getFrequencyData();
    if (!data) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum / (data.length * 255);
  }

  dispose(): void {
    this.subBass?.dispose();
    this.bh1Arpeggio?.dispose();
    this.bh2Arpeggio?.dispose();
    this.pad?.dispose();
    this.shimmer?.dispose();
    this.diskHum?.dispose();
    this.distortionRumble?.dispose();
    this.chirp?.dispose();

    this.reverb?.disconnect();
    this.reverbGain?.disconnect();
    this.dryGain?.disconnect();
    this.masterGain?.disconnect();
    this.dcBlocker?.disconnect();
    this.limiter?.disconnect();
    this.analyser?.disconnect();

    this.audioContext?.close();

    this.audioContext = null;
    this.masterGain = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.reverb = null;
    this.limiter = null;
    this.dcBlocker = null;
    this.analyser = null;
    this.analyserData = null;
    this.subBass = null;
    this.bh1Arpeggio = null;
    this.bh2Arpeggio = null;
    this.pad = null;
    this.shimmer = null;
    this.diskHum = null;
    this.distortionRumble = null;
    this.chirp = null;

    this.initialized = false;
    this.enabled = false;
  }
}
