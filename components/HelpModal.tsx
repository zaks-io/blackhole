'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { CloseIcon } from './icons';

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  const contactHref = useMemo(
    () =>
      [
        'm',
        'a',
        'i',
        'l',
        't',
        'o',
        ':',
        'i',
        's',
        'a',
        'a',
        'c',
        '@',
        'z',
        'a',
        'k',
        's',
        '.',
        'i',
        'o',
      ].join(''),
    []
  );

  const contactLabel = useMemo(
    () =>
      [
        'i',
        's',
        'a',
        'a',
        'c',
        ' ',
        '[',
        'a',
        't',
        ']',
        ' ',
        'z',
        'a',
        'k',
        's',
        '.',
        'i',
        'o',
      ].join(''),
    []
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <div
      className={`backdrop ${open ? 'open' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Help"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <CloseIcon size={16} />
        </button>

        <h2 className="title">Schwarzschild Black Hole</h2>
        <p className="desc">
          A real-time gravitational lensing simulation that numerically approximates Schwarzschild
          light paths. Traced disk crossings produce higher-order images, relativistic beaming, and
          a Doppler-shifted accretion disk.
        </p>

        <div className="section">
          <h3 className="section-title">Navigation</h3>
          <div className="keys">
            <div className="key-row">
              <kbd>Drag</kbd>
              <span>Orbit camera around the black hole</span>
            </div>
            <div className="key-row">
              <kbd>Scroll</kbd>
              <span>Zoom in / out</span>
            </div>
            <div className="key-row">
              <kbd>Manual</kbd>
              <span>Enable free camera — WASD to move, mouse to look</span>
            </div>
          </div>
        </div>

        <div className="section">
          <h3 className="section-title">Controls</h3>

          <div className="control-group">
            <h4 className="group-label">Toggles</h4>
            <div className="control-list">
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c00' }}>
                  Disk
                </span>
                <span className="control-desc">Accretion disk with Keplerian rotation</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff2626' }}>
                  Horizon
                </span>
                <span className="control-desc">Event horizon boundary marker</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff66cc' }}>
                  Illustrative Binary
                </span>
                <span className="control-desc">
                  Approximate two-black-hole visualization; strong-field lensing is not exact
                </span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#9966ff' }}>
                  Audio
                </span>
                <span className="control-desc">Sonification of orbital dynamics</span>
              </div>
            </div>
          </div>

          <div className="control-group">
            <h4 className="group-label">Camera Presets</h4>
            <div className="control-list">
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c42' }}>
                  Far
                </span>
                <span className="control-desc">Distant overview</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c42' }}>
                  Orbit
                </span>
                <span className="control-desc">Default orbiting view</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c42' }}>
                  Disk
                </span>
                <span className="control-desc">Face-on accretion disk</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c42' }}>
                  Above
                </span>
                <span className="control-desc">Top-down perspective</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c42' }}>
                  Edge
                </span>
                <span className="control-desc">Edge-on disk view</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ff8c42' }}>
                  Ring
                </span>
                <span className="control-desc">Close-up of photon sphere at 1.5 r&#x209B;</span>
              </div>
            </div>
          </div>

          <div className="control-group">
            <h4 className="group-label">Sequences</h4>
            <div className="control-list">
              <div className="control-item">
                <span className="control-name" style={{ color: '#a78bfa' }}>
                  Fall
                </span>
                <span className="control-desc">Plunge toward the event horizon</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#a78bfa' }}>
                  Tour
                </span>
                <span className="control-desc">Guided tour of relativistic effects</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#a78bfa' }}>
                  Shadow
                </span>
                <span className="control-desc">Explore the black hole shadow at 2.6 r&#x209B;</span>
              </div>
            </div>
          </div>

          <div className="control-group">
            <h4 className="group-label">Modes</h4>
            <div className="control-list">
              <div className="control-item">
                <span className="control-name" style={{ color: '#4ade80' }}>
                  Manual
                </span>
                <span className="control-desc">Free camera with WASD + mouse</span>
              </div>
              <div className="control-item">
                <span className="control-name" style={{ color: '#ffa500' }}>
                  EHT
                </span>
                <span className="control-desc">
                  Simulates Event Horizon Telescope diffraction blur
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <h3 className="section-title">Info Panel</h3>
          <p className="desc">
            The panel in the top-left shows your distance from the singularity. Expand it to select
            a black hole mass and see distances in physical units.
          </p>
        </div>

        <div className="section contact">
          <p className="desc">
            A side project I&apos;ve been tinkering with — built for fun, not profit. Sorry about
            your fans.
          </p>
          <a href={contactHref} className="contact-link">
            {contactLabel}
          </a>
        </div>
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .backdrop.open {
          opacity: 1;
          pointer-events: auto;
        }

        .modal {
          position: relative;
          max-width: 520px;
          width: calc(100% - 48px);
          max-height: calc(100vh - 96px);
          overflow-y: auto;
          padding: 32px;
          background: rgba(10, 10, 10, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow:
            0 4px 60px rgba(0, 0, 0, 0.7),
            0 0 80px rgba(255, 140, 66, 0.03),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          transform: scale(0.96);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        }

        .backdrop.open .modal {
          transform: scale(1);
        }

        .modal::-webkit-scrollbar {
          width: 4px;
        }

        .modal::-webkit-scrollbar-track {
          background: transparent;
        }

        .modal::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }

        .close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: all 0.2s;
        }

        .close-btn:hover {
          color: rgba(255, 255, 255, 0.8);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .title {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 16px;
          font-weight: 400;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.9);
          margin: 0 0 12px;
        }

        .desc {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 11px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.4);
          margin: 0;
        }

        .section {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .section-title {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #ff8c42;
          margin: 0 0 14px;
        }

        .keys {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .key-row {
          display: flex;
          align-items: center;
          gap: 12px;
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.45);
        }

        kbd {
          display: inline-block;
          min-width: 56px;
          padding: 3px 8px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          font-family: inherit;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
        }

        .control-group {
          margin-bottom: 16px;
        }

        .control-group:last-child {
          margin-bottom: 0;
        }

        .group-label {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 8px;
          font-weight: 500;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.25);
          margin: 0 0 8px;
        }

        .control-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .control-item {
          display: flex;
          align-items: baseline;
          gap: 10px;
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 11px;
        }

        .control-name {
          min-width: 56px;
          font-weight: 500;
          flex-shrink: 0;
        }

        .control-desc {
          color: rgba(255, 255, 255, 0.35);
        }

        .contact {
          text-align: center;
        }

        .contact-link {
          font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.25);
          text-decoration: none;
          transition: color 0.2s;
        }

        .contact-link:hover {
          color: rgba(255, 255, 255, 0.5);
        }

        @media (max-width: 600px) {
          .modal {
            padding: 24px 20px;
            max-height: calc(100vh - 48px);
            border-radius: 12px;
          }

          .title {
            font-size: 14px;
          }

          .control-item {
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  );
}
