import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';
import { BinaryAudioController, SCALES, ARPEGGIO_PATTERNS } from '@/lib/audio';
import type { ScaleType, ArpeggioPattern } from '@/lib/audio';

export interface BinaryFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
  audioController?: BinaryAudioController;
}

export function createBinaryFolder(gui: GUI, config: BinaryFolderConfig): void {
  const { lensingPass, params } = config;

  const folder = gui.addFolder('Binary System');
  folder.close();

  // Binary toggle
  folder
    .add(params, 'binaryEnabled', { Off: 0, On: 1 })
    .name('Enable Binary')
    .onChange((value: number) => {
      lensingPass.updateParams({ binaryEnabled: value });
    });

  // Mass ratio (BH1 mass fraction)
  folder
    .add(params, 'binaryMass1', 0.1, 0.9, 0.05)
    .name('BH1 Mass Fraction')
    .onChange((value: number) => {
      lensingPass.updateParams({ binaryMass1: value });
    });

  // Separation
  folder
    .add(params, 'binarySeparation', 4.0, 20.0, 0.5)
    .name('Separation (rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ binarySeparation: value });
    });

  // Circumbinary outer radius
  folder
    .add(params, 'circumbinaryOuterRadius', 15.0, 50.0, 1.0)
    .name('Outer Disk Radius')
    .onChange((value: number) => {
      lensingPass.updateParams({ circumbinaryOuterRadius: value });
    });

  // Blend width
  folder
    .add(params, 'binaryBlendWidth', 0.5, 5.0, 0.25)
    .name('Blend Smoothness')
    .onChange((value: number) => {
      lensingPass.updateParams({ binaryBlendWidth: value });
    });

  // Stream width
  folder
    .add(params, 'streamWidth', 0.3, 3.0, 0.1)
    .name('Stream Width')
    .onChange((value: number) => {
      lensingPass.updateParams({ streamWidth: value });
    });

  // Stream density
  folder
    .add(params, 'streamDensity', 0.1, 2.0, 0.1)
    .name('Stream Brightness')
    .onChange((value: number) => {
      lensingPass.updateParams({ streamDensity: value });
    });

  // Audio controls
  if (config.audioController) {
    const audioFolder = folder.addFolder('Audio');

    const audioState = {
      enabled: false,
      masterVolume: 0.4,
      scale: 'lydian' as ScaleType,
      pattern: 'pulse' as ArpeggioPattern,
      rootNote: 'C2',
      reverbWet: 0.3,
      subBassVolume: 0.4,
      arpeggioVolume: 0.3,
      padVolume: 0.2,
      shimmerVolume: 0.15,
      diskHumVolume: 0.5,
      distortionRumbleVolume: 0.6,
    };

    // Scale options from SCALES constant
    const scaleOptions = Object.keys(SCALES).reduce(
      (acc, key) => {
        acc[key.charAt(0).toUpperCase() + key.slice(1)] = key;
        return acc;
      },
      {} as Record<string, string>
    );

    // Pattern options
    const patternOptions = Object.keys(ARPEGGIO_PATTERNS).reduce(
      (acc, key) => {
        acc[key.charAt(0).toUpperCase() + key.slice(1)] = key;
        return acc;
      },
      {} as Record<string, string>
    );

    // Root note options
    const rootNotes = ['C1', 'C2', 'D2', 'E2', 'F2', 'G2', 'A2', 'B2', 'C3'];
    const rootNoteOptions = rootNotes.reduce(
      (acc, note) => {
        acc[note] = note;
        return acc;
      },
      {} as Record<string, string>
    );

    audioFolder
      .add(audioState, 'enabled')
      .name('Enable')
      .onChange(async (value: boolean) => {
        if (value && !config.audioController!.isInitialized()) {
          await config.audioController!.initialize();
        }
        config.audioController!.setEnabled(value);
      });

    audioFolder
      .add(audioState, 'masterVolume', 0, 1, 0.05)
      .name('Master Volume')
      .onChange((value: number) => {
        config.audioController!.setVolume(value);
      });

    audioFolder
      .add(audioState, 'scale', scaleOptions)
      .name('Scale')
      .onChange((value: ScaleType) => {
        config.audioController!.setScale(value);
      });

    audioFolder
      .add(audioState, 'pattern', patternOptions)
      .name('Arpeggio Pattern')
      .onChange((value: ArpeggioPattern) => {
        config.audioController!.setArpeggioPattern(value);
      });

    audioFolder
      .add(audioState, 'rootNote', rootNoteOptions)
      .name('Root Note')
      .onChange((value: string) => {
        config.audioController!.setRootNote(value);
      });

    // Layer volumes subfolder
    const layersFolder = audioFolder.addFolder('Layer Volumes');

    layersFolder
      .add(audioState, 'subBassVolume', 0, 1, 0.05)
      .name('Sub Bass')
      .onChange((value: number) => {
        config.audioController!.setSubBassVolume(value);
      });

    layersFolder
      .add(audioState, 'arpeggioVolume', 0, 1, 0.05)
      .name('Arpeggios')
      .onChange((value: number) => {
        config.audioController!.setArpeggioVolume(value);
      });

    layersFolder
      .add(audioState, 'padVolume', 0, 1, 0.05)
      .name('Pad')
      .onChange((value: number) => {
        config.audioController!.setPadVolume(value);
      });

    layersFolder
      .add(audioState, 'shimmerVolume', 0, 1, 0.05)
      .name('Shimmer')
      .onChange((value: number) => {
        config.audioController!.setShimmerVolume(value);
      });

    layersFolder
      .add(audioState, 'diskHumVolume', 0, 1, 0.05)
      .name('Disk Hum')
      .onChange((value: number) => {
        config.audioController!.setDiskHumVolume(value);
      });

    layersFolder
      .add(audioState, 'distortionRumbleVolume', 0, 1, 0.05)
      .name('Distortion Rumble')
      .onChange((value: number) => {
        config.audioController!.setDistortionRumbleVolume(value);
      });

    // Effects
    audioFolder
      .add(audioState, 'reverbWet', 0, 1, 0.05)
      .name('Reverb')
      .onChange((value: number) => {
        config.audioController!.setReverbWet(value);
      });
  }
}
