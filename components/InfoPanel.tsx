'use client';

import { useState } from 'react';
import { CONFIG } from '@/lib/config';

// Black hole mass presets with their Schwarzschild radius in km
const MASS_PRESETS = [
  { name: 'Stellar (10 M☉)', mass: 10, rsKm: 29.5 },
  { name: 'Intermediate (1,000 M☉)', mass: 1000, rsKm: 2950 },
  { name: 'Sgr A* (4M M☉)', mass: 4e6, rsKm: 1.18e7 },
  { name: 'M87* (6.5B M☉)', mass: 6.5e9, rsKm: 1.92e10 },
] as const;

interface InfoPanelProps {
  cameraDistance: number; // Distance in simulation units (rs)
  show?: boolean;
}

function formatDistance(km: number): string {
  if (km < 1000) {
    return `${km.toFixed(0)} km`;
  } else if (km < 1e6) {
    return `${(km / 1000).toFixed(1)} thousand km`;
  } else if (km < 1e9) {
    return `${(km / 1e6).toFixed(2)} million km`;
  } else if (km < 1e12) {
    return `${(km / 1e9).toFixed(2)} billion km`;
  } else {
    // Convert to light years (1 ly ≈ 9.461e12 km)
    const ly = km / 9.461e12;
    if (ly < 1) {
      return `${(ly * 365.25).toFixed(1)} light-days`;
    }
    return `${ly.toFixed(2)} light-years`;
  }
}

export function InfoPanel({ cameraDistance, show = true }: InfoPanelProps) {
  const [selectedMassIndex, setSelectedMassIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedMass = MASS_PRESETS[selectedMassIndex];
  const distanceInKm = cameraDistance * selectedMass.rsKm;
  const rsInKm = selectedMass.rsKm;

  // Key radii in simulation units
  const iscoRadius = CONFIG.disk.innerRadius; // 3 rs
  const photonSphereRadius = 1.5; // 1.5 rs
  const shadowRadius = 2.598; // ~2.6 rs

  return (
    <div className={`info-panel ${show ? '' : 'hidden'}`}>
      <button
        className={`panel-header ${isExpanded ? 'open' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="distance-display">
          {cameraDistance.toFixed(1)} r<sub>s</sub>
        </span>
        <span className="chevron">▼</span>
      </button>

      <div className={`panel-content ${isExpanded ? 'expanded' : ''}`}>
        {/* Mass selector */}
        <div className="mass-selector">
          <label>Black Hole Mass</label>
          <select
            value={selectedMassIndex}
            onChange={(e) => setSelectedMassIndex(Number(e.target.value))}
          >
            {MASS_PRESETS.map((preset, index) => (
              <option key={preset.name} value={index}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* Distance info */}
        <div className="info-section">
          <div className="info-row">
            <span className="label">Camera Distance</span>
            <span className="value">{formatDistance(distanceInKm)}</span>
          </div>
          <div className="info-row">
            <span className="label">
              1 r<sub>s</sub> =
            </span>
            <span className="value">{formatDistance(rsInKm)}</span>
          </div>
        </div>

        {/* Key radii */}
        <div className="info-section">
          <div className="section-title">Key Distances</div>
          <div className="info-row">
            <span className="label" style={{ color: '#ff2626' }}>
              Event Horizon
            </span>
            <span className="value">
              1.0 r<sub>s</sub> = {formatDistance(rsInKm)}
            </span>
          </div>
          <div className="info-row">
            <span className="label" style={{ color: '#ffd900' }}>
              Photon Sphere
            </span>
            <span className="value">
              {photonSphereRadius} r<sub>s</sub> = {formatDistance(photonSphereRadius * rsInKm)}
            </span>
          </div>
          <div className="info-row">
            <span className="label" style={{ color: '#cc4de6' }}>
              Shadow Edge
            </span>
            <span className="value">
              {shadowRadius} r<sub>s</sub> = {formatDistance(shadowRadius * rsInKm)}
            </span>
          </div>
          <div className="info-row">
            <span className="label" style={{ color: '#00d9d9' }}>
              ISCO
            </span>
            <span className="value">
              {iscoRadius} r<sub>s</sub> = {formatDistance(iscoRadius * rsInKm)}
            </span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .info-panel {
          position: fixed;
          bottom: 32px;
          left: 32px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          opacity: 1;
          transition:
            transform 0.5s cubic-bezier(0.4, 0, 0.2, 1),
            opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .info-panel.hidden {
          transform: translateY(100px);
          opacity: 0;
          pointer-events: none;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(10, 10, 10, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .panel-header:hover {
          background: rgba(10, 10, 10, 0.85);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .panel-header.open {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          border-bottom-color: transparent;
        }

        .distance-display {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.05em;
        }

        .distance-display sub {
          font-size: 10px;
        }

        .chevron {
          font-size: 8px;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0.6;
        }

        .panel-header.open .chevron {
          transform: rotate(180deg);
        }

        .panel-content {
          max-height: 0;
          overflow: hidden;
          background: rgba(10, 10, 10, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-top: none;
          border-radius: 0 0 12px 12px;
          box-shadow:
            0 4px 30px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
          min-width: 280px;
        }

        .panel-content.expanded {
          max-height: 400px;
          padding: 12px 14px;
          opacity: 1;
        }

        .mass-selector {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 12px;
        }

        .mass-selector label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
        }

        .mass-selector select {
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.9);
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mass-selector select:hover {
          border-color: rgba(255, 255, 255, 0.25);
        }

        .mass-selector select:focus {
          outline: none;
          border-color: rgba(255, 140, 66, 0.5);
        }

        .info-section {
          padding: 8px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .section-title {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 6px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 3px 0;
        }

        .info-row .label {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.7);
        }

        .info-row .label sub {
          font-size: 8px;
        }

        .info-row .value {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.9);
          text-align: right;
        }

        .info-row .value sub {
          font-size: 8px;
        }

        @media (max-width: 600px) {
          .info-panel {
            left: 16px;
            bottom: 24px;
          }

          .panel-content {
            min-width: 240px;
          }
        }
      `}</style>
    </div>
  );
}
