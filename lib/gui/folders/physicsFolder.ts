import GUI from 'lil-gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LensingPass } from '@/lib/passes';
import { SimulationParams } from '@/lib/simulation';
import { CONFIG } from '@/lib/config';

export interface PhysicsFolderConfig {
  lensingPass: LensingPass;
  controls: OrbitControls;
  params: SimulationParams;
}

export function createPhysicsFolder(gui: GUI, config: PhysicsFolderConfig): void {
  const { lensingPass, controls, params } = config;

  const folder = gui.addFolder('Physics');
  folder.close();

  folder
    .add(params, 'rs', 0.5, 2.0, 0.1)
    .name('Schwarzschild Radius')
    .onChange((value: number) => {
      lensingPass.updateParams({ rs: value });
      controls.minDistance = CONFIG.camera.minDistance * value;
      controls.maxDistance = CONFIG.camera.maxDistance * value;
    });

  folder
    .add(params, 'photonSphereIntensity', 0.0, 1.0, 0.05)
    .name('Photon Sphere Glow')
    .onChange((value: number) => {
      lensingPass.updateParams({ photonSphereIntensity: value });
    });

  folder.add(params, 'simulationSpeed', 0.0, 100.0, 1.0).name('Time Scale');
}
