import type { RenderQualityPreset } from './types';

export const RENDER_PRESETS: Record<string, RenderQualityPreset> = {
  preview: {
    name: 'Preview (1080p 30fps)',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    rayMarching: { maxSteps: 150 },
    supersampling: 2,
    bloom: { resolutionScale: 0.5 },
  },
  standard: {
    name: 'Standard (1080p 60fps)',
    resolution: { width: 1920, height: 1080 },
    fps: 60,
    rayMarching: { maxSteps: 200 },
    supersampling: 2,
    bloom: { resolutionScale: 0.75 },
  },
  high: {
    name: 'High (4K)',
    resolution: { width: 3840, height: 2160 },
    fps: 60,
    rayMarching: { maxSteps: 300 },
    supersampling: 4,
    bloom: { resolutionScale: 1.0 },
  },
  ultra: {
    name: 'Ultra (4K)',
    resolution: { width: 3840, height: 2160 },
    fps: 60,
    rayMarching: { maxSteps: 500 },
    supersampling: 4,
    bloom: { resolutionScale: 1.0 },
  },
};

export const DEFAULT_PRESET = 'high';
export const DEFAULT_SIMULATION_SPEED = 3.0;
