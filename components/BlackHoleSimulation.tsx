'use client';

import { useEffect, useRef } from 'react';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';
import { ToggleState } from '@/lib/types';
import { SimulationController, EhtBlurController } from '@/lib/simulation';
import { DevGUIController } from '@/lib/gui';
import { BinaryAudioController } from '@/lib/audio';
import {
  CAMERA_PRESETS,
  VIEW_SLUGS,
  STARFIELD_BACKGROUNDS,
  CAMERA_SEQUENCES,
  type CameraPreset,
  type StarfieldKey,
} from '@/lib/presets';

// Re-export for API compatibility
export { CAMERA_PRESETS, VIEW_SLUGS, STARFIELD_BACKGROUNDS, CAMERA_SEQUENCES };
export type { CameraPreset, StarfieldKey, EhtBlurController };

export interface BlackHoleSimulationProps {
  showDevControls?: boolean;
  showStats?: boolean;
  initialCameraPreset?: keyof typeof CAMERA_PRESETS;
  initialEhtBlurEnabled?: boolean;
  toggleState?: ToggleState;
  onCameraReady?: (controller: CameraController) => void;
  onEhtBlurReady?: (controller: EhtBlurController) => void;
  onAudioControllerReady?: (controller: BinaryAudioController) => void;
}

export default function BlackHoleSimulation({
  showDevControls = false,
  showStats = false,
  initialCameraPreset = 'far',
  initialEhtBlurEnabled = CONFIG.ehtBlur.enabled,
  toggleState,
  onCameraReady,
  onEhtBlurReady,
  onAudioControllerReady,
}: BlackHoleSimulationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const currentInitIdRef = useRef(0);
  const controllerRef = useRef<SimulationController | null>(null);
  const guiRef = useRef<DevGUIController | null>(null);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const thisInitId = ++currentInitIdRef.current;
    const container = containerRef.current;

    const controller = new SimulationController(
      {
        container,
        showDevControls,
        showStats,
        initialCameraPreset,
        initialEhtBlurEnabled,
        toggleState,
      },
      {
        onCameraReady,
        onEhtBlurReady,
        onAudioControllerReady,
      }
    );

    controllerRef.current = controller;

    controller.initialize().then(() => {
      // Check if superseded by newer init
      if (currentInitIdRef.current !== thisInitId) {
        controller.dispose();
        return;
      }

      // Setup dev GUI if enabled
      if (showDevControls) {
        guiRef.current = new DevGUIController({
          renderer: controller.getRenderer(),
          camera: controller.getCamera(),
          controls: controller.getControls(),
          cameraController: controller.cameraController,
          lensingPass: controller.lensingPass!,
          pipeline: controller.getPipeline(),
          starfieldManager: controller.getStarfieldManager(),
          audioController: controller.getAudioController(),
          hdrSupport: controller.getHdrSupport(),
          params: controller.getParams(),
          onAutoStepsChange: () => {
            // Trigger auto step count recalculation
            const params = controller.getParams();
            if (params.autoSteps) {
              const width = window.innerWidth * controller.getRenderer().getPixelRatio();
              const height = window.innerHeight * controller.getRenderer().getPixelRatio();
              const pixels = width * height;
              const minPixels = 2_000_000;
              const maxPixels = 8_300_000;
              const t = Math.max(0, Math.min(1, (pixels - minPixels) / (maxPixels - minPixels)));
              const steps = Math.round(
                params.autoStepsMax - t * (params.autoStepsMax - params.autoStepsMin)
              );
              params.maxSteps = steps;
              controller.lensingPass?.updateParams({ maxSteps: steps });
            }
          },
        });
      }
    });

    return () => {
      guiRef.current?.dispose();
      guiRef.current = null;
      controllerRef.current?.dispose();
      controllerRef.current = null;
      initRef.current = false;
    };
    // toggleState intentionally excluded - changes handled by separate useEffect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showDevControls,
    showStats,
    initialCameraPreset,
    initialEhtBlurEnabled,
    onCameraReady,
    onEhtBlurReady,
    onAudioControllerReady,
  ]);

  // Sync toggle state to shader and audio
  useEffect(() => {
    if (controllerRef.current && toggleState) {
      controllerRef.current.updateToggleState(toggleState);
      controllerRef.current.enableAudio(toggleState.audio);
    }
  }, [toggleState]);

  return (
    <>
      <div id="loading" className="loading">
        <span>INITIALIZING SIMULATION...</span>
      </div>
      <div ref={containerRef} className="simulation-container" />
      <style jsx>{`
        .simulation-container {
          width: 100%;
          height: 100%;
          position: fixed;
          top: 0;
          left: 0;
        }
        .loading {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          color: #fff;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
          font-size: 14px;
          letter-spacing: 0.1em;
          z-index: 1000;
          transition: opacity 0.5s ease;
        }
        .loading.hidden {
          opacity: 0;
          pointer-events: none;
        }
        .loading span {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
