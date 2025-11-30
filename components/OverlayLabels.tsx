'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { CameraController } from '@/lib/camera';
import { ToggleState } from '@/lib/types';
import { CONFIG } from '@/lib/config';

interface LabelConfig {
  key: keyof ToggleState;
  label: string;
  radius: number;
  color: string;
  description?: string;
  angleOffset: number; // Radians offset from camera direction to spread labels
}

const LABELS: LabelConfig[] = [
  {
    key: 'eventHorizon',
    label: 'Event Horizon',
    radius: CONFIG.rs,
    color: '#ff2626',
    description: '1 rs',
    angleOffset: 0,
  },
  {
    key: 'isco',
    label: 'ISCO',
    radius: 3 * CONFIG.rs,
    color: '#00d9d9',
    description: '3 rs',
    angleOffset: Math.PI * 0.15, // ~27 degrees
  },
  {
    key: 'scale',
    label: '5 rs',
    radius: 5 * CONFIG.rs,
    color: '#b3b3bf',
    angleOffset: -Math.PI * 0.12, // ~-22 degrees
  },
  {
    key: 'scale',
    label: '10 rs',
    radius: 10 * CONFIG.rs,
    color: '#b3b3bf',
    angleOffset: Math.PI * 0.08, // ~14 degrees
  },
  {
    key: 'scale',
    label: '15 rs',
    radius: 15 * CONFIG.rs,
    color: '#b3b3bf',
    angleOffset: -Math.PI * 0.05, // ~-9 degrees
  },
];

interface OverlayLabelsProps {
  cameraController: CameraController | null;
  toggleState: ToggleState;
  show: boolean;
}

interface LabelPosition {
  x: number;
  y: number;
  visible: boolean;
  label: string;
  color: string;
  description?: string;
}

export function OverlayLabels({ cameraController, toggleState, show }: OverlayLabelsProps) {
  const [labelPositions, setLabelPositions] = useState<LabelPosition[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const computeLensingOffset = useCallback(
    (
      worldPos: { x: number; y: number; z: number },
      cameraPos: { x: number; y: number; z: number }
    ): { dx: number; dy: number } => {
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
    },
    []
  );

  const updatePositions = useCallback(() => {
    if (!cameraController) return;

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const cameraPos = cameraController.getPosition();

    const positions: LabelPosition[] = [];

    for (const labelConfig of LABELS) {
      // Skip if this overlay is not enabled
      if (!toggleState[labelConfig.key]) continue;

      // Find a good position on the ring to place the label
      // Base angle from camera direction, plus offset to spread labels apart
      const baseAngle = Math.atan2(cameraPos.z, cameraPos.x);
      const angle = baseAngle + labelConfig.angleOffset;

      // Position on the ring at the offset angle (in disk plane)
      const worldPos = {
        x: Math.cos(angle) * labelConfig.radius,
        y: 0,
        z: Math.sin(angle) * labelConfig.radius,
      };

      // Project to screen
      const screenPos = cameraController.projectToScreen(worldPos, screenWidth, screenHeight);

      if (screenPos) {
        // Apply lensing correction
        const offset = computeLensingOffset(worldPos, cameraPos);

        positions.push({
          x: screenPos.x + offset.dx,
          y: screenPos.y + offset.dy,
          visible: true,
          label: labelConfig.label,
          color: labelConfig.color,
          description: labelConfig.description,
        });
      }
    }

    setLabelPositions(positions);
  }, [cameraController, toggleState, computeLensingOffset]);

  useEffect(() => {
    if (!show || !cameraController) return;

    const animate = () => {
      updatePositions();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [show, cameraController, updatePositions]);

  if (!show) return null;

  return (
    <div className="overlay-labels">
      {labelPositions.map((pos, idx) => (
        <div
          key={`${pos.label}-${idx}`}
          className="overlay-label"
          style={{
            left: pos.x,
            top: pos.y,
            borderColor: pos.color,
            color: pos.color,
          }}
        >
          <span className="label-text">{pos.label}</span>
          {pos.description && <span className="label-desc">{pos.description}</span>}
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
