'use client';

import { useEffect, useRef } from 'react';
import { CameraController } from '@/lib/camera';
import { ToggleState } from '@/lib/types';
import { CONFIG } from '@/lib/config';

interface LabelConfig {
  key: keyof ToggleState;
  label: string;
  radius: number;
  color: string;
  description?: string;
}

const LABELS: LabelConfig[] = [
  {
    key: 'eventHorizon',
    label: 'Event Horizon',
    radius: CONFIG.rs,
    color: '#ff2626',
    description: '1 rs',
  },
];

interface OverlayLabelsProps {
  cameraController: CameraController | null;
  toggleState: ToggleState;
  show: boolean;
}

type Vec3 = { x: number; y: number; z: number };

// Approximate where gravitational lensing shifts the apparent position of a
// world point, in screen pixels
function computeLensingOffset(worldPos: Vec3, cameraPos: Vec3): { dx: number; dy: number } {
  const rs = CONFIG.rs;

  // Vector from black hole (origin) to the point on the ring
  const toPoint = {
    x: worldPos.x,
    y: worldPos.y,
    z: worldPos.z,
  };
  const pointDist = Math.sqrt(
    toPoint.x * toPoint.x + toPoint.y * toPoint.y + toPoint.z * toPoint.z
  );

  // Vector from camera to black hole
  const toBlackHole = {
    x: -cameraPos.x,
    y: -cameraPos.y,
    z: -cameraPos.z,
  };
  const cameraDist = Math.sqrt(
    cameraPos.x * cameraPos.x + cameraPos.y * cameraPos.y + cameraPos.z * cameraPos.z
  );

  // Approximate impact parameter: perpendicular distance from camera-to-point ray to origin
  // For simplicity, use the distance from origin to the nearest point on the camera-to-label line
  const cameraToLabel = {
    x: worldPos.x - cameraPos.x,
    y: worldPos.y - cameraPos.y,
    z: worldPos.z - cameraPos.z,
  };
  const rayLength = Math.sqrt(
    cameraToLabel.x * cameraToLabel.x +
      cameraToLabel.y * cameraToLabel.y +
      cameraToLabel.z * cameraToLabel.z
  );

  // Unit vector along ray
  const rayDir = {
    x: cameraToLabel.x / rayLength,
    y: cameraToLabel.y / rayLength,
    z: cameraToLabel.z / rayLength,
  };

  // Project origin onto ray: t = -camera·rayDir
  const t = -(cameraPos.x * rayDir.x + cameraPos.y * rayDir.y + cameraPos.z * rayDir.z);

  // Closest point on ray to origin
  const closest = {
    x: cameraPos.x + t * rayDir.x,
    y: cameraPos.y + t * rayDir.y,
    z: cameraPos.z + t * rayDir.z,
  };

  // Impact parameter
  const b = Math.sqrt(closest.x * closest.x + closest.y * closest.y + closest.z * closest.z);

  // Critical impact parameter (photon sphere capture)
  const bCrit = 2.598 * rs;

  // If impact parameter is below critical, very strong lensing
  if (b < bCrit * 1.1) {
    // Strong lensing regime - deflection towards black hole center
    const deflectionStrength = rs / Math.max(b, 0.1);

    // Direction from label to black hole in screen space (approximation)
    // We push the label toward the apparent position of the black hole
    return {
      dx: -toPoint.x * deflectionStrength * 20,
      dy: toPoint.y * deflectionStrength * 20,
    };
  }

  // Weak field approximation: deflection angle α ≈ 2rs/b radians
  // The apparent position shifts toward the black hole
  const deflectionAngle = (2 * rs) / b;

  // Scale to screen pixels (rough approximation based on FOV and distance)
  const screenScale = (500 / cameraDist) * deflectionAngle;

  // Deflection direction: toward the black hole from the label's perspective
  const deflectDir = {
    x: -toPoint.x / pointDist,
    y: -toPoint.y / pointDist,
  };

  return {
    dx: deflectDir.x * screenScale * 30,
    dy: -deflectDir.y * screenScale * 30,
  };
}

/**
 * Labels that track a point on a ring in the disk plane, with a leader line
 * back to the lensed anchor.
 *
 * Positions are written straight to the DOM every animation frame instead of
 * going through React state: a per-frame setState re-rendered the labels (and
 * every parent) at the frame rate, and throttling would make them stutter
 * around the orbit.
 */
export function OverlayLabels({ cameraController, toggleState, show }: OverlayLabelsProps) {
  const lineRefs = useRef(new Map<string, SVGLineElement>());
  const labelRefs = useRef(new Map<string, HTMLDivElement>());

  const visibleLabels = LABELS.filter((labelConfig) => toggleState[labelConfig.key]);

  useEffect(() => {
    if (!show || !cameraController) return;

    let frame: number;
    const update = () => {
      frame = requestAnimationFrame(update);

      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const cameraPos = cameraController.getPosition();

      for (const labelConfig of LABELS) {
        const line = lineRefs.current.get(labelConfig.key);
        const labelEl = labelRefs.current.get(labelConfig.key);
        if (!line || !labelEl) continue;

        // Place the label on the ring point nearest the camera
        const angle = Math.atan2(cameraPos.z, cameraPos.x);
        const worldPos = {
          x: Math.cos(angle) * labelConfig.radius,
          y: 0,
          z: Math.sin(angle) * labelConfig.radius,
        };

        const screenPos = cameraController.projectToScreen(worldPos, screenWidth, screenHeight);
        if (!screenPos) {
          line.style.display = 'none';
          labelEl.style.display = 'none';
          continue;
        }

        const offset = computeLensingOffset(worldPos, cameraPos);
        const anchorX = screenPos.x + offset.dx;
        const anchorY = screenPos.y + offset.dy;
        const placeRight = anchorX < screenWidth * 0.68;
        const x = anchorX + (placeRight ? 118 : -118);
        const y = Math.max(72, anchorY - 72);

        line.style.display = '';
        line.setAttribute('x1', String(anchorX));
        line.setAttribute('y1', String(anchorY));
        line.setAttribute('x2', String(x));
        line.setAttribute('y2', String(y));

        labelEl.style.display = '';
        labelEl.style.left = `${x}px`;
        labelEl.style.top = `${y}px`;
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [show, cameraController]);

  if (!show) return null;

  return (
    <div className="overlay-labels">
      <svg className="leader-lines" aria-hidden="true">
        {visibleLabels.map((labelConfig) => (
          <line
            key={labelConfig.key}
            ref={(el) => {
              if (el) lineRefs.current.set(labelConfig.key, el);
              else lineRefs.current.delete(labelConfig.key);
            }}
            style={{ display: 'none' }}
            stroke={labelConfig.color}
          />
        ))}
      </svg>
      {visibleLabels.map((labelConfig) => (
        <div
          key={labelConfig.key}
          ref={(el) => {
            if (el) labelRefs.current.set(labelConfig.key, el);
            else labelRefs.current.delete(labelConfig.key);
          }}
          className="overlay-label"
          style={{ display: 'none', borderColor: labelConfig.color, color: labelConfig.color }}
        >
          <span className="label-text">{labelConfig.label}</span>
          {labelConfig.description && <span className="label-desc">{labelConfig.description}</span>}
        </div>
      ))}

      <style jsx>{`
        .overlay-labels {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 50;
        }

        .overlay-label {
          position: absolute;
          transform: translate(-50%, -50%);
          padding: 4px 10px;
          background: rgba(0, 0, 0, 0.7);
          border: 1px solid;
          border-radius: 4px;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.5px;
          white-space: nowrap;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          backdrop-filter: blur(4px);
        }

        .leader-lines {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .leader-lines line {
          stroke-width: 1;
          stroke-dasharray: 3 3;
          opacity: 0.75;
        }

        .label-text {
          text-transform: uppercase;
        }

        .label-desc {
          font-size: 9px;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
