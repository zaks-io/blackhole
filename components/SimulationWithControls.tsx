'use client';

import { useState, useCallback } from 'react';
import BlackHoleSimulation, { CAMERA_PRESETS, EhtBlurController } from './BlackHoleSimulation';
import { CameraPresetBar } from './CameraPresetBar';
import { VoiceAgentPopup } from './VoiceAgentPopup';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';

/**
 * Wrapper component that contains both the simulation and camera controls.
 * This is dynamically imported so everything is in the same module scope.
 */
export default function SimulationWithControls() {
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [activePreset, setActivePreset] = useState<string>('orbit');
  const [ehtBlurController, setEhtBlurController] = useState<EhtBlurController | null>(null);
  const [ehtMode, setEhtMode] = useState(false);
  const [ehtBlurEnabled, setEhtBlurEnabled] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [showVoiceAgent, setShowVoiceAgent] = useState(false);

  const handleCameraReady = useCallback((controller: CameraController) => {
    setCameraController(controller);
  }, []);

  const handleEhtBlurReady = useCallback((controller: EhtBlurController) => {
    setEhtBlurController(controller);
  }, []);

  const handleEhtToggle = useCallback(() => {
    if (!cameraController || !ehtBlurController) return;

    if (ehtMode) {
      // Exit EHT mode - go back to orbit
      setEhtMode(false);
      setEhtBlurEnabled(false);
      ehtBlurController.setEnabled(false);
      setActivePreset('orbit');

      const orbitPreset = CAMERA_PRESETS.orbit;
      cameraController.moveTo(
        { position: orbitPreset.position, lookAt: orbitPreset.lookAt },
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

      const ehtPreset = CAMERA_PRESETS.eht;
      cameraController.moveTo(
        { position: ehtPreset.position, lookAt: ehtPreset.lookAt },
        { duration: ehtPreset.duration, ease: ehtPreset.ease }
      ).then(() => {
        setEhtBlurEnabled(true);
        ehtBlurController.setEnabled(true);
      });
    }
  }, [cameraController, ehtBlurController, ehtMode]);

  const handleEhtBlurToggle = useCallback(() => {
    if (!ehtBlurController) return;
    const newState = !ehtBlurEnabled;
    setEhtBlurEnabled(newState);
    ehtBlurController.setEnabled(newState);
  }, [ehtBlurController, ehtBlurEnabled]);

  const handleStart = useCallback(() => {
    if (!ehtBlurController || !cameraController) return;
    ehtBlurController.setEnabled(false);
    setEhtMode(false);
    setEhtBlurEnabled(false);
    setIntroComplete(true);

    // Move camera from far intro position to orbit position
    const orbitPreset = CAMERA_PRESETS.orbit;
    cameraController.moveTo(
      { position: orbitPreset.position, lookAt: orbitPreset.lookAt },
      { duration: 2.5, ease: 'power2.inOut' }
    ).then(() => {
      cameraController.startOrbit({
        distance: 20 * CONFIG.rs,
        height: 1 * CONFIG.rs,
        speed: 1,
      });
    });
  }, [ehtBlurController, cameraController]);

  const handleEhtBlurSet = useCallback((enabled: boolean) => {
    if (!ehtBlurController) return;
    setEhtBlurEnabled(enabled);
    ehtBlurController.setEnabled(enabled);
  }, [ehtBlurController]);

  const handlePresetSelect = useCallback((presetName: string) => {
    const preset = CAMERA_PRESETS[presetName];
    if (!preset || !cameraController) return;

    // Exit EHT mode when selecting other presets
    if (ehtMode && presetName !== 'eht') {
      setEhtMode(false);
      setEhtBlurEnabled(false);
      ehtBlurController?.setEnabled(false);
    }

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
  }, [cameraController, ehtMode, ehtBlurController]);

  return (
    <>
      <BlackHoleSimulation
        showDevControls={false}
        showStats={false}
        initialEhtBlurEnabled={false}
        onCameraReady={handleCameraReady}
        onEhtBlurReady={handleEhtBlurReady}
      />

      {/* Intro Overlay */}
      <div className={`intro-overlay ${introComplete ? 'hidden' : ''}`}>
        <button onClick={handleStart} className="start-btn" disabled={!ehtBlurController}>
          <span className="start-icon">◉</span>
          <span className="start-label">START</span>
        </button>
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
        />
      )}

      {introComplete && (
        <button
          className="voice-toggle"
          onClick={() => setShowVoiceAgent(!showVoiceAgent)}
          title="Voice Agent"
        >
          <span className="voice-icon">{showVoiceAgent ? '×' : '🎙'}</span>
        </button>
      )}

      {showVoiceAgent && (
        <VoiceAgentPopup
          onClose={() => setShowVoiceAgent(false)}
          onPresetSelect={handlePresetSelect}
          onEhtBlurToggle={handleEhtBlurSet}
        />
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
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 15vh;
          background-image: radial-gradient(
            ellipse at center,
            rgba(255, 74, 30, 0.18) 0%,
            rgba(0, 0, 0, 0.3) 50%
          );
          background-blend-mode: overlay;
          opacity: 1;
          transition: opacity 1s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .intro-overlay.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .start-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 24px 48px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 165, 0, 0.3);
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 60px rgba(255, 165, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .start-btn:hover:not(:disabled) {
          background: rgba(255, 165, 0, 0.15);
          border-color: rgba(255, 165, 0, 0.5);
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(255, 165, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .start-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .start-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .start-icon {
          font-size: 48px;
          color: #ffa500;
          line-height: 1;
          transition: transform 0.2s ease;
          text-shadow: 0 0 20px rgba(255, 165, 0, 0.5);
        }

        .start-btn:hover:not(:disabled) .start-icon {
          transform: scale(1.1);
        }

        .start-label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
          transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .start-btn:hover:not(:disabled) .start-label {
          color: rgba(255, 255, 255, 0.9);
        }

        .voice-toggle {
          position: fixed;
          bottom: 32px;
          right: 32px;
          width: 48px;
          height: 48px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.15);
          border-radius: 50%;
          color: rgba(255, 255, 255, 0.7);
          font-size: 20px;
          cursor: pointer;
          z-index: 100;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(255, 140, 66, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .voice-toggle:hover {
          background: rgba(255, 140, 66, 0.15);
          border-color: rgba(255, 140, 66, 0.3);
          color: #ff8c42;
        }

        .voice-toggle:active {
          transform: scale(0.95);
        }

        .voice-icon {
          line-height: 1;
        }

        @media (max-width: 600px) {
          .voice-toggle {
            right: 16px;
            bottom: 24px;
            width: 44px;
            height: 44px;
            font-size: 18px;
          }
        }
      `}</style>
    </>
  );
}
