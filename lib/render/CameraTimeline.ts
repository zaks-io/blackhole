import type { CameraSequence, CameraSequenceStep, CameraState } from '../camera/CameraController';
import type { CameraKeyframe } from './types';

/**
 * GSAP-style easing functions
 */
const easingFunctions: Record<string, (t: number) => number> = {
  linear: (t) => t,
  'power1.in': (t) => t,
  'power1.out': (t) => 1 - (1 - t),
  'power1.inOut': (t) => (t < 0.5 ? t : 1 - (1 - t)),
  'power2.in': (t) => t * t,
  'power2.out': (t) => 1 - (1 - t) * (1 - t),
  'power2.inOut': (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  'power3.in': (t) => t * t * t,
  'power3.out': (t) => 1 - Math.pow(1 - t, 3),
  'power3.inOut': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

function getEasing(ease: string): (t: number) => number {
  return easingFunctions[ease] || easingFunctions['power2.inOut'];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPosition(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number
): { x: number; y: number; z: number } {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

/**
 * Pre-computed camera timeline for offline rendering
 * Converts CameraSequence steps into a dense array of keyframes for frame-accurate playback
 */
export class CameraTimeline {
  private keyframes: CameraKeyframe[] = [];
  private _duration: number = 0;
  private keyframeRate: number;

  constructor(sequence: CameraSequence, keyframeRate: number = 120) {
    this.keyframeRate = keyframeRate;
    this.buildTimeline(sequence);
  }

  get duration(): number {
    return this._duration;
  }

  get frameCount(): number {
    return this.keyframes.length;
  }

  /**
   * Get camera state at a specific time
   * Uses linear interpolation between pre-computed keyframes
   */
  getStateAtTime(time: number): CameraState {
    if (this.keyframes.length === 0) {
      return {
        position: { x: 0, y: 10, z: 40 },
        lookAt: { x: 0, y: 0, z: 0 },
      };
    }

    // Clamp time to valid range
    const clampedTime = Math.max(0, Math.min(time, this._duration));

    // Find keyframe index
    const keyframeIndex = clampedTime * this.keyframeRate;
    const lowerIndex = Math.floor(keyframeIndex);
    const upperIndex = Math.min(lowerIndex + 1, this.keyframes.length - 1);

    // Handle edge case
    if (lowerIndex >= this.keyframes.length - 1) {
      const last = this.keyframes[this.keyframes.length - 1];
      return { position: last.position, lookAt: last.lookAt };
    }

    // Interpolate between keyframes
    const lower = this.keyframes[lowerIndex];
    const upper = this.keyframes[upperIndex];
    const t = keyframeIndex - lowerIndex;

    return {
      position: lerpPosition(lower.position, upper.position, t),
      lookAt: lerpPosition(lower.lookAt, upper.lookAt, t),
    };
  }

  private buildTimeline(sequence: CameraSequence): void {
    let currentTime = 0;

    // Initialize from the first step's position if it's a snapTo or moveTo
    const firstStep = sequence.steps[0];
    const initFromFirst =
      (firstStep?.type === 'snapTo' || firstStep?.type === 'moveTo') && firstStep.position;
    let currentPosition =
      initFromFirst && firstStep.position ? { ...firstStep.position } : { x: 0, y: 10, z: 40 };
    let currentLookAt =
      initFromFirst && firstStep.lookAt ? { ...firstStep.lookAt } : { x: 0, y: 0, z: 0 };

    // Orbit state
    let orbitConfig: {
      distance: number;
      height: number;
      speed: number;
      lookAt: { x: number; y: number; z: number };
    } | null = null;
    let orbitAngle = 0;

    for (const step of sequence.steps) {
      switch (step.type) {
        case 'snapTo': {
          if (!step.position || !step.lookAt) break;
          currentPosition = { ...step.position };
          currentLookAt = { ...step.lookAt };
          orbitConfig = null;
          break;
        }

        case 'moveTo': {
          if (!step.position || !step.lookAt) break;

          const duration = step.duration || 2;
          const ease = step.ease || 'power2.inOut';
          const easingFn = getEasing(ease);

          const startPosition = { ...currentPosition };
          const startLookAt = { ...currentLookAt };
          const endPosition = step.position;
          const endLookAt = step.lookAt;

          const keyframeCount = Math.ceil(duration * this.keyframeRate);

          for (let i = 0; i <= keyframeCount; i++) {
            const t = i / keyframeCount;
            const easedT = easingFn(t);

            this.keyframes.push({
              time: currentTime + t * duration,
              position: lerpPosition(startPosition, endPosition, easedT),
              lookAt: lerpPosition(startLookAt, endLookAt, easedT),
            });
          }

          currentTime += duration;
          currentPosition = { ...endPosition };
          currentLookAt = { ...endLookAt };
          orbitConfig = null;
          break;
        }

        case 'transitionOrbit': {
          if (!step.orbitConfig) break;

          const duration = step.duration || 2;
          const ease = step.ease || 'power2.inOut';
          const easingFn = getEasing(ease);

          const currentDistance = Math.sqrt(currentPosition.x ** 2 + currentPosition.z ** 2);
          const startDistance: number = orbitConfig?.distance ?? currentDistance;
          const startHeight: number = orbitConfig?.height ?? currentPosition.y;
          const startSpeed: number = orbitConfig?.speed ?? 10;

          const endDistance: number = step.orbitConfig.distance ?? startDistance;
          const endHeight: number = step.orbitConfig.height ?? startHeight;
          const endSpeed: number = step.orbitConfig.speed ?? startSpeed;
          const targetLookAt = step.orbitConfig.lookAt ?? { x: 0, y: 0, z: 0 };

          // Initialize orbit angle from current position if not already orbiting
          if (!orbitConfig) {
            orbitAngle = Math.atan2(currentPosition.x, currentPosition.z);
          }

          const startLookAt = { ...currentLookAt };
          const keyframeCount = Math.ceil(duration * this.keyframeRate);

          for (let i = 0; i <= keyframeCount; i++) {
            const t = i / keyframeCount;
            const easedT = easingFn(t);
            const localTime = t * duration;

            // Interpolate orbit params
            const dist = lerp(startDistance, endDistance, easedT);
            const h = lerp(startHeight, endHeight, easedT);
            const spd = lerp(startSpeed, endSpeed, easedT);

            // Continue rotating during transition
            const angleOffset = ((spd * Math.PI) / 180) * localTime;
            const angle = orbitAngle + angleOffset;

            this.keyframes.push({
              time: currentTime + localTime,
              position: {
                x: Math.sin(angle) * dist,
                y: h,
                z: Math.cos(angle) * dist,
              },
              lookAt: lerpPosition(startLookAt, targetLookAt, easedT),
            });
          }

          // Update orbit state
          const finalAngleOffset = ((lerp(startSpeed, endSpeed, 0.5) * Math.PI) / 180) * duration;
          orbitAngle += finalAngleOffset;
          orbitConfig = {
            distance: endDistance,
            height: endHeight,
            speed: endSpeed,
            lookAt: targetLookAt,
          };

          currentTime += duration;
          currentPosition = {
            x: Math.sin(orbitAngle) * endDistance,
            y: endHeight,
            z: Math.cos(orbitAngle) * endDistance,
          };
          currentLookAt = { ...targetLookAt };
          break;
        }

        case 'startOrbit': {
          if (!step.orbitConfig) break;

          // Initialize orbit from current position
          orbitAngle = Math.atan2(currentPosition.x, currentPosition.z);
          orbitConfig = {
            distance:
              step.orbitConfig.distance ??
              Math.sqrt(currentPosition.x ** 2 + currentPosition.z ** 2),
            height: step.orbitConfig.height ?? currentPosition.y,
            speed: step.orbitConfig.speed ?? 10,
            lookAt: step.orbitConfig.lookAt ?? { x: 0, y: 0, z: 0 },
          };
          currentLookAt = { ...orbitConfig.lookAt };
          break;
        }

        case 'stopOrbit': {
          orbitConfig = null;
          break;
        }

        case 'delay': {
          const duration = step.duration || 1;
          const keyframeCount = Math.ceil(duration * this.keyframeRate);

          for (let i = 0; i <= keyframeCount; i++) {
            const t = i / keyframeCount;
            const localTime = t * duration;

            if (orbitConfig) {
              // Continue orbiting during delay
              const angleOffset = ((orbitConfig.speed * Math.PI) / 180) * localTime;
              const angle = orbitAngle + angleOffset;

              this.keyframes.push({
                time: currentTime + localTime,
                position: {
                  x: Math.sin(angle) * orbitConfig.distance,
                  y: orbitConfig.height,
                  z: Math.cos(angle) * orbitConfig.distance,
                },
                lookAt: { ...orbitConfig.lookAt },
              });
            } else {
              // Static position during delay
              this.keyframes.push({
                time: currentTime + localTime,
                position: { ...currentPosition },
                lookAt: { ...currentLookAt },
              });
            }
          }

          if (orbitConfig) {
            const angleOffset = ((orbitConfig.speed * Math.PI) / 180) * duration;
            orbitAngle += angleOffset;
            currentPosition = {
              x: Math.sin(orbitAngle) * orbitConfig.distance,
              y: orbitConfig.height,
              z: Math.cos(orbitAngle) * orbitConfig.distance,
            };
          }

          currentTime += duration;
          break;
        }
      }
    }

    this._duration = currentTime;

    // Ensure at least one keyframe exists
    if (this.keyframes.length === 0) {
      this.keyframes.push({
        time: 0,
        position: currentPosition,
        lookAt: currentLookAt,
      });
    }
  }
}
