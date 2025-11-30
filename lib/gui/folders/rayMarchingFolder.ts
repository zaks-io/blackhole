import GUI from 'lil-gui';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';

export interface RayMarchingFolderConfig {
  lensingPass: LensingPass;
  params: SimulationParams;
  onAutoStepsChange: () => void;
}

export function createRayMarchingFolder(gui: GUI, config: RayMarchingFolderConfig): void {
  const { lensingPass, params, onAutoStepsChange } = config;

  const folder = gui.addFolder('Ray Marching (Advanced)');
  folder.close();

  folder
    .add(params, 'autoSteps')
    .name('Auto Step Count')
    .onChange(() => {
      if (params.autoSteps) onAutoStepsChange();
    });

  folder
    .add(params, 'autoStepsMin', 16, 500, 4)
    .name('Auto Min')
    .onChange(() => {
      if (params.autoSteps) onAutoStepsChange();
    });

  folder
    .add(params, 'autoStepsMax', 50, 1000, 4)
    .name('Auto Max')
    .onChange(() => {
      if (params.autoSteps) onAutoStepsChange();
    });

  folder
    .add(params, 'maxSteps', 16, 1000, 4)
    .name('Manual Steps')
    .listen()
    .onChange((value: number) => {
      params.autoSteps = false;
      lensingPass.updateParams({ maxSteps: value });
    });

  folder
    .add(params, 'baseStepSize', 0.01, 0.5, 0.005)
    .name('Base Step Size')
    .onChange((value: number) => {
      lensingPass.updateParams({ baseStepSize: value });
    });

  folder
    .add(params, 'stepJitter', { Off: 0, On: 1 })
    .name('Step Jitter')
    .onChange((value: number) => {
      lensingPass.updateParams({ stepJitter: value });
    });

  folder
    .add(params, 'curvatureAdaptation', 0.0, 1.0, 0.1)
    .name('Curvature Adapt')
    .onChange((value: number) => {
      lensingPass.updateParams({ curvatureAdaptation: value });
    });

  folder
    .add(params, 'coronaStepRefinement', 0.0, 1.0, 0.1)
    .name('Corona Refinement')
    .onChange((value: number) => {
      lensingPass.updateParams({ coronaStepRefinement: value });
    });

  folder
    .add(params, 'lodEnabled', { Off: 0, On: 1 })
    .name('Distance LOD')
    .onChange((value: number) => {
      lensingPass.updateParams({ lodEnabled: value });
    });
}
