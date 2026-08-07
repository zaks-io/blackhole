'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { OverlayLabels } from '@/components/OverlayLabels';
import { SoundToggleButton } from '@/components/SoundToggleButton';
import { CameraController } from '@/lib/camera';
import { ToggleState, DEFAULT_TOGGLE_STATE } from '@/lib/types';

const BlackHoleSimulation = dynamic(() => import('@/components/BlackHoleSimulation'), {
  ssr: false,
  loading: () => (
    <div className="loading-placeholder">
      <span>Loading dev environment...</span>
      <style jsx>{`
        .loading-placeholder {
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
        }
      `}</style>
    </div>
  ),
});

function DevContent() {
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [toggleState, setToggleState] = useState<ToggleState>(DEFAULT_TOGGLE_STATE);

  const handleCameraReady = useCallback((controller: CameraController) => {
    setCameraController(controller);
  }, []);

  const handleSoundToggle = useCallback((enabled: boolean) => {
    setToggleState((prev) => ({ ...prev, audio: enabled }));
  }, []);

  // Listen for overlay changes from the GUI
  useEffect(() => {
    const handleOverlayChange = (e: CustomEvent<{ key: keyof ToggleState; value: boolean }>) => {
      setToggleState((prev) => ({ ...prev, [e.detail.key]: e.detail.value }));
    };

    window.addEventListener('dev-overlay-change', handleOverlayChange as EventListener);
    return () => {
      window.removeEventListener('dev-overlay-change', handleOverlayChange as EventListener);
    };
  }, []);

  return (
    <>
      <BlackHoleSimulation
        showDevControls={true}
        showStats={true}
        initialCameraPreset="default"
        initialEhtBlurEnabled={false}
        toggleState={toggleState}
        onCameraReady={handleCameraReady}
      />
      <div id="dev-overlay-labels" style={{ display: 'none' }}>
        <OverlayLabels cameraController={cameraController} toggleState={toggleState} show={true} />
      </div>
      <SoundToggleButton onToggle={handleSoundToggle} />
    </>
  );
}

export default function DevPage() {
  return <DevContent />;
}
