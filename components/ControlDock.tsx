'use client';

import { DiagnosticsMode, ToggleState } from '@/lib/types';
import { CAMERA_PRESETS, CAMERA_SEQUENCES } from './BlackHoleSimulation';
import {
  DiskIcon,
  HorizonIcon,
  BinaryIcon,
  AudioIcon,
  FarIcon,
  DefaultIcon,
  AccretionDiskIcon,
  TopDownIcon,
  EdgeOnIcon,
  PhotonSphereIcon,
  FallInIcon,
  TourIcon,
  ShadowIcon,
  ManualIcon,
  EhtIcon,
  BlurIcon,
  SharpIcon,
  HelpIcon,
  DiagnosticsIcon,
} from './icons';

interface ControlDockProps {
  toggleState: ToggleState;
  onToggle: (toggles: Partial<ToggleState>) => void;
  onPresetSelect: (presetName: string) => void;
  activePreset: string | null;
  ehtMode: boolean;
  ehtBlurEnabled: boolean;
  onEhtToggle: () => void;
  onEhtBlurToggle: () => void;
  isManualMode: boolean;
  onManualModeToggle: () => void;
  onHelpOpen: () => void;
  diagnosticsMode: DiagnosticsMode;
  onDiagnosticsModeChange: (mode: DiagnosticsMode) => void;
  show: boolean;
}

const TOGGLE_BUTTONS: {
  key: keyof ToggleState;
  icon: typeof DiskIcon;
  label: string;
  title: string;
  color: string;
}[] = [
  { key: 'disk', icon: DiskIcon, label: 'Disk', title: 'Accretion Disk', color: '#ff8c00' },
  {
    key: 'eventHorizon',
    icon: HorizonIcon,
    label: 'Horizon',
    title: 'Event Horizon',
    color: '#ff2626',
  },
  {
    key: 'binary',
    icon: BinaryIcon,
    label: 'Binary',
    title: 'Illustrative Binary (Approximate)',
    color: '#ff66cc',
  },
  { key: 'audio', icon: AudioIcon, label: 'Audio', title: 'Binary Audio', color: '#9966ff' },
];

const PRESET_BUTTONS: {
  key: string;
  icon: typeof DiskIcon;
  label: string;
}[] = [
  { key: 'far', icon: FarIcon, label: 'Far' },
  { key: 'default', icon: DefaultIcon, label: 'Orbit' },
  { key: 'accretionDisk', icon: AccretionDiskIcon, label: 'Disk' },
  { key: 'topDown', icon: TopDownIcon, label: 'Above' },
  { key: 'edgeOn', icon: EdgeOnIcon, label: 'Edge' },
  { key: 'photonSphere', icon: PhotonSphereIcon, label: 'Ring' },
];

const SEQUENCE_BUTTONS: {
  key: string;
  icon: typeof DiskIcon;
  label: string;
}[] = [
  { key: 'fallIn', icon: FallInIcon, label: 'Fall' },
  { key: 'warpingTour', icon: TourIcon, label: 'Tour' },
  { key: 'shadowExplore', icon: ShadowIcon, label: 'Shadow' },
];

export function ControlDock({
  toggleState,
  onToggle,
  onPresetSelect,
  activePreset,
  ehtMode,
  ehtBlurEnabled,
  onEhtToggle,
  onEhtBlurToggle,
  isManualMode,
  onManualModeToggle,
  onHelpOpen,
  diagnosticsMode,
  onDiagnosticsModeChange,
  show,
}: ControlDockProps) {
  return (
    <div className={`dock ${show ? '' : 'hidden'}`}>
      <div className="dock-bar">
        {/* Simulation Toggles */}
        <div className="group">
          {TOGGLE_BUTTONS.map(({ key, icon: Icon, label, title, color }) => {
            const isActive = toggleState[key];
            return (
              <button
                key={key}
                className={`dock-btn toggle-btn ${isActive ? 'active' : ''}`}
                onClick={() => onToggle({ [key]: !isActive })}
                title={title}
                style={{ '--accent-color': color } as React.CSSProperties}
              >
                <Icon size={20} />
                <span className="label">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="divider" />

        {/* Camera Presets */}
        <div className="group">
          {PRESET_BUTTONS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              className={`dock-btn preset-btn ${activePreset === key ? 'active' : ''}`}
              onClick={() => onPresetSelect(key)}
              title={CAMERA_PRESETS[key]?.name ?? key}
            >
              <Icon size={20} />
              <span className="label">{label}</span>
            </button>
          ))}
        </div>

        <div className="divider" />

        {/* Sequences */}
        <div className="group">
          {SEQUENCE_BUTTONS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              className={`dock-btn sequence-btn ${activePreset === key ? 'active' : ''}`}
              onClick={() => onPresetSelect(key)}
              title={CAMERA_SEQUENCES[key]?.name ?? key}
            >
              <Icon size={20} />
              <span className="label">{label}</span>
            </button>
          ))}
        </div>

        <div className="divider" />

        {/* Modes */}
        <div className="group">
          <button
            className={`dock-btn manual-btn ${isManualMode ? 'active' : ''}`}
            onClick={onManualModeToggle}
            title="Manual Camera Control"
          >
            <ManualIcon size={20} />
            <span className="label">Manual</span>
          </button>
          <button
            className={`dock-btn eht-btn ${ehtMode ? 'active' : ''}`}
            onClick={onEhtToggle}
            title="EHT View"
          >
            <EhtIcon size={20} />
            <span className="label">EHT</span>
          </button>
          {ehtMode && (
            <button
              className={`dock-btn blur-btn ${ehtBlurEnabled ? 'active' : ''}`}
              onClick={onEhtBlurToggle}
              title={ehtBlurEnabled ? 'Show Sharp View' : 'Show Blurred View'}
            >
              {ehtBlurEnabled ? <BlurIcon size={20} /> : <SharpIcon size={20} />}
              <span className="label">{ehtBlurEnabled ? 'Blur' : 'Sharp'}</span>
            </button>
          )}
        </div>

        <div className="divider" />

        <div className="group">
          <button
            className={`dock-btn diagnostics-btn ${diagnosticsMode !== 'off' ? 'active' : ''}`}
            onClick={() =>
              onDiagnosticsModeChange(
                diagnosticsMode === 'off'
                  ? 'anatomy'
                  : diagnosticsMode === 'anatomy'
                    ? 'lensing'
                    : 'off'
              )
            }
            title="Cycle labeled anatomy, full-screen light paths, and off"
            data-testid="diagnostics-toggle"
          >
            <DiagnosticsIcon size={20} />
            <span className="label">
              {diagnosticsMode === 'off'
                ? 'Guide'
                : diagnosticsMode === 'anatomy'
                  ? 'Anatomy'
                  : 'Rays'}
            </span>
          </button>
          <button className="dock-btn help-btn" onClick={onHelpOpen} title="Help">
            <HelpIcon size={20} />
            <span className="label">Help</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .dock {
          position: fixed;
          bottom: 28px;
          left: 50%;
          transform: translateX(-50%) translateY(0);
          z-index: 100;
          opacity: 1;
          transition:
            transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .dock.hidden {
          transform: translateX(-50%) translateY(40px);
          opacity: 0;
          pointer-events: none;
        }

        .dock-bar {
          display: flex;
          align-items: center;
          gap: 0;
          padding: 8px 12px;
          background: rgba(10, 10, 10, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow:
            0 4px 40px rgba(0, 0, 0, 0.6),
            0 0 60px rgba(255, 140, 66, 0.04),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        .group {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .divider {
          width: 1px;
          height: 28px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 8px;
          flex-shrink: 0;
        }

        .dock-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 6px 10px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 44px;
        }

        .dock-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.06);
        }

        .dock-btn:active {
          transform: scale(0.95);
        }

        /* Toggle buttons — per-color glow */
        .toggle-btn.active {
          color: var(--accent-color);
          background: color-mix(in srgb, var(--accent-color) 12%, transparent);
          border-color: color-mix(in srgb, var(--accent-color) 30%, transparent);
          box-shadow: 0 0 12px color-mix(in srgb, var(--accent-color) 18%, transparent);
        }

        /* Camera preset buttons — orange */
        .preset-btn.active {
          color: #ff8c42;
          background: rgba(255, 140, 66, 0.12);
          border-color: rgba(255, 140, 66, 0.3);
          box-shadow: 0 0 12px rgba(255, 140, 66, 0.15);
        }

        /* Sequence buttons — purple */
        .sequence-btn.active {
          color: #a78bfa;
          background: rgba(167, 139, 250, 0.12);
          border-color: rgba(167, 139, 250, 0.3);
          box-shadow: 0 0 12px rgba(167, 139, 250, 0.15);
        }

        /* Manual — green */
        .manual-btn.active {
          color: #4ade80;
          background: rgba(74, 222, 128, 0.12);
          border-color: rgba(74, 222, 128, 0.3);
          box-shadow: 0 0 12px rgba(74, 222, 128, 0.15);
        }

        /* EHT — orange */
        .eht-btn.active {
          color: #ffa500;
          background: rgba(255, 165, 0, 0.15);
          border-color: rgba(255, 165, 0, 0.35);
          box-shadow: 0 0 12px rgba(255, 165, 0, 0.18);
        }

        /* Blur — sky blue */
        .blur-btn.active {
          color: #87ceeb;
          background: rgba(135, 206, 235, 0.12);
          border-color: rgba(135, 206, 235, 0.3);
          box-shadow: 0 0 12px rgba(135, 206, 235, 0.15);
        }

        .diagnostics-btn.active {
          color: #ffd12a;
          background: rgba(255, 209, 42, 0.12);
          border-color: rgba(255, 209, 42, 0.3);
          box-shadow: 0 0 12px rgba(255, 209, 42, 0.16);
        }

        /* Help — white */
        .help-btn:hover {
          color: rgba(255, 255, 255, 0.9);
        }

        .label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          opacity: 0.8;
        }

        .dock-btn.active .label {
          opacity: 1;
        }

        @media (max-width: 600px) {
          .dock {
            bottom: 16px;
            left: 12px;
            right: 12px;
            transform: translateX(0) translateY(0);
          }

          .dock.hidden {
            transform: translateX(0) translateY(40px);
          }

          .dock-bar {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding: 6px 8px;
            mask-image: linear-gradient(
              to right,
              transparent 0,
              black 12px,
              black calc(100% - 12px),
              transparent 100%
            );
            -webkit-mask-image: linear-gradient(
              to right,
              transparent 0,
              black 12px,
              black calc(100% - 12px),
              transparent 100%
            );
          }

          .dock-bar::-webkit-scrollbar {
            display: none;
          }

          .dock-btn {
            padding: 4px 6px;
            min-width: 36px;
          }

          .divider {
            height: 22px;
            margin: 0 4px;
          }

          .label {
            font-size: 7px;
          }
        }
      `}</style>
    </div>
  );
}
