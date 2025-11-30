import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';

export interface TurbulenceFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
}

export function createTurbulenceFolder(gui: GUI, config: TurbulenceFolderConfig): void {
  const { lensingPass, params } = config;

  const folder = gui.addFolder('Disk Turbulence');
  folder.close();

  folder
    .add(params, 'mhdTurbulenceIntensity', 0.0, 1.0, 0.05)
    .name('Intensity')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdTurbulenceIntensity: value });
    });

  folder
    .add(params, 'mhdSpiralArms', 1, 4, 1)
    .name('Spiral Arms')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdSpiralArms: value });
    });

  folder
    .add(params, 'mhdSpiralTightness', 1.0, 6.0, 0.5)
    .name('Spiral Tightness')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdSpiralTightness: value });
    });

  folder
    .add(params, 'mhdHotspotIntensity', 0.0, 1.0, 0.05)
    .name('Hotspot Intensity')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdHotspotIntensity: value });
    });

  folder
    .add(params, 'mhdHotspotCount', 0, 5, 1)
    .name('Hotspot Count')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdHotspotCount: value });
    });

  folder
    .add(params, 'mhdPatternSpeed', 0.0, 150.0, 0.5)
    .name('Pattern Speed')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdPatternSpeed: value });
    });

  folder
    .add(params, 'mhdMinDensity', 0.0, 1.0, 0.05)
    .name('Min Density')
    .onChange((value: number) => {
      lensingPass.updateParams({ mhdMinDensity: value });
    });
}
