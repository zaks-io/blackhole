'use client';

import { useState, useCallback } from 'react';
import BlackHoleSimulation, { CAMERA_PRESETS } from './BlackHoleSimulation';
import { CameraPresetBar } from './CameraPresetBar';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';

/**
 * Wrapper component that contains both the simulation and camera controls.
 * This is dynamically imported so everything is in the same module scope.
 */
export default function SimulationWithControls() {
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [activePreset, setActivePreset] = useState<string>('orbit');

  const handleCameraReady = useCallback((controller: CameraController) => {
    setCameraController(controller);
  }, []);

  const handlePresetSelect = useCallback((presetName: string) => {
    const preset = CAMERA_PRESETS[presetName];
    if (!preset || !cameraController) return;

    setActivePreset(presetName);

    if (presetName === 'orbit') {
      cameraController.moveTo(
        { position: preset.position, lookAt: preset.lookAt },
        { duration: preset.duration, ease: preset.ease }
      ).then(() => {
        cameraController.startOrbit({
          distance: 20 * CONFIG.rs,
          height: 1 * CONFIG.rs,
          speed: 1,
        });
      });
    } else {
      cameraController.moveTo(
        { position: preset.position, lookAt: preset.lookAt },
        { duration: preset.duration, ease: preset.ease }
      );
    }
  }, [cameraController]);

  return (
    <>
      <BlackHoleSimulation
        showDevControls={false}
        showStats={false}
        onCameraReady={handleCameraReady}
      />
      {cameraController && (
        <CameraPresetBar
          onPresetSelect={handlePresetSelect}
          activePreset={activePreset}
        />
      )}
    </>
  );
}

