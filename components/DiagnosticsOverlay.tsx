'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CameraController } from '@/lib/camera';
import { CONFIG } from '@/lib/config';
import {
  schwarzschildCriticalAngularRadius,
  schwarzschildCriticalImpactParameter,
  traceSchwarzschildNullRay,
  type SchwarzschildNullTrace,
} from '@/lib/physics/schwarzschild';
import { DiagnosticsMode } from '@/lib/types';

interface DiagnosticsOverlayProps {
  cameraController: CameraController | null;
  mode: DiagnosticsMode;
  show: boolean;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const RAY_GUIDES = [
  { label: 'captured', ratio: 0.96, color: '#ff6b6b', duration: '3.4s' },
  { label: 'loops', ratio: 1.001, color: '#ffda5c', duration: '5.2s' },
  { label: 'escapes', ratio: 1.2, color: '#66d9ff', duration: '4.1s' },
] as const;

function traceGuideRay(ratio: number): SchwarzschildNullTrace {
  return traceSchwarzschildNullRay({
    observerRadius: 24,
    impactParameter: schwarzschildCriticalImpactParameter(CONFIG.rs) * ratio,
    rs: CONFIG.rs,
    angularStep: 0.002,
    maxAngularSweep: 8 * Math.PI,
    pathSampleStride: 4,
  });
}

function toPath(trace: SchwarzschildNullTrace): string {
  return (trace.path ?? [])
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`)
    .join(' ');
}

function setCircle(circle: SVGCircleElement | null, center: ScreenPoint, radius: number) {
  if (!circle) return;
  circle.setAttribute('cx', center.x.toFixed(2));
  circle.setAttribute('cy', center.y.toFixed(2));
  circle.setAttribute('r', radius.toFixed(2));
}

function setLabel(
  label: SVGTextElement | null,
  x: number,
  y: number,
  text: string,
  anchor: 'start' | 'middle' | 'end' = 'start'
) {
  if (!label) return;
  label.setAttribute('x', x.toFixed(2));
  label.setAttribute('y', y.toFixed(2));
  label.setAttribute('text-anchor', anchor);
  label.textContent = text;
}

export function DiagnosticsOverlay({ cameraController, mode, show }: DiagnosticsOverlayProps) {
  const shadowRef = useRef<SVGCircleElement>(null);
  const rayGroupRef = useRef<SVGGElement>(null);
  const horizonLabelRef = useRef<SVGTextElement>(null);
  const photonLabelRef = useRef<SVGTextElement>(null);
  const shadowLabelRef = useRef<SVGTextElement>(null);
  const iscoLabelRef = useRef<SVGTextElement>(null);
  const cameraLabelRef = useRef<SVGTextElement>(null);
  const guideRays = useMemo(
    () => RAY_GUIDES.map((guide) => ({ ...guide, path: toPath(traceGuideRay(guide.ratio)) })),
    []
  );

  useEffect(() => {
    if (!cameraController || !show || mode === 'off') return;

    let animationFrame: number;
    const update = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const center =
        cameraController.projectToScreen({ x: 0, y: 0, z: 0 }, width, height) ??
        ({ x: width / 2, y: height / 2 } satisfies ScreenPoint);
      const distance = cameraController.getDistance();
      const angularRadius = schwarzschildCriticalAngularRadius(distance, CONFIG.rs);
      const halfFov = (CONFIG.camera.fov * Math.PI) / 360;
      const shadowRadius = (Math.tan(angularRadius) / Math.tan(halfFov)) * (height / 2);
      const unitScale = shadowRadius / schwarzschildCriticalImpactParameter(CONFIG.rs);
      const compactGuides = shadowRadius < 80;

      setCircle(shadowRef.current, center, shadowRadius);

      setLabel(
        horizonLabelRef.current,
        center.x + (compactGuides ? shadowRadius + 12 : -shadowRadius - 12),
        center.y + shadowRadius + 16,
        'EVENT HORIZON · 1.0 rₛ · HIDDEN INSIDE SHADOW',
        compactGuides ? 'start' : 'end'
      );
      setLabel(
        photonLabelRef.current,
        center.x - shadowRadius - 12,
        center.y - shadowRadius + 10,
        'PHOTON SPHERE · 1.5 rₛ · DEFINES CRITICAL CURVE',
        'end'
      );
      setLabel(
        shadowLabelRef.current,
        center.x + shadowRadius + 12,
        center.y - shadowRadius - 10,
        `SHADOW EDGE · 2.598 rₛ · ${((angularRadius * 180) / Math.PI).toFixed(2)}°`
      );
      setLabel(
        iscoLabelRef.current,
        center.x - shadowRadius * 1.3,
        center.y + shadowRadius * 1.25,
        'ISCO · 3.0 rₛ · RAY-TRACED DISK EDGE',
        'end'
      );
      setLabel(
        cameraLabelRef.current,
        center.x,
        Math.max(30, center.y - shadowRadius - 42),
        `CAMERA · ${distance.toFixed(2)} rₛ`,
        'middle'
      );

      rayGroupRef.current?.setAttribute(
        'transform',
        `translate(${center.x.toFixed(2)} ${center.y.toFixed(2)}) scale(${unitScale.toFixed(4)} ${(-unitScale).toFixed(4)})`
      );

      animationFrame = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(animationFrame);
  }, [cameraController, mode, show]);

  if (!show || mode === 'off') return null;

  const showRays = mode === 'lensing';

  return (
    <svg className="guides" data-testid="diagnostics-overlay" aria-label="Black hole visual guides">
      {mode === 'anatomy' ? (
        <>
          <circle ref={shadowRef} className="feature shadow" />
          <g className="labels">
            <text ref={horizonLabelRef} className="horizon-label" />
            <text ref={photonLabelRef} className="photon-label" />
            <text ref={shadowLabelRef} className="shadow-label" />
            <text ref={iscoLabelRef} className="isco-label" />
            <text ref={cameraLabelRef} className="camera-label" />
          </g>
        </>
      ) : null}

      <g ref={rayGroupRef} className={`ray-guides ${showRays ? 'visible' : ''}`}>
        {guideRays.map((guide) => (
          <g key={guide.label}>
            <path
              id={`ray-${guide.label}`}
              d={guide.path}
              className="ray-path"
              style={{ stroke: guide.color }}
              vectorEffect="non-scaling-stroke"
            />
            <circle className="ray-pulse" r="0.075" style={{ fill: guide.color }}>
              <animateMotion path={guide.path} dur={guide.duration} repeatCount="indefinite" />
            </circle>
          </g>
        ))}
      </g>

      {showRays ? (
        <g className="ray-key">
          <text x="24" y="82">
            LIGHT PATHS
          </text>
          {guideRays.map((guide, index) => (
            <text key={guide.label} x="24" y={102 + index * 17} style={{ fill: guide.color }}>
              {guide.label.toUpperCase()}
            </text>
          ))}
        </g>
      ) : null}

      <style jsx>{`
        .guides {
          position: fixed;
          inset: 0;
          z-index: 70;
          width: 100%;
          height: 100%;
          overflow: hidden;
          pointer-events: none;
        }
        .feature,
        .ray-path {
          fill: none;
          vector-effect: non-scaling-stroke;
        }
        .shadow {
          stroke: rgba(255, 218, 92, 0.95);
          stroke-width: 1.5;
        }
        .labels text,
        .ray-key text {
          font:
            500 10px 'SF Mono',
            Monaco,
            monospace;
          letter-spacing: 0.08em;
          paint-order: stroke;
          stroke: rgba(0, 0, 0, 0.95);
          stroke-width: 3px;
          stroke-linejoin: round;
        }
        .horizon-label {
          fill: #ff7676;
        }
        .photon-label {
          fill: #ffad62;
        }
        .shadow-label {
          fill: #ffdf72;
        }
        .isco-label {
          fill: #72e6e6;
        }
        .camera-label {
          fill: rgba(220, 238, 255, 0.62);
        }
        .ray-guides {
          display: none;
        }
        .ray-guides.visible {
          display: inline;
        }
        .ray-path {
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          opacity: 0.9;
        }
        .ray-pulse {
          filter: drop-shadow(0 0 0.08px white);
        }
        .ray-key text:first-child {
          fill: rgba(255, 255, 255, 0.72);
        }
        @media (max-width: 700px) {
          .labels text,
          .ray-key text {
            font-size: 8px;
          }
          .camera-label {
            display: none;
          }
        }
      `}</style>
    </svg>
  );
}
