import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraController } from '@/lib/camera';
import { LensingPass } from '@/lib/passes';
import { HDRSupport } from '@/lib/display';
import { PostProcessingPipeline, StarfieldManager, SimulationParams } from '@/lib/simulation';
import { createEnvironmentFolder } from './folders/environmentFolder';
import { createPhysicsFolder } from './folders/physicsFolder';
import { createDiskFolder } from './folders/diskFolder';
import { createTurbulenceFolder } from './folders/turbulenceFolder';
import { createCoronaJetsFolder } from './folders/coronaJetsFolder';
import { createPostProcessingFolder } from './folders/postProcessingFolder';
import { createOverlaysFolder } from './folders/overlaysFolder';
import { createCameraFolder } from './folders/cameraFolder';
import { createRayMarchingFolder } from './folders/rayMarchingFolder';
import { createBinaryFolder } from './folders/binaryFolder';

export interface DevGUIConfig {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  cameraController: CameraController;
  lensingPass: LensingPass;
  pipeline: PostProcessingPipeline;
  starfieldManager: StarfieldManager;
  hdrSupport: HDRSupport;
  params: SimulationParams;
  onAutoStepsChange: () => void;
}

export class DevGUIController {
  private gui: GUI;

  constructor(config: DevGUIConfig) {
    this.gui = new GUI({ title: 'Black Hole Controls' });

    createEnvironmentFolder(this.gui, {
      renderer: config.renderer,
      lensingPass: config.lensingPass,
      starfieldManager: config.starfieldManager,
      hdrSupport: config.hdrSupport,
    });

    createPhysicsFolder(this.gui, {
      lensingPass: config.lensingPass,
      controls: config.controls,
      params: config.params,
    });

    createBinaryFolder(this.gui, {
      lensingPass: config.lensingPass,
      params: config.params,
    });

    createDiskFolder(this.gui, {
      lensingPass: config.lensingPass,
      params: config.params,
    });

    createTurbulenceFolder(this.gui, {
      lensingPass: config.lensingPass,
      params: config.params,
    });

    createCoronaJetsFolder(this.gui, {
      lensingPass: config.lensingPass,
      params: config.params,
    });

    createPostProcessingFolder(this.gui, {
      lensingPass: config.lensingPass,
      pipeline: config.pipeline,
      params: config.params,
    });

    createOverlaysFolder(this.gui, {
      lensingPass: config.lensingPass,
    });

    createCameraFolder(this.gui, {
      camera: config.camera,
      cameraController: config.cameraController,
    });

    createRayMarchingFolder(this.gui, {
      lensingPass: config.lensingPass,
      params: config.params,
      onAutoStepsChange: config.onAutoStepsChange,
    });
  }

  getGUI(): GUI {
    return this.gui;
  }

  dispose(): void {
    this.gui.destroy();
  }
}
