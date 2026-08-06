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
  const horizonRef = useRef<SVGCircleElement>(null);
  const photonRef = useRef<SVGCircleElement>(null);
  const shadowRef = useRef<SVGCircleElement>(null);
  const strongLensingRef = useRef<SVGCircleElement>(null);
  const weakLensingRef = useRef<SVGCircleElement>(null);
  const iscoRef = useRef<SVGPathElement>(null);
  const rayGroupRef = useRef<SVGGElement>(null);
  const horizonLabelRef = useRef<SVGTextElement>(null);
  const photonLabelRef = useRef<SVGTextElement>(null);
  const shadowLabelRef = useRef<SVGTextElement>(null);
  const iscoLabelRef = useRef<SVGTextElement>(null);
  const strongLabelRef = useRef<SVGTextElement>(null);
  const weakLabelRef = useRef<SVGTextElement>(null);
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
      const horizonRadius = unitScale * CONFIG.rs;
      const photonRadius = unitScale * 1.5 * CONFIG.rs;
      const strongRadius = shadowRadius * 1.45;
      const weakRadius = shadowRadius * 2.2;

      setCircle(horizonRef.current, center, horizonRadius);
      setCircle(photonRef.current, center, photonRadius);
      setCircle(shadowRef.current, center, shadowRadius);
      setCircle(strongLensingRef.current, center, strongRadius);
      setCircle(weakLensingRef.current, center, weakRadius);

      const iscoPoints: ScreenPoint[] = [];
      for (let index = 0; index <= 64; index++) {
        const angle = (index / 64) * Math.PI * 2;
        const point = cameraController.projectToScreen(
          { x: Math.cos(angle) * 3 * CONFIG.rs, y: 0, z: Math.sin(angle) * 3 * CONFIG.rs },
          width,
          height
        );
        if (point) iscoPoints.push(point);
      }
      if (iscoRef.current && iscoPoints.length > 2) {
        iscoRef.current.setAttribute(
          'd',
          iscoPoints
            .map(
              (point, index) =>
                `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
            )
            .join(' ') + ' Z'
        );
      }

      const iscoAnchor = iscoPoints.reduce(
        (leftmost, point) => (point.x < leftmost.x ? point : leftmost),
        iscoPoints[0] ?? center
      );

      setLabel(
        horizonLabelRef.current,
        center.x - horizonRadius - 10,
        center.y - horizonRadius - 8,
        'EVENT HORIZON · 1.0 rₛ',
        'end'
      );
      setLabel(
        photonLabelRef.current,
        center.x + photonRadius + 10,
        center.y - photonRadius - 10,
        'PHOTON SPHERE · 1.5 rₛ'
      );
      setLabel(
        shadowLabelRef.current,
        center.x + shadowRadius + 12,
        center.y - shadowRadius - 10,
        `BLACK HOLE SHADOW · 2.598 rₛ · ${((angularRadius * 180) / Math.PI).toFixed(2)}°`
      );
      setLabel(iscoLabelRef.current, iscoAnchor.x - 12, iscoAnchor.y + 22, 'ISCO · 3.0 rₛ', 'end');
      setLabel(
        strongLabelRef.current,
        center.x - strongRadius * 0.72,
        center.y - strongRadius * 0.72,
        'STRONG LENSING',
        'end'
      );
      setLabel(
        weakLabelRef.current,
        center.x - weakRadius * 0.72,
        center.y - weakRadius * 0.72,
        'WEAK LENSING',
        'end'
      );
      setLabel(
        cameraLabelRef.current,
        center.x,
        Math.max(30, center.y - weakRadius - 28),
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
      <g className="lensing-zones">
        <circle ref={weakLensingRef} className="zone weak" />
        <circle ref={strongLensingRef} className="zone strong" />
      </g>

      <circle ref={horizonRef} className="feature horizon" />
      <circle ref={photonRef} className="feature photon" />
      <circle ref={shadowRef} className="feature shadow" />
      <path ref={iscoRef} className="feature isco" />

      <g className="labels">
        <text ref={horizonLabelRef} className="horizon-label" />
        <text ref={photonLabelRef} className="photon-label" />
        <text ref={shadowLabelRef} className="shadow-label" />
        <text ref={iscoLabelRef} className="isco-label" />
        <text ref={strongLabelRef} className="zone-label" />
        <text ref={weakLabelRef} className="zone-label" />
        <text ref={cameraLabelRef} className="camera-label" />
      </g>

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
        .zone,
        .ray-path {
          fill: none;
          vector-effect: non-scaling-stroke;
        }
        .horizon {
          stroke: rgba(255, 92, 92, 0.9);
          stroke-width: 1.2;
        }
        .photon {
          stroke: rgba(255, 159, 67, 0.9);
          stroke-width: 1.2;
        }
        .shadow {
          stroke: rgba(255, 218, 92, 0.95);
          stroke-width: 1.5;
        }
        .isco {
          stroke: rgba(79, 216, 216, 0.9);
          stroke-width: 1.2;
        }
        .zone {
          stroke: rgba(190, 225, 255, 0.24);
          stroke-width: 1;
        }
        .weak {
          stroke-opacity: 0.5;
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
        .zone-label,
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
          .zone-label,
          .camera-label {
            display: none;
          }
        }
      `}</style>
    </svg>
  );
}
