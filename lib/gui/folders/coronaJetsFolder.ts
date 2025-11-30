import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';

export interface CoronaJetsFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
}

export function createCoronaJetsFolder(gui: GUI, config: CoronaJetsFolderConfig): void {
  const { lensingPass, params } = config;

  const folder = gui.addFolder('Corona & Jets');
  folder.close();

  // Corona subfolder
  const coronaFolder = folder.addFolder('Corona');

  coronaFolder
    .add(params, 'coronaEnabled', { Off: 0, On: 1 })
    .name('Enable')
    .onChange((value: number) => {
      lensingPass.updateParams({ coronaEnabled: value });
    });

  coronaFolder
    .add(params, 'coronaRadius', 3, 15, 0.5)
    .name('Radius (rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ coronaRadius: value });
    });

  coronaFolder
    .add(params, 'coronaDensity', 0.01, 1.0, 0.01)
    .name('Density')
    .onChange((value: number) => {
      lensingPass.updateParams({ coronaDensity: value });
    });

  // Jets subfolder
  const jetsFolder = folder.addFolder('Relativistic Jets');

  jetsFolder
    .add(params, 'jetsEnabled', { Off: 0, On: 1 })
    .name('Enable')
    .onChange((value: number) => {
      lensingPass.updateParams({ jetsEnabled: value });
    });

  jetsFolder
    .add(params, 'jetsHalfOpeningAngle', 5, 30, 1)
    .name('Opening Angle (°)')
    .onChange((value: number) => {
      lensingPass.updateParams({ jetsHalfOpeningAngle: value });
    });

  jetsFolder
    .add(params, 'jetsVelocity', 0.5, 0.99, 0.01)
    .name('Velocity (c)')
    .onChange((value: number) => {
      lensingPass.updateParams({ jetsVelocity: value });
    });

  jetsFolder
    .add(params, 'jetsLength', 10, 80, 5)
    .name('Length (rs)')
    .onChange((value: number) => {
      lensingPass.updateParams({ jetsLength: value });
    });

  jetsFolder
    .add(params, 'jetsDensity', 0, 1.0, 0.025)
    .name('Density')
    .onChange((value: number) => {
      lensingPass.updateParams({ jetsDensity: value });
    });
}
