'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { OverlayLabels } from '@/components/OverlayLabels';
import { CameraController } from '@/lib/camera';
import { ToggleState } from '@/lib/types';

const BlackHoleSimulation = dynamic(
  () => import('@/components/BlackHoleSimulation'),
  {
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
    )
  }
);

function DevContent() {
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [toggleState, setToggleState] = useState<ToggleState>({
    isco: false,
    eventHorizon: false,
    doppler: false,
    scale: false,
    disk: true,
    jets: false,
  });

  const handleCameraReady = useCallback((controller: CameraController) => {
    setCameraController(controller);
  }, []);

  // Listen for overlay changes from the GUI
  useEffect(() => {
    const handleOverlayChange = (e: CustomEvent<{ key: keyof ToggleState; value: boolean }>) => {
      setToggleState(prev => ({ ...prev, [e.detail.key]: e.detail.value }));
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
        onCameraReady={handleCameraReady}
      />
      <div id="dev-overlay-labels" style={{ display: 'none' }}>
        <OverlayLabels
          cameraController={cameraController}
          toggleState={toggleState}
          show={true}
        />
      </div>
    </>
  );
}

export default function DevPage() {
  return <ProtectedRoute component={DevContent} requiredRole="admin" />;
}
