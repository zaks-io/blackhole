import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { StarfieldManager, SimulationParams } from '@/lib/simulation';
import { CONFIG } from '@/lib/config';

export interface WormholeFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
  starfieldManager: StarfieldManager;
}

export function createWormholeFolder(gui: GUI, config: WormholeFolderConfig): void {
  const { lensingPass, params, starfieldManager } = config;

  const folder = gui.addFolder('Wormhole');
  folder.close();

  let farSkyLoad: Promise<void> | null = null;
  const ensureFarSky = () => {
    farSkyLoad ??= starfieldManager
      .loadFar(CONFIG.wormhole.farSky)
      .then(({ texture, exposure }) => {
        lensingPass.setStarfieldFar(texture, exposure * CONFIG.wormhole.farSkyExposure);
      });
    return farSkyLoad;
  };

  folder
    .add(params, 'wormholeEnabled', { Off: 0, On: 1 })
    .name('Enable Wormhole')
    .onChange((value: number) => {
      lensingPass.updateParams({ wormholeEnabled: value });
      if (value > 0.5) void ensureFarSky();
    });

  folder
    .add(params, 'wormholeThroatRadius', 0.5, 6.0, 0.1)
    .name('Throat Radius')
    .onChange((value: number) => {
      lensingPass.updateParams({ wormholeThroatRadius: value });
    });

  folder
    .add(params, 'wormholeThroatLength', 0.0, 8.0, 0.25)
    .name('Throat Length')
    .onChange((value: number) => {
      lensingPass.updateParams({ wormholeThroatLength: value });
    });
}
