import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';

export interface BinaryFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
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
}
