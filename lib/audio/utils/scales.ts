// Musical scale definitions and helpers

// Scale intervals in semitones from root
export const SCALES = {
  pentatonic: [0, 3, 5, 7, 10], // Minor pentatonic - safe, no tension
  lydian: [0, 2, 4, 6, 7, 9, 11], // Lydian mode - dreamy, cinematic
} as const;

export type ScaleType = keyof typeof SCALES;

// 8-step arpeggio patterns (indices into scale array)
export const ARPEGGIO_PATTERNS = {
  ascending: [0, 1, 2, 3, 4, 3, 2, 1], // Up and back down
  wave: [0, 2, 1, 3, 2, 4, 3, 1], // Gentle wave motion
  pulse: [0, 0, 2, 2, 4, 4, 2, 0], // Rhythmic pulse
} as const;

export type ArpeggioPattern = keyof typeof ARPEGGIO_PATTERNS;

// Standard tuning reference
const A4_FREQ = 440;
const A4_MIDI = 69;

// Note name to MIDI number (octave 4)
const NOTE_TO_MIDI: Record<string, number> = {
  C: 60,
  'C#': 61,
  Db: 61,
  D: 62,
  'D#': 63,
  Eb: 63,
  E: 64,
  F: 65,
  'F#': 66,
  Gb: 66,
  G: 67,
  'G#': 68,
  Ab: 68,
  A: 69,
  'A#': 70,
  Bb: 70,
  B: 71,
};

/**
 * Convert MIDI note number to frequency in Hz
 */
export function midiToFreq(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * Convert frequency to MIDI note number
 */
export function freqToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

/**
 * Parse note string like "C2" or "F#3" to MIDI number
 */
export function noteToMidi(note: string): number {
  const match = note.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return 60; // Default to C4

  const [, noteName, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const baseMidi = NOTE_TO_MIDI[noteName] ?? 60;

  // Adjust for octave (C4 = 60)
  return baseMidi + (octave - 4) * 12;
}

/**
 * Get frequency for a note string like "C2"
 */
export function noteToFreq(note: string): number {
  return midiToFreq(noteToMidi(note));
}

/**
 * Get the frequency for a scale degree
 * @param rootMidi - MIDI note number of root
 * @param scale - Scale type
 * @param degree - Scale degree (0-indexed, can exceed scale length for octaves)
 */
export function getScaleDegreeFreq(rootMidi: number, scale: ScaleType, degree: number): number {
  const intervals = SCALES[scale];
  const octaveOffset = Math.floor(degree / intervals.length);
  const degreeInScale = degree % intervals.length;
  const semitones = intervals[degreeInScale] + octaveOffset * 12;
  return midiToFreq(rootMidi + semitones);
}

/**
 * Get note index from orbital phase
 * Divides orbit into 8 segments
 */
export function phaseToNoteIndex(phase: number, pattern: ArpeggioPattern = 'ascending'): number {
  const normalizedPhase = ((phase % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const patternArray = ARPEGGIO_PATTERNS[pattern];
  const index = Math.floor((normalizedPhase / (2 * Math.PI)) * patternArray.length);
  return patternArray[index];
}

/**
 * Get interval in semitones based on mass ratio
 * Keeps both black holes in similar register
 */
export function massRatioToInterval(mass1: number): number {
  const mass2 = 1 - mass1;
  const ratio = Math.max(mass1, mass2) / Math.min(mass1, mass2);

  if (ratio < 1.5) return 3; // ~equal: minor 3rd
  if (ratio < 2.5) return 5; // ~2:1: perfect 4th
  if (ratio < 3.5) return 7; // ~3:1: perfect 5th
  return 7; // 4:1+: perfect 5th (cap it)
}
