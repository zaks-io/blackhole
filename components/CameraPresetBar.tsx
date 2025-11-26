'use client';

import { useState } from 'react';
import { CAMERA_PRESETS } from './BlackHoleSimulation';

interface CameraPresetBarProps {
  onPresetSelect: (presetName: string) => void;
  activePreset: string | null;
}

const PRESET_ICONS: Record<string, string> = {
  orbit: '⟳',
  flybyClose: '◎',
  topDown: '⬡',
  edgeOn: '━',
};

const PRESET_LABELS: Record<string, string> = {
  orbit: 'Orbit',
  flybyClose: 'Close',
  topDown: 'Above',
  edgeOn: 'Edge',
};

export function CameraPresetBar({ onPresetSelect, activePreset }: CameraPresetBarProps) {
  const [isHovered, setIsHovered] = useState(false);

  const presetKeys = Object.keys(CAMERA_PRESETS);

  return (
    <div
      className="preset-bar-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`preset-bar ${isHovered ? 'expanded' : ''}`}>
        {presetKeys.map((key) => (
          <button
            key={key}
            className={`preset-btn ${key === 'orbit' ? 'orbit-btn' : ''} ${activePreset === key ? 'active' : ''}`}
            onClick={() => onPresetSelect(key)}
            title={CAMERA_PRESETS[key].name}
          >
            <span className="preset-icon">{PRESET_ICONS[key]}</span>
            <span className="preset-label">{PRESET_LABELS[key]}</span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .preset-bar-container {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
        }

        .preset-bar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 12px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 140, 66, 0.15);
          border-radius: 16px;
          box-shadow: 
            0 4px 30px rgba(0, 0, 0, 0.5),
            0 0 40px rgba(255, 140, 66, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .preset-bar.expanded {
          padding: 10px 16px;
          gap: 6px;
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 140, 66, 0.25);
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

        .preset-btn.orbit-btn.active {
          color: #ff5e00;
        }

        .preset-btn.orbit-btn.active .preset-icon {
          animation: rotate 4s linear infinite;
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
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Responsive adjustments */
        @media (max-width: 600px) {
          .preset-bar {
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

