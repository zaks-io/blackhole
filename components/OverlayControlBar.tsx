'use client';

import { useState } from 'react';
import { OverlayState } from '@/lib/types';

interface OverlayControlBarProps {
  overlayState: OverlayState;
  onToggle: (toggles: Partial<OverlayState>) => void;
  show?: boolean;
}

const OVERLAY_CONFIG: { key: keyof OverlayState; icon: string; label: string; color: string }[] = [
  { key: 'isco', icon: '◎', label: 'ISCO', color: '#00d9d9' },
  { key: 'photonSphere', icon: '◐', label: 'Photon', color: '#ffd900' },
  { key: 'eventHorizon', icon: '●', label: 'Horizon', color: '#ff2626' },
  { key: 'shadowEdge', icon: '◯', label: 'Shadow', color: '#cc4de6' },
  { key: 'doppler', icon: '↔', label: 'Doppler', color: '#6699ff' },
  { key: 'scale', icon: '⊕', label: 'Scale', color: '#b3b3bf' },
];

export function OverlayControlBar({ overlayState, onToggle, show = true }: OverlayControlBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`overlay-bar-container ${show ? '' : 'hidden'}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className={`overlay-bar ${isExpanded ? 'expanded' : ''}`}>
        <span className="bar-label">Overlays</span>
        <div className="separator" />
        {OVERLAY_CONFIG.map(({ key, icon, label, color }) => {
          const isActive = overlayState[key];
          return (
            <button
              key={key}
              className={`overlay-btn ${isActive ? 'active' : ''}`}
              onClick={() => onToggle({ [key]: !isActive })}
              title={label}
              style={{ '--accent-color': color } as React.CSSProperties}
            >
              <span className="overlay-icon">{icon}</span>
              <span className="overlay-label">{label}</span>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .overlay-bar-container {
          position: fixed;
          top: 32px;
          left: 50%;
          transform: translateX(-50%) translateY(0);
          z-index: 100;
          opacity: 1;
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .overlay-bar-container.hidden {
          transform: translateX(-50%) translateY(-100px);
          opacity: 0;
          pointer-events: none;
        }

        .overlay-bar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .overlay-bar.expanded {
          padding: 8px 14px;
          gap: 6px;
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .bar-label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.4);
          padding: 0 6px;
        }

        .separator {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 2px;
        }

        .overlay-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 6px 10px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 48px;
        }

        .overlay-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .overlay-btn.active {
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 15%, transparent);
          border-color: color-mix(in srgb, var(--accent-color) 40%, transparent);
          box-shadow:
            0 0 15px color-mix(in srgb, var(--accent-color) 20%, transparent),
            inset 0 0 8px color-mix(in srgb, var(--accent-color) 10%, transparent);
        }

        .overlay-icon {
          font-size: 16px;
          line-height: 1;
          transition: transform 0.2s ease;
        }

        .overlay-btn:hover .overlay-icon {
          transform: scale(1.1);
        }

        .overlay-btn:active .overlay-icon {
          transform: scale(0.95);
        }

        .overlay-label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0;
          transform: translateY(-4px);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .overlay-bar.expanded .overlay-label {
          opacity: 1;
          transform: translateY(0);
        }

        @media (max-width: 600px) {
          .overlay-bar {
            gap: 2px;
            padding: 4px 6px;
          }

          .overlay-btn {
            padding: 4px 6px;
            min-width: 36px;
          }

          .overlay-icon {
            font-size: 14px;
          }

          .bar-label {
            display: none;
          }

          .separator {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
