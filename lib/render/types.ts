import type { CameraSequence } from '../camera/CameraController';

export interface RenderResolution {
  width: number;
  height: number;
}

export interface RenderQualityPreset {
  name: string;
  resolution: RenderResolution;
  fps: number;
  rayMarching: {
    maxSteps: number;
  };
  supersampling: number;
  bloom: {
    resolutionScale: number;
  };
  ehtBlur?: {
    enabled: boolean;
    amount: number;
  };
}

export interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  framesPerSecond: number;
}

export interface RenderConfig {
  sequence: CameraSequence;
  preset: RenderQualityPreset;
  simulationSpeed: number;
}

export type RenderStatus = 'idle' | 'rendering' | 'paused' | 'completed' | 'cancelled';

export interface CameraKeyframe {
  time: number;
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
}
