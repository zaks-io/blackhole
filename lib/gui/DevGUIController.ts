import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CameraController } from '@/lib/camera';
import { LensingPass } from '@/lib/passes';
import { HDRSupport } from '@/lib/display';
import { BinaryAudioController } from '@/lib/audio';
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
import { createWormholeFolder } from './folders/wormholeFolder';

const STORAGE_KEY = 'blackhole-dev-gui-state';

interface GUIState {
  controllers: Record<string, unknown>;
  folders: Record<string, GUIState>;
}

export interface DevGUIConfig {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  cameraController: CameraController;
  lensingPass: LensingPass;
  pipeline: PostProcessingPipeline;
  starfieldManager: StarfieldManager;
  audioController: BinaryAudioController;
  hdrSupport: HDRSupport;
  params: SimulationParams;
  ensureWormholeFarSky: () => Promise<void>;
  onAutoStepsChange: () => void;
}

export class DevGUIController {
  private gui: GUI;
  private defaults: GUIState;

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
      audioController: config.audioController,
    });

    createWormholeFolder(this.gui, {
      lensingPass: config.lensingPass,
      params: config.params,
      ensureFarSky: config.ensureWormholeFarSky,
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

    this.defaults = this.captureState();
    this.restoreState();
    this.gui.onFinishChange(() => this.persistState());
    this.gui.add({ reset: () => this.resetToDefaults() }, 'reset').name('Reset to Defaults');
  }

  // gui.save() but without disabled controllers: the read-only camera info rows
  // are backed by getter-only properties, so loading them back would throw.
  private captureState(): GUIState {
    const state = this.gui.save() as GUIState;
    const stripDisabled = (gui: GUI, folderState: GUIState) => {
      gui.controllers.forEach((c) => {
        if (c._disabled) delete folderState.controllers[c._name];
      });
      gui.folders.forEach((f) => stripDisabled(f, folderState.folders[f._title]));
    };
    stripDisabled(this.gui, state);
    return state;
  }

  private persistState(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.captureState()));
  }

  private restoreState(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      this.gui.load(JSON.parse(raw));
    } catch (error) {
      console.error('Discarding unreadable dev GUI state:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private resetToDefaults(): void {
    this.gui.load(this.defaults);
    localStorage.removeItem(STORAGE_KEY);
  }

  getGUI(): GUI {
    return this.gui;
  }

  dispose(): void {
    this.gui.destroy();
  }
}
