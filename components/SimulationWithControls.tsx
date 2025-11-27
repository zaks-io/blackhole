'use client';

import { useState, useCallback, useRef } from 'react';
import { track } from '@vercel/analytics';
import BlackHoleSimulation, { CAMERA_PRESETS, EhtBlurController } from './BlackHoleSimulation';
import { CameraPresetBar } from './CameraPresetBar';
import { OverlayControlBar } from './OverlayControlBar';
import { VoiceAgentPopup } from './VoiceAgentPopup';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';
import { OverlayState, DEFAULT_OVERLAY_STATE } from '@/lib/types';

/**
 * Wrapper component that contains both the simulation and camera controls.
 * This is dynamically imported so everything is in the same module scope.
 */
export default function SimulationWithControls() {
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [activePreset, setActivePreset] = useState<string>('orbit');
  const [ehtBlurController, setEhtBlurController] = useState<EhtBlurController | null>(null);
  const [ehtMode, setEhtMode] = useState(false);
  const [ehtBlurEnabled, setEhtBlurEnabled] = useState(true);
  const [introComplete, setIntroComplete] = useState(false);
  const [introState, setIntroState] = useState<'idle' | 'connecting' | 'error'>('idle');
  const [introError, setIntroError] = useState<string | null>(null);
  const [showVoiceAgent, setShowVoiceAgent] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [overlayState, setOverlayState] = useState<OverlayState>(DEFAULT_OVERLAY_STATE);
  const sendContextualUpdateRef = useRef<((text: string) => void) | null>(null);

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
      sendContextualUpdate('User disabled EHT mode, returning to orbit view');

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

  const handleReveal = useCallback((withVoice: boolean) => {
    if (!ehtBlurController || !cameraController) return;

    setIntroComplete(true);
    setIntroState('idle');
    setIntroError(null);

    // Unblur
    ehtBlurController.setEnabled(false);
    setEhtMode(false);
    setEhtBlurEnabled(false);

    // Slight delay for choreography, then zoom camera
    setTimeout(() => {
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
    }, 200);

    // Show voice popup if voice was enabled
    if (withVoice) {
      setShowVoiceAgent(true);
    }
  }, [ehtBlurController, cameraController]);

  const handleVoiceConnect = useCallback(() => {
    track('begin_voice_tour_click');
    setVoiceConnecting(true);
    setIntroState('connecting');
    setIntroError(null);
  }, []);

  const handleVoiceConnected = useCallback(() => {
    setVoiceConnecting(false);
    handleReveal(true);
  }, [handleReveal]);

  const handleVoiceError = useCallback((error: string) => {
    setVoiceConnecting(false);
    setIntroState('error');
    setIntroError(error);
  }, []);

  const handleSkip = useCallback(() => {
    track('skip_voice_tour_click');
    handleReveal(false);
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
    const preset = CAMERA_PRESETS[presetName];
    if (!preset || !cameraController) return;

    // Exit EHT mode when selecting other presets
    if (ehtMode && presetName !== 'eht') {
      setEhtMode(false);
      setEhtBlurEnabled(false);
      ehtBlurController?.setEnabled(false);
    }

    setActivePreset(presetName);
    sendContextualUpdate(`User changed camera to ${presetName} view`);

    // Calculate orbit parameters from preset position
    const pos = preset.position;
    const distance = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    const height = pos.y;

    // Use transitionOrbit to smoothly change distance/height while preserving orbit angle
    cameraController.transitionOrbit(
      {
        distance,
        height,
        speed: 1,
        lookAt: preset.lookAt,
      },
      { duration: preset.duration, ease: preset.ease }
    );
  }, [cameraController, ehtMode, ehtBlurController, sendContextualUpdate]);

  return (
    <>
      <BlackHoleSimulation
        showDevControls={false}
        showStats={false}
        initialEhtBlurEnabled={true}
        overlayState={overlayState}
        onCameraReady={handleCameraReady}
        onEhtBlurReady={handleEhtBlurReady}
      />

      {/* Intro Overlay */}
      <div className={`intro-overlay ${introComplete ? 'hidden' : ''}`}>
        <div className="intro-card">
          <div className="headphone-icon">🎧</div>
          <p className="headphone-text">Best experienced with headphones</p>

          {introState === 'error' && introError && (
            <p className="error-text">{introError}</p>
          )}

          <button
            onClick={handleVoiceConnect}
            className="voice-tour-btn"
            disabled={!ehtBlurController || voiceConnecting}
          >
            {voiceConnecting ? 'Connecting...' : 'Begin Voice Tour'}
          </button>

          <button onClick={handleSkip} className="skip-btn" disabled={!ehtBlurController}>
            Skip and explore manually
          </button>
        </div>

        {/* Hidden VoiceAgentPopup for connection during intro */}
        {voiceConnecting && (
          <div className="voice-popup-hidden">
            <VoiceAgentPopup
              onClose={() => {
                setVoiceConnecting(false);
                setIntroState('idle');
              }}
              onPresetSelect={handlePresetSelect}
              onEhtBlurToggle={handleEhtBlurSet}
              onOverlayToggle={handleOverlayToggle}
              onContextualUpdateReady={handleContextualUpdateReady}
              onConnected={handleVoiceConnected}
              autoConnect
            />
          </div>
        )}
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

      <OverlayControlBar
        overlayState={overlayState}
        onToggle={handleOverlayToggle}
        show={introComplete}
      />

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
          onOverlayToggle={handleOverlayToggle}
          onContextualUpdateReady={handleContextualUpdateReady}
          autoConnect
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
          gap: 20px;
          padding: 40px 48px;
          background: rgba(10, 10, 10, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 140, 66, 0.2);
          border-radius: 20px;
          max-width: 400px;
          width: 90%;
          box-shadow:
            0 4px 60px rgba(0, 0, 0, 0.6),
            0 0 80px rgba(255, 140, 66, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .headphone-icon {
          font-size: 48px;
          line-height: 1;
        }

        .headphone-text {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          margin: 0;
        }

        .error-text {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          color: #ef4444;
          text-align: center;
          margin: 0;
        }

        .voice-tour-btn {
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
          min-width: 220px;
        }

        .voice-tour-btn:hover:not(:disabled) {
          background: rgba(255, 140, 66, 0.25);
          border-color: rgba(255, 140, 66, 0.6);
          box-shadow: 0 0 30px rgba(255, 140, 66, 0.2);
        }

        .voice-tour-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .voice-tour-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .skip-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          padding: 8px 16px;
          transition: color 0.2s ease;
        }

        .skip-btn:hover:not(:disabled) {
          color: rgba(255, 255, 255, 0.7);
        }

        .skip-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .voice-popup-hidden {
          position: fixed;
          top: -9999px;
          left: -9999px;
          opacity: 0;
          pointer-events: none;
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
          .intro-card {
            padding: 32px 24px;
          }

          .headphone-icon {
            font-size: 40px;
          }

          .voice-tour-btn {
            width: 100%;
            min-width: auto;
            padding: 14px 24px;
          }

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
