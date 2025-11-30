'use client';

import { useState } from 'react';
import { CAMERA_PRESETS, CAMERA_SEQUENCES } from './BlackHoleSimulation';

interface CameraPresetBarProps {
  onPresetSelect: (presetName: string) => void;
  activePreset: string | null;
  ehtMode?: boolean;
  ehtBlurEnabled?: boolean;
  onEhtToggle?: () => void;
  onEhtBlurToggle?: () => void;
  show?: boolean;
  isManualMode?: boolean;
  onManualModeToggle?: () => void;
}

const PRESET_ICONS: Record<string, string> = {
  far: '⊕',
  default: '⟳',
  accretionDisk: '◎',
  topDown: '⬡',
  edgeOn: '━',
  photonSphere: '◐',
  // Sequences
  fallIn: '↓',
  warpingTour: '◎',
  shadowExplore: '●',
  // Manual
  manual: '✋',
};

const PRESET_LABELS: Record<string, string> = {
  far: 'Far',
  default: 'Default',
  accretionDisk: 'Disk',
  topDown: 'Above',
  edgeOn: 'Edge',
  photonSphere: 'Ring',
  // Sequences
  fallIn: 'Fall',
  warpingTour: 'Tour',
  shadowExplore: 'Shadow',
  // Manual
  manual: 'Manual',
};

export function CameraPresetBar({
  onPresetSelect,
  activePreset,
  ehtMode,
  ehtBlurEnabled,
  onEhtToggle,
  onEhtBlurToggle,
  show = true,
  isManualMode,
  onManualModeToggle,
}: CameraPresetBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const presetKeys = Object.keys(CAMERA_PRESETS).filter((key) => key !== 'eht');
  const sequenceKeys = Object.keys(CAMERA_SEQUENCES);

  return (
    <div className={`preset-bar-container ${show ? '' : 'hidden'}`}>
      <div className={`preset-bar ${isOpen ? 'expanded' : ''}`}>
        {presetKeys.map((key) => (
          <button
            key={key}
            className={`preset-btn ${key === 'default' ? 'default-btn' : ''} ${activePreset === key ? 'active' : ''}`}
            onClick={() => onPresetSelect(key)}
            title={CAMERA_PRESETS[key].name}
          >
            <span className="preset-icon">{PRESET_ICONS[key]}</span>
            <span className="preset-label">{PRESET_LABELS[key]}</span>
          </button>
        ))}
        {sequenceKeys.length > 0 && <div className="separator" />}
        {sequenceKeys.map((key) => (
          <button
            key={key}
            className={`preset-btn sequence-btn ${activePreset === key ? 'active' : ''}`}
            onClick={() => onPresetSelect(key)}
            title={CAMERA_SEQUENCES[key].name}
          >
            <span className="preset-icon">{PRESET_ICONS[key]}</span>
            <span className="preset-label">{PRESET_LABELS[key]}</span>
          </button>
        ))}
        {onManualModeToggle && (
          <>
            <div className="separator" />
            <button
              className={`preset-btn manual-btn ${isManualMode ? 'active' : ''}`}
              onClick={onManualModeToggle}
              title="Manual Control - Drag to rotate camera"
            >
              <span className="preset-icon">{PRESET_ICONS.manual}</span>
              <span className="preset-label">{PRESET_LABELS.manual}</span>
            </button>
          </>
        )}
        {onEhtToggle && (
          <>
            <div className="separator" />
            <button
              className={`preset-btn eht-btn ${ehtMode ? 'active' : ''}`}
              onClick={onEhtToggle}
              title="EHT View"
            >
              <span className="preset-icon">◉</span>
              <span className="preset-label">EHT</span>
            </button>
            {ehtMode && onEhtBlurToggle && (
              <button
                className={`preset-btn blur-btn ${ehtBlurEnabled ? 'active' : ''}`}
                onClick={onEhtBlurToggle}
                title={ehtBlurEnabled ? 'Show Sharp View' : 'Show Blurred View'}
              >
                <span className="preset-icon">{ehtBlurEnabled ? '◐' : '◯'}</span>
                <span className="preset-label">{ehtBlurEnabled ? 'Blur' : 'Sharp'}</span>
              </button>
            )}
          </>
        )}
      </div>
      <button
        className={`collapse-header ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="chevron">▲</span>
        <span className="header-label">Camera</span>
      </button>

      <style jsx>{`
        .preset-bar-container {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%) translateY(0);
          z-index: 100;
          opacity: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition:
            transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .preset-bar-container.hidden {
          transform: translateX(-50%) translateY(100px);
          opacity: 0;
          pointer-events: none;
        }

        .collapse-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.15);
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(255, 140, 66, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .collapse-header:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 140, 66, 0.25);
        }

        .collapse-header.open {
          border-top-left-radius: 0;
          border-top-right-radius: 0;
          border-top-color: transparent;
        }

        .header-label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .chevron {
          font-size: 8px;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .collapse-header.open .chevron {
          transform: rotate(180deg);
        }

        .preset-bar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 12px;
          max-height: 0;
          overflow: hidden;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.15);
          border-bottom: none;
          border-radius: 16px 16px 0 0;
          box-shadow:
            0 -4px 30px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(255, 140, 66, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
        }

        .preset-bar.expanded {
          padding: 10px 16px;
          max-height: 200px;
          gap: 6px;
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 140, 66, 0.25);
          opacity: 1;
        }

        .preset-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 8px 14px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 56px;
        }

        .preset-btn:hover {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(255, 140, 66, 0.1);
          border-color: rgba(255, 140, 66, 0.2);
        }

        .preset-btn.active {
          color: #ff8c42;
          background: rgba(255, 140, 66, 0.15);
          border-color: rgba(255, 140, 66, 0.4);
          box-shadow:
            0 0 20px rgba(255, 140, 66, 0.15),
            inset 0 0 10px rgba(255, 140, 66, 0.1);
        }

        .preset-btn.default-btn.active {
          color: #ff5e00;
        }

        .preset-btn.default-btn.active .preset-icon {
          animation: rotate 4s linear infinite;
        }

        .separator {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.15);
          margin: 0 4px;
        }

        .preset-btn.eht-btn.active {
          color: #ffa500;
          background: rgba(255, 165, 0, 0.2);
          border-color: rgba(255, 165, 0, 0.5);
          box-shadow:
            0 0 20px rgba(255, 165, 0, 0.2),
            inset 0 0 10px rgba(255, 165, 0, 0.15);
        }

        .preset-btn.blur-btn {
          color: rgba(255, 255, 255, 0.6);
        }

        .preset-btn.blur-btn.active {
          color: #87ceeb;
          background: rgba(135, 206, 235, 0.15);
          border-color: rgba(135, 206, 235, 0.4);
          box-shadow:
            0 0 20px rgba(135, 206, 235, 0.15),
            inset 0 0 10px rgba(135, 206, 235, 0.1);
        }

        .preset-btn.sequence-btn.active {
          color: #a78bfa;
          background: rgba(167, 139, 250, 0.15);
          border-color: rgba(167, 139, 250, 0.4);
          box-shadow:
            0 0 20px rgba(167, 139, 250, 0.15),
            inset 0 0 10px rgba(167, 139, 250, 0.1);
        }

        .preset-btn.manual-btn.active {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.15);
          border-color: rgba(74, 222, 128, 0.4);
          box-shadow:
            0 0 20px rgba(74, 222, 128, 0.15),
            inset 0 0 10px rgba(74, 222, 128, 0.1);
        }

        .preset-icon {
          font-size: 18px;
          line-height: 1;
          transition: transform 0.2s ease;
        }

        .preset-btn:hover .preset-icon {
          transform: scale(1.1);
        }

        .preset-btn:active .preset-icon {
          transform: scale(0.95);
        }

        .preset-label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0;
          transform: translateY(-4px);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .preset-bar.expanded .preset-label {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        /* Responsive adjustments */
        @media (max-width: 600px) {
          .preset-bar.expanded {
            gap: 2px;
            padding: 6px 8px;
          }

          .preset-btn {
            padding: 6px 10px;
            min-width: 44px;
          }

          .preset-icon {
            font-size: 16px;
          }
        }
      `}</style>
    </div>
  );
}
