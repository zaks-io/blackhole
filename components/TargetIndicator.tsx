'use client';

import { useEffect, useRef } from 'react';
import { CameraController } from '@/lib/camera';

const EDGE_MARGIN = 56;
const LABEL_INSET = 44;

interface TargetIndicatorProps {
  cameraController: CameraController | null;
  label: string;
  color: string;
  show: boolean;
}

/**
 * Fly-mode wayfinding marker for the scene center (the black hole or
 * wormhole sits at the world origin). Hidden while the target is in view;
 * once it leaves the screen, a chevron clamps to the viewport edge pointing
 * the shortest way back, so free flight can always find home.
 *
 * Positions are written straight to the DOM every animation frame instead of
 * going through React state: a per-frame setState renders one frame late,
 * which reads as the marker trailing while flying.
 */
export function TargetIndicator({ cameraController, label, color, show }: TargetIndicatorProps) {
  const chevronRef = useRef<SVGSVGElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !cameraController) return;

    let frame: number;
    const update = () => {
      frame = requestAnimationFrame(update);
      const chevron = chevronRef.current;
      const labelEl = labelRef.current;
      if (!chevron || !labelEl) return;

      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      const ndc = cameraController.projectForIndicator({ x: 0, y: 0, z: 0 });

      let px = ndc.x * halfW;
      let py = -ndc.y * halfH;

      const clampW = halfW - EDGE_MARGIN;
      const clampH = halfH - EDGE_MARGIN;
      const onScreen = !ndc.behind && Math.abs(px) <= clampW && Math.abs(py) <= clampH;

      if (!onScreen) {
        const scale = Math.min(
          clampW / Math.max(Math.abs(px), 1e-6),
          clampH / Math.max(Math.abs(py), 1e-6)
        );
        px *= scale;
        py *= scale;
      }

      const x = halfW + px;
      const y = halfH + py;
      const angle = Math.atan2(py, px);

      chevron.style.display = onScreen ? 'none' : 'block';
      labelEl.style.display = onScreen ? 'none' : 'block';
      if (!onScreen) {
        chevron.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad)`;
        const lx = x - Math.cos(angle) * LABEL_INSET;
        const ly = y - Math.sin(angle) * LABEL_INSET;
        labelEl.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%)`;
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [show, cameraController]);

  if (!show) return null;

  return (
    <div className="target-indicator">
      <svg
        ref={chevronRef}
        className="chevron"
        style={{ display: 'none' }}
        width="22"
        height="22"
        viewBox="0 0 22 22"
      >
        <path
          d="M 7 3 L 16 11 L 7 19"
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        ref={labelRef}
        className="target-label"
        style={{ display: 'none', borderColor: color, color }}
      >
        {label}
      </div>

      <style jsx>{`
        .target-indicator {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 50;
        }

        .chevron {
          position: absolute;
          left: 0;
          top: 0;
          opacity: 0.9;
        }

        .target-label {
          position: absolute;
          left: 0;
          top: 0;
          transform: translate(-1000px, -1000px);
          padding: 4px 10px;
          background: rgba(0, 0, 0, 0.7);
          border: 1px solid;
          border-radius: 4px;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          white-space: nowrap;
          backdrop-filter: blur(4px);
        }
      `}</style>
    </div>
  );
}
