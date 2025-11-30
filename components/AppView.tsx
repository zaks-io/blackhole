'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { track } from '@vercel/analytics';
import { useAuth0 } from '@auth0/auth0-react';
import BlackHoleSimulation, { CAMERA_PRESETS, CAMERA_SEQUENCES, EhtBlurController } from './BlackHoleSimulation';
import { CameraPresetBar } from './CameraPresetBar';
import { OverlayControlBar } from './OverlayControlBar';
import { InfoPanel } from './InfoPanel';
import { VoiceAgentPopup } from './VoiceAgentPopup';
import { VoiceLoginPrompt } from './VoiceLoginPrompt';
import { UserMenu } from './UserMenu';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';
import { OverlayState, DEFAULT_OVERLAY_STATE } from '@/lib/types';

/**
 * Wrapper component that contains both the simulation and camera controls.
 * This is dynamically imported so everything is in the same module scope.
 */
export default function AppView() {
  const { isAuthenticated } = useAuth0();
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>('default');
  const [ehtBlurController, setEhtBlurController] = useState<EhtBlurController | null>(null);
  const [ehtMode, setEhtMode] = useState(false);
  const [ehtBlurEnabled, setEhtBlurEnabled] = useState(true);
  const [introComplete, setIntroComplete] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState>(DEFAULT_OVERLAY_STATE);
  const [cameraDistance, setCameraDistance] = useState(20);
  const [isManualMode, setIsManualMode] = useState(false);
  const sendContextualUpdateRef = useRef<((text: string) => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handleContextualUpdateReady = useCallback((sendUpdate: (text: string) => void) => {
    sendContextualUpdateRef.current = sendUpdate;

    const activeOverlays = Object.entries(overlayState)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const overlayInfo = activeOverlays.length > 0
      ? `Active overlays: ${activeOverlays.join(', ')}.`
      : 'No overlays active.';
    const ehtInfo = ehtMode
      ? `EHT mode is on${ehtBlurEnabled ? ' with blur enabled' : ''}.`
      : '';

    sendUpdate(`Current view: ${activePreset}. ${overlayInfo} ${ehtInfo}`.trim());
  }, [activePreset, overlayState, ehtMode, ehtBlurEnabled]);

  const sendContextualUpdate = useCallback((message: string) => {
    sendContextualUpdateRef.current?.(message);
  }, []);

  const handleCameraReady = useCallback((controller: CameraController) => {
    setCameraController(controller);
    // Initial distance
    setCameraDistance(controller.getDistance());
  }, []);

  // Update camera distance and manual mode state on each frame
  useEffect(() => {
    if (!cameraController) return;

    const updateState = () => {
      setCameraDistance(cameraController.getDistance());
      setIsManualMode(cameraController.getMode() === 'manual');
      animationFrameRef.current = requestAnimationFrame(updateState);
    };

    animationFrameRef.current = requestAnimationFrame(updateState);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraController]);

  const handleEhtBlurReady = useCallback((controller: EhtBlurController) => {
    setEhtBlurController(controller);
  }, []);

  const handleEhtToggle = useCallback(() => {
    if (!cameraController || !ehtBlurController) return;

    if (ehtMode) {
      // Exit EHT mode - go back to default
      setEhtMode(false);
      setEhtBlurEnabled(false);
      ehtBlurController.setEnabled(false);
      setActivePreset('default');
      sendContextualUpdate('User disabled EHT mode, returning to default view');

      const defaultPreset = CAMERA_PRESETS.default;
      cameraController.moveTo(
        { position: defaultPreset.position, lookAt: defaultPreset.lookAt },
        { duration: 2, ease: 'power2.inOut' }
      ).then(() => {
        cameraController.startOrbit({
          distance: 20 * CONFIG.rs,
          height: 1 * CONFIG.rs,
          speed: 1,
        });
      });
    } else {
      // Enter EHT mode - move camera to EHT position then enable blur
      setEhtMode(true);
      setActivePreset('eht');
      sendContextualUpdate('User enabled EHT mode to view the black hole as seen by the Event Horizon Telescope');

      const ehtPreset = CAMERA_PRESETS.eht;
      cameraController.moveTo(
        { position: ehtPreset.position, lookAt: ehtPreset.lookAt },
        { duration: ehtPreset.duration, ease: ehtPreset.ease }
      ).then(() => {
        setEhtBlurEnabled(true);
        ehtBlurController.setEnabled(true);
      });
    }
  }, [cameraController, ehtBlurController, ehtMode, sendContextualUpdate]);

  const handleEhtBlurToggle = useCallback(() => {
    if (!ehtBlurController) return;
    const newState = !ehtBlurEnabled;
    setEhtBlurEnabled(newState);
    ehtBlurController.setEnabled(newState);
    sendContextualUpdate(`User ${newState ? 'enabled' : 'disabled'} EHT blur effect`);
  }, [ehtBlurController, ehtBlurEnabled, sendContextualUpdate]);

  const handleManualModeToggle = useCallback(() => {
    if (!cameraController) return;

    if (isManualMode) {
      // Exit manual mode - return to default orbit
      setActivePreset('default');
      sendContextualUpdate('User returned to auto camera mode');

      const defaultPreset = CAMERA_PRESETS.default;
      cameraController.moveTo(
        { position: defaultPreset.position, lookAt: defaultPreset.lookAt },
        { duration: 1.5, ease: 'power2.inOut' }
      ).then(() => {
        cameraController.startOrbit({
          distance: 20 * CONFIG.rs,
          height: 1 * CONFIG.rs,
          speed: 1,
        });
      });
    } else {
      // Enter manual mode
      cameraController.returnToManual();
      setActivePreset(null);
      sendContextualUpdate('User enabled manual camera control');

      // Exit EHT mode if active
      if (ehtMode) {
        setEhtMode(false);
        setEhtBlurEnabled(false);
        ehtBlurController?.setEnabled(false);
      }
    }
  }, [cameraController, isManualMode, ehtMode, ehtBlurController, sendContextualUpdate]);

  const handleReveal = useCallback(() => {
    if (!ehtBlurController || !cameraController) return;

    setIntroComplete(true);

    // Unblur
    ehtBlurController.setEnabled(false);
    setEhtMode(false);
    setEhtBlurEnabled(false);

    // Slight delay for choreography, then zoom camera
    setTimeout(() => {
      const defaultPreset = CAMERA_PRESETS.default;
      cameraController.moveTo(
        { position: defaultPreset.position, lookAt: defaultPreset.lookAt },
        { duration: 2.5, ease: 'power2.inOut' }
      ).then(() => {
        cameraController.startOrbit({
          distance: 20 * CONFIG.rs,
          height: 1 * CONFIG.rs,
          speed: 1,
        });
      });
    }, 200);
  }, [ehtBlurController, cameraController]);

  const handleStart = useCallback(() => {
    track('simulation_start_click');
    handleReveal();
  }, [handleReveal]);

  const handleEhtBlurSet = useCallback((enabled: boolean) => {
    if (!ehtBlurController) return;
    setEhtBlurEnabled(enabled);
    ehtBlurController.setEnabled(enabled);
    sendContextualUpdate(`User ${enabled ? 'enabled' : 'disabled'} EHT blur effect`);
  }, [ehtBlurController, sendContextualUpdate]);

  const handleOverlayToggle = useCallback((toggles: Partial<OverlayState>) => {
    setOverlayState(prev => ({ ...prev, ...toggles }));
    const changes = Object.entries(toggles)
      .map(([key, val]) => `${key}: ${val ? 'on' : 'off'}`)
      .join(', ');
    sendContextualUpdate(`User toggled overlays: ${changes}`);
  }, [sendContextualUpdate]);

  const handlePresetSelect = useCallback((presetName: string) => {
    if (!cameraController) return;

    // Cancel any running sequence first
    cameraController.cancelSequence();

    // Exit EHT mode when selecting other presets
    if (ehtMode && presetName !== 'eht') {
      setEhtMode(false);
      setEhtBlurEnabled(false);
      ehtBlurController?.setEnabled(false);
    }

    setActivePreset(presetName);
    sendContextualUpdate(`User changed camera to ${presetName} view`);

    // Check if it's a sequence first
    const sequence = CAMERA_SEQUENCES[presetName];
    if (sequence) {
      cameraController.runSequence(sequence);
      return;
    }

    // Otherwise use existing preset logic
    const preset = CAMERA_PRESETS[presetName];
    if (!preset) return;

    // Calculate orbit parameters from preset position
    const pos = preset.position;
    const distance = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    const height = pos.y;

    // Use moveTo for smooth transition to exact preset position, then start orbit
    cameraController.moveTo(
      { position: preset.position, lookAt: preset.lookAt },
      { duration: preset.duration, ease: preset.ease }
    ).then(() => {
      cameraController.startOrbit({
        distance,
        height,
        speed: 1,
        lookAt: preset.lookAt,
      });
    });
  }, [cameraController, ehtMode, ehtBlurController, sendContextualUpdate]);

  return (
    <>
      <BlackHoleSimulation
        showDevControls={false}
        showStats={false}
        initialEhtBlurEnabled={false}
        overlayState={overlayState}
        onCameraReady={handleCameraReady}
        onEhtBlurReady={handleEhtBlurReady}
      />

      {/* Intro Overlay */}
      <div className={`intro-overlay ${introComplete ? 'hidden' : ''}`}>
        <div className="intro-card">
          <button
            onClick={handleStart}
            className="start-btn"
            disabled={!ehtBlurController}
          >
            Start
          </button>
        </div>
      </div>

      {cameraController && (
        <CameraPresetBar
          onPresetSelect={handlePresetSelect}
          activePreset={activePreset}
          ehtMode={ehtMode}
          ehtBlurEnabled={ehtBlurEnabled}
          onEhtToggle={handleEhtToggle}
          onEhtBlurToggle={handleEhtBlurToggle}
          show={introComplete}
          isManualMode={isManualMode}
          onManualModeToggle={handleManualModeToggle}
        />
      )}

      <OverlayControlBar
        overlayState={overlayState}
        onToggle={handleOverlayToggle}
        show={introComplete}
      />

      <InfoPanel
        cameraDistance={cameraDistance}
        show={introComplete}
      />

      <UserMenu show={introComplete} />

      {introComplete && isAuthenticated && (
        <VoiceAgentPopup
          onPresetSelect={handlePresetSelect}
          onEhtBlurToggle={handleEhtBlurSet}
          onOverlayToggle={handleOverlayToggle}
          onContextualUpdateReady={handleContextualUpdateReady}
        />
      )}

      {introComplete && !isAuthenticated && (
        <VoiceLoginPrompt />
      )}

      <style jsx>{`
        .intro-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
          opacity: 1;
          transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .intro-overlay.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .intro-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 48px;
          background: rgba(10, 10, 10, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 140, 66, 0.2);
          border-radius: 20px;
          box-shadow:
            0 4px 60px rgba(0, 0, 0, 0.6),
            0 0 80px rgba(255, 140, 66, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .start-btn {
          padding: 16px 48px;
          background: rgba(255, 140, 66, 0.15);
          border: 1px solid rgba(255, 140, 66, 0.4);
          border-radius: 12px;
          color: #ff8c42;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 180px;
        }

        .start-btn:hover:not(:disabled) {
          background: rgba(255, 140, 66, 0.25);
          border-color: rgba(255, 140, 66, 0.6);
          box-shadow: 0 0 30px rgba(255, 140, 66, 0.2);
        }

        .start-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .start-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        @media (max-width: 600px) {
          .intro-card {
            padding: 32px 24px;
          }

          .start-btn {
            min-width: auto;
            padding: 14px 32px;
          }
        }
      `}</style>
    </>
  );
}
