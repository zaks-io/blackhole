'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { track } from '@vercel/analytics';
import BlackHoleSimulation, {
  CAMERA_PRESETS,
  CAMERA_SEQUENCES,
  EhtBlurController,
} from './BlackHoleSimulation';
import { ControlDock } from './ControlDock';
import { HelpModal } from './HelpModal';
import { InfoPanel } from './InfoPanel';
import { OverlayLabels } from './OverlayLabels';
import { TargetIndicator } from './TargetIndicator';
import { UserMenu } from './UserMenu';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';
import { ToggleState, DEFAULT_TOGGLE_STATE } from '@/lib/types';

/**
 * Wrapper component that contains both the simulation and camera controls.
 * This is dynamically imported so everything is in the same module scope.
 */
export default function AppView({ initialView }: { initialView?: keyof typeof CAMERA_PRESETS }) {
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(initialView ?? 'default');
  const [ehtBlurController, setEhtBlurController] = useState<EhtBlurController | null>(null);
  const [ehtMode, setEhtMode] = useState(false);
  const [ehtBlurEnabled, setEhtBlurEnabled] = useState(true);
  const [introComplete, setIntroComplete] = useState(!!initialView);
  const directViewStartedRef = useRef(false);
  const [toggleState, setToggleState] = useState<ToggleState>(DEFAULT_TOGGLE_STATE);
  const [cameraDistance, setCameraDistance] = useState(20);
  const [isFlyMode, setIsFlyMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

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
      setIsFlyMode(cameraController.getMode() === 'fly');
      animationFrameRef.current = requestAnimationFrame(updateState);
    };

    animationFrameRef.current = requestAnimationFrame(updateState);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraController]);

  // Direct-view deep link: snap to the preset and start orbiting immediately,
  // skipping the intro overlay and the default reveal fly-in.
  useEffect(() => {
    if (!initialView || !cameraController || directViewStartedRef.current) return;
    directViewStartedRef.current = true;

    const preset = CAMERA_PRESETS[initialView];
    const distance = Math.sqrt(preset.position.x ** 2 + preset.position.z ** 2);
    cameraController.startOrbit({
      distance,
      height: preset.position.y,
      speed: 1,
      lookAt: preset.lookAt,
    });
  }, [initialView, cameraController]);

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

      const defaultPreset = CAMERA_PRESETS.default;
      cameraController
        .moveTo(
          { position: defaultPreset.position, lookAt: defaultPreset.lookAt },
          { duration: 2, ease: 'power2.inOut' }
        )
        .then(() => {
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
      cameraController
        .moveTo(
          { position: ehtPreset.position, lookAt: ehtPreset.lookAt },
          { duration: ehtPreset.duration, ease: ehtPreset.ease }
        )
        .then(() => {
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

  const handleFlyModeToggle = useCallback(() => {
    if (!cameraController) return;

    if (isFlyMode) {
      // Exit fly mode - return to default orbit
      setActivePreset('default');

      const defaultPreset = CAMERA_PRESETS.default;
      cameraController
        .moveTo(
          { position: defaultPreset.position, lookAt: defaultPreset.lookAt },
          { duration: 1.5, ease: 'power2.inOut' }
        )
        .then(() => {
          cameraController.startOrbit({
            distance: 20 * CONFIG.rs,
            height: 1 * CONFIG.rs,
            speed: 1,
          });
        });
    } else {
      // Enter fly mode from the current camera pose
      cameraController.startFly();
      setActivePreset(null);

      // Exit EHT mode if active
      if (ehtMode) {
        setEhtMode(false);
        setEhtBlurEnabled(false);
        ehtBlurController?.setEnabled(false);
      }
    }
  }, [cameraController, isFlyMode, ehtMode, ehtBlurController]);

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
      cameraController
        .moveTo(
          { position: defaultPreset.position, lookAt: defaultPreset.lookAt },
          { duration: 2.5, ease: 'power2.inOut' }
        )
        .then(() => {
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

  const handleToggleChange = useCallback((toggles: Partial<ToggleState>) => {
    setToggleState((prev) => {
      const next = { ...prev, ...toggles };
      // Wormhole and binary are mutually exclusive scene modes
      if (toggles.wormhole) next.binary = false;
      if (toggles.binary) next.wormhole = false;
      return next;
    });
  }, []);

  const handlePresetSelect = useCallback(
    (presetName: string) => {
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
      cameraController
        .moveTo(
          { position: preset.position, lookAt: preset.lookAt },
          { duration: preset.duration, ease: preset.ease }
        )
        .then(() => {
          cameraController.startOrbit({
            distance,
            height,
            speed: 1,
            lookAt: preset.lookAt,
          });
        });
    },
    [cameraController, ehtMode, ehtBlurController]
  );

  return (
    <>
      <BlackHoleSimulation
        showDevControls={false}
        showStats={false}
        initialCameraPreset={initialView ?? 'far'}
        initialEhtBlurEnabled={false}
        toggleState={toggleState}
        onCameraReady={handleCameraReady}
        onEhtBlurReady={handleEhtBlurReady}
      />

      {/* Intro Overlay */}
      <div className={`intro-overlay ${introComplete ? 'hidden' : ''}`}>
        <div className="intro-content">
          <h1 className="intro-title">Schwarzschild Black Hole</h1>
          <p className="intro-subtitle">Interactive gravitational lensing simulation</p>
          <button onClick={handleStart} className="intro-btn" disabled={!ehtBlurController}>
            {ehtBlurController ? 'Enter' : 'Loading\u2026'}
          </button>
        </div>
      </div>

      <ControlDock
        toggleState={toggleState}
        onToggle={handleToggleChange}
        onPresetSelect={handlePresetSelect}
        activePreset={activePreset}
        ehtMode={ehtMode}
        ehtBlurEnabled={ehtBlurEnabled}
        onEhtToggle={handleEhtToggle}
        onEhtBlurToggle={handleEhtBlurToggle}
        isFlyMode={isFlyMode}
        onFlyModeToggle={handleFlyModeToggle}
        onHelpOpen={() => setHelpOpen(true)}
        show={introComplete}
      />

      <OverlayLabels
        cameraController={cameraController}
        toggleState={toggleState}
        show={introComplete}
      />

      <TargetIndicator
        cameraController={cameraController}
        show={introComplete && isFlyMode}
        label={
          toggleState.wormhole ? 'Wormhole' : toggleState.binary ? 'Black Holes' : 'Black Hole'
        }
        color={toggleState.wormhole ? '#66ccff' : toggleState.binary ? '#ff66cc' : '#ff8c42'}
      />

      <InfoPanel cameraDistance={cameraDistance} show={introComplete} />

      <UserMenu show={introComplete} />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* TODO: Voice agent UI temporarily removed — will be re-integrated */}

      <style jsx>{`
        .intro-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          opacity: 1;
          transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .intro-overlay.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .intro-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          text-align: center;
          padding: 0 24px;
        }

        .intro-title {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: clamp(18px, 3vw, 28px);
          font-weight: 300;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.9);
          margin: 0 0 12px;
        }

        .intro-subtitle {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: clamp(11px, 1.5vw, 14px);
          font-weight: 400;
          letter-spacing: 0.15em;
          color: rgba(255, 255, 255, 0.4);
          margin: 0 0 40px;
        }

        .intro-btn {
          padding: 14px 48px;
          background: transparent;
          border: 1px solid rgba(255, 140, 66, 0.35);
          border-radius: 4px;
          color: #ff8c42;
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .intro-btn:hover:not(:disabled) {
          background: rgba(255, 140, 66, 0.1);
          border-color: rgba(255, 140, 66, 0.6);
          box-shadow: 0 0 30px rgba(255, 140, 66, 0.15);
        }

        .intro-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .intro-btn:disabled {
          color: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.1);
          cursor: default;
        }
      `}</style>
    </>
  );
}
