'use client';

import { useState } from 'react';
import { ToggleState } from '@/lib/types';

interface ToggleControlBarProps {
  toggleState: ToggleState;
  onToggle: (toggles: Partial<ToggleState>) => void;
  show?: boolean;
}

const TOGGLE_CONFIG: {
  key: keyof ToggleState;
  icon: string;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    key: 'disk',
    icon: '◉',
    label: 'Disk',
    description: 'Accretion Disk - hot matter orbiting the black hole',
    color: '#ff8c00',
  },
  {
    key: 'jets',
    icon: '↕',
    label: 'Jets',
    description: 'Relativistic Jets - plasma ejected at near light speed',
    color: '#00ccff',
  },
  {
    key: 'isco',
    icon: '◎',
    label: 'ISCO',
    description: 'Innermost Stable Circular Orbit (3 rs) - closest stable orbit for matter',
    color: '#00d9d9',
  },
  {
    key: 'eventHorizon',
    icon: '●',
    label: 'Horizon',
    description: 'Event Horizon (1 rs) - point of no return',
    color: '#ff2626',
  },
  {
    key: 'doppler',
    icon: '↔',
    label: 'Doppler',
    description: 'Doppler Shift - blue=approaching, red=receding',
    color: '#6699ff',
  },
  {
    key: 'scale',
    icon: '⊕',
    label: 'Scale',
    description: 'Scale Rings - reference circles at 5, 10, 15 rs',
    color: '#b3b3bf',
  },
];

export function ToggleControlBar({ toggleState, onToggle, show = true }: ToggleControlBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`toggle-bar-container ${show ? '' : 'hidden'}`}>
      <button
        className={`collapse-header ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="header-label">Toggles</span>
        <span className="chevron">▼</span>
      </button>
      <div className={`toggle-bar ${isOpen ? 'expanded' : ''}`}>
        {TOGGLE_CONFIG.map(({ key, icon, label, description, color }) => {
          const isActive = toggleState[key];
          return (
            <button
              key={key}
              className={`toggle-btn ${isActive ? 'active' : ''}`}
              onClick={() => onToggle({ [key]: !isActive })}
              title={description}
              style={{ '--accent-color': color } as React.CSSProperties}
            >
              <span className="toggle-icon">{icon}</span>
              <span className="toggle-label">{label}</span>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        .toggle-bar-container {
          position: fixed;
          top: 32px;
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

        .toggle-bar-container.hidden {
          transform: translateX(-50%) translateY(-100px);
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
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .collapse-header:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .collapse-header.open {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          border-bottom-color: transparent;
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

        .toggle-bar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 10px;
          max-height: 0;
          overflow: hidden;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-top: none;
          border-radius: 0 0 12px 12px;
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
        }

        .toggle-bar.expanded {
          padding: 8px 14px;
          max-height: 200px;
          gap: 6px;
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 255, 255, 0.15);
          opacity: 1;
        }

        .toggle-btn {
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

        .toggle-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .toggle-btn.active {
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 15%, transparent);
          border-color: color-mix(in srgb, var(--accent-color) 40%, transparent);
          box-shadow:
            0 0 15px color-mix(in srgb, var(--accent-color) 20%, transparent),
            inset 0 0 8px color-mix(in srgb, var(--accent-color) 10%, transparent);
        }

        .toggle-icon {
          font-size: 16px;
          line-height: 1;
          transition: transform 0.2s ease;
        }

        .toggle-btn:hover .toggle-icon {
          transform: scale(1.1);
        }

        .toggle-btn:active .toggle-icon {
          transform: scale(0.95);
        }

        .toggle-label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0;
          transform: translateY(-4px);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .toggle-bar.expanded .toggle-label {
          opacity: 1;
          transform: translateY(0);
        }

        @media (max-width: 600px) {
          .toggle-bar.expanded {
            gap: 2px;
            padding: 6px 8px;
          }

          .toggle-btn {
            padding: 4px 6px;
            min-width: 36px;
          }

          .toggle-icon {
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}
