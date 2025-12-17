import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';
import Stats from 'stats.js';
import { CameraController } from '@/lib/camera';
import { LensingPass, LensingParams } from '@/lib/passes/LensingPass';
import { BinaryAudioController } from '@/lib/audio';
import { ToggleState } from '@/lib/types';

export interface EhtBlurController {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
}

export interface PostProcessingConfig {
  fxaaEnabled: boolean;
  ehtBlurEnabled: boolean;
  ehtBlurStrength: number;
  ehtBlurIterations: number;
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomResolutionScale: number;
}

export interface SimulationConfig {
  container: HTMLDivElement;
  showDevControls: boolean;
  showStats: boolean;
  initialCameraPreset: string;
  initialEhtBlurEnabled: boolean;
  toggleState?: ToggleState;
}

export interface SimulationCallbacks {
  onCameraReady?: (controller: CameraController) => void;
  onEhtBlurReady?: (controller: EhtBlurController) => void;
  onAudioControllerReady?: (controller: BinaryAudioController) => void;
}

export interface SimulationParams extends LensingParams {
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  autoSteps: boolean;
  autoStepsMin: number;
  autoStepsMax: number;
  fxaaEnabled: boolean;
  ehtBlurEnabled: boolean;
  ehtBlurStrength: number;
  simulationSpeed: number;
}

export interface CleanupRefs {
  renderer?: THREE.WebGLRenderer;
  composer?: EffectComposer;
  controls?: OrbitControls;
  gui?: GUI;
  stats?: Stats;
  lensingPass?: LensingPass;
  animationId?: number;
  blurPasses?: { h: ShaderPass; v: ShaderPass }[];
}
