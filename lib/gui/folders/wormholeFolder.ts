import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';

export interface WormholeFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
  ensureFarSky: () => Promise<void>;
}

export function createWormholeFolder(gui: GUI, config: WormholeFolderConfig): void {
  const { lensingPass, params, ensureFarSky } = config;

  const folder = gui.addFolder('Wormhole');
  folder.close();

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
