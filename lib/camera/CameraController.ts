import * as THREE from 'three';
import { gsap } from 'gsap';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FlyCamera } from './FlyCamera';

// ============================================================================
// Types
// ============================================================================

export interface CameraState {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
}

export interface TweenOptions {
  /** Duration in seconds (default: 2) */
  duration?: number;
  /** GSAP ease string (default: "power2.inOut") */
  ease?: string;
  /** Callback when tween completes */
  onComplete?: () => void;
}

export interface OrbitConfig {
  /** Distance from origin in world units */
  distance: number;
  /** Y offset (height) */
  height: number;
  /** Rotation speed in degrees per second */
  speed: number;
  /** Point to look at (default: origin) */
  lookAt?: { x: number; y: number; z: number };
  /** Preserve current orbit angle instead of calculating from position */
  preserveAngle?: boolean;
}

// ============================================================================
// Sequence Types
// ============================================================================

export type SequenceStepType =
  | 'snapTo'
  | 'moveTo'
  | 'transitionOrbit'
  | 'startOrbit'
  | 'stopOrbit'
  | 'delay';

/**
 * Named lookAt targets whose world position is only known at runtime,
 * resolved when the step starts via the resolver registered with
 * setAnchorResolver. 'farBlackHole' is the wormhole's far-universe black
 * hole, whose world position depends on the chart basis composed by
 * throat crossings (see LensingPass.getWormholeFarBhWorldPos).
 */
export type SequenceAnchor = 'farBlackHole';

export interface CameraSequenceStep {
  type: SequenceStepType;
  position?: { x: number; y: number; z: number };
  lookAt?: { x: number; y: number; z: number } | SequenceAnchor;
  orbitConfig?: Partial<OrbitConfig>;
  duration?: number;
  ease?: string;
}

export interface CameraSequence {
  name: string;
  steps: CameraSequenceStep[];
}

type ControlMode = 'manual' | 'cinematic' | 'orbit' | 'fly';

// ============================================================================
// CameraController
// ============================================================================

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private flyCamera: FlyCamera | null = null;
  private mode: ControlMode = 'manual';
  private flyDirection = new THREE.Vector3();

  // Internal state for tweening
  private currentLookAt = new THREE.Vector3(0, 0, 0);
  private targetLookAt = new THREE.Vector3(0, 0, 0);

  // Orbit state
  private orbitConfig: OrbitConfig | null = null;
  private orbitAngle = 0;

  // Active tweens for cleanup
  private activeTweens: gsap.core.Tween[] = [];

  // Sequence state
  private currentSequenceId = 0;
  private delayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private anchorResolver: ((anchor: SequenceAnchor) => { x: number; y: number; z: number }) | null =
    null;
  private nearUniverseReanchorListener: (() => void) | null = null;

  // Live anchor tracking: while set, update() re-resolves the anchor every
  // frame and slews the view toward it, so the camera follows a target that
  // moves mid-step (the far black hole's world position flips at a throat
  // crossing). Cleared by killActiveTweens() so any new motion takes over.
  private trackingAnchor: SequenceAnchor | null = null;
  private trackCurDir = new THREE.Vector3();
  private trackDesiredDir = new THREE.Vector3();
  private trackTargetPoint = new THREE.Vector3();
  private trackFullQuat = new THREE.Quaternion();
  private trackStepQuat = new THREE.Quaternion();
  // The anchor handover at a throat crossing is continuous for the aligned
  // transit, so this only absorbs residual jumps (or future unaligned
  // sequences): fast enough to complete a large swing within one step, slow
  // enough to read as a deliberate pan
  private static readonly TRACK_MAX_SLEW = THREE.MathUtils.degToRad(50);

  constructor(camera: THREE.PerspectiveCamera, orbitControls: OrbitControls) {
    this.camera = camera;
    this.orbitControls = orbitControls;

    // Initialize lookAt from current camera direction
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.currentLookAt.copy(this.camera.position).add(direction.multiplyScalar(10));
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Instantly set camera position and lookAt without animation
   */
  snapTo(state: CameraState): void {
    this.killActiveTweens();
    this.setMode('cinematic');

    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.currentLookAt.set(state.lookAt.x, state.lookAt.y, state.lookAt.z);
    this.targetLookAt.copy(this.currentLookAt);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Complete a non-physical relocation into the near-universe chart. The
   * camera pose and chart change in the same task, before either can render.
   */
  snapToNearUniverse(state: CameraState): void {
    this.snapTo(state);
    this.reanchorNearUniverse();
  }

  /**
   * Tween camera to a new position and lookAt target
   */
  moveTo(state: CameraState, options: TweenOptions = {}): Promise<void> {
    const { duration = 2, ease = 'power2.inOut', onComplete } = options;

    // Kill any active tweens
    this.killActiveTweens();

    // Enter cinematic mode
    this.setMode('cinematic');

    // Set target lookAt
    this.targetLookAt.set(state.lookAt.x, state.lookAt.y, state.lookAt.z);

    return new Promise((resolve) => {
      // Tween position
      const posTween = gsap.to(this.camera.position, {
        x: state.position.x,
        y: state.position.y,
        z: state.position.z,
        duration,
        ease,
      });

      // Tween lookAt
      const lookAtTween = gsap.to(this.currentLookAt, {
        x: state.lookAt.x,
        y: state.lookAt.y,
        z: state.lookAt.z,
        duration,
        ease,
        onUpdate: () => {
          this.camera.lookAt(this.currentLookAt);
        },
        onComplete: () => {
          this.cleanupTween(posTween);
          this.cleanupTween(lookAtTween);
          onComplete?.();
          resolve();
        },
      });

      this.activeTweens.push(posTween, lookAtTween);
    });
  }

  /**
   * Animate a preset relocation, then atomically interpret its final pose in
   * the near universe. Until completion the camera remains in its original
   * chart, rather than assigning that chart to near-universe coordinates.
   */
  moveToNearUniverse(state: CameraState, options: TweenOptions = {}): Promise<void> {
    const { onComplete, ...tweenOptions } = options;
    return this.moveTo(state, {
      ...tweenOptions,
      onComplete: () => {
        this.reanchorNearUniverse();
        onComplete?.();
      },
    });
  }

  /**
   * Start continuous orbit around origin
   */
  startOrbit(config: OrbitConfig): void {
    // Kill any active tweens
    this.killActiveTweens();

    this.orbitConfig = config;
    this.setMode('orbit');

    // Only calculate starting angle if not preserving (first start)
    if (!config.preserveAngle) {
      this.orbitAngle = Math.atan2(this.camera.position.x, this.camera.position.z);
    }

    // Set lookAt target
    if (config.lookAt) {
      this.targetLookAt.set(config.lookAt.x, config.lookAt.y, config.lookAt.z);
    } else {
      this.targetLookAt.set(0, 0, 0);
    }
    this.currentLookAt.copy(this.targetLookAt);
  }

  /**
   * Smoothly transition orbit parameters while maintaining continuous rotation
   */
  transitionOrbit(config: OrbitConfig, options: TweenOptions = {}): Promise<void> {
    const { duration = 2, ease = 'power2.inOut', onComplete } = options;

    // Kill any active tweens
    this.killActiveTweens();

    // If not already orbiting, start orbit first
    if (this.mode !== 'orbit' || !this.orbitConfig) {
      this.orbitAngle = Math.atan2(this.camera.position.x, this.camera.position.z);
      this.orbitConfig = { ...config };
      this.setMode('orbit');
    }

    // Set lookAt target
    if (config.lookAt) {
      this.targetLookAt.set(config.lookAt.x, config.lookAt.y, config.lookAt.z);
    } else {
      this.targetLookAt.set(0, 0, 0);
    }

    return new Promise((resolve) => {
      // Tween orbit config parameters
      const configTween = gsap.to(this.orbitConfig!, {
        distance: config.distance,
        height: config.height,
        speed: config.speed,
        duration,
        ease,
      });

      // Tween lookAt
      const lookAtTween = gsap.to(this.currentLookAt, {
        x: this.targetLookAt.x,
        y: this.targetLookAt.y,
        z: this.targetLookAt.z,
        duration,
        ease,
        onComplete: () => {
          this.cleanupTween(configTween);
          this.cleanupTween(lookAtTween);
          onComplete?.();
          resolve();
        },
      });

      this.activeTweens.push(configTween, lookAtTween);
    });
  }

  /**
   * Stop orbiting but stay in cinematic mode at current position
   */
  stopOrbit(): void {
    if (this.mode === 'orbit') {
      this.orbitConfig = null;
      this.setMode('cinematic');
    }
  }

  /**
   * Attach the free-flight camera (created by the simulation, which owns the
   * renderer DOM element). Disabled until startFly() enters fly mode.
   */
  attachFlyCamera(flyCamera: FlyCamera): void {
    this.flyCamera = flyCamera;
    flyCamera.enabled = false;
  }

  /**
   * Enter free-flight mode from the current camera pose. Called from a click
   * handler, so the pointer capture request counts as a user gesture.
   */
  startFly(): void {
    if (!this.flyCamera) {
      throw new Error('CameraController: no FlyCamera attached');
    }
    this.cancelSequence();
    this.orbitConfig = null;
    this.setMode('fly');
    this.flyCamera.engagePointer();
  }

  /**
   * Return to manual OrbitControls
   */
  returnToManual(): void {
    this.killActiveTweens();
    this.orbitConfig = null;
    this.setMode('manual');

    // Update OrbitControls target to match current lookAt
    this.orbitControls.target.copy(this.currentLookAt);
    this.orbitControls.update();
  }

  /**
   * Get current camera state (useful for LLM context)
   */
  getState(): CameraState {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      lookAt: {
        x: this.currentLookAt.x,
        y: this.currentLookAt.y,
        z: this.currentLookAt.z,
      },
    };
  }

  /**
   * Get current control mode
   */
  getMode(): ControlMode {
    return this.mode;
  }

  /**
   * Check if camera is currently under automated control
   */
  isActive(): boolean {
    return this.mode !== 'manual';
  }

  /**
   * Register the resolver for named sequence anchors. Owned by whoever knows
   * the scene state the anchors depend on (the simulation component).
   */
  setAnchorResolver(
    resolver: (anchor: SequenceAnchor) => { x: number; y: number; z: number }
  ): void {
    this.anchorResolver = resolver;
  }

  /** Register the simulation-owned near-universe chart re-anchor. */
  setNearUniverseReanchorListener(listener: () => void): void {
    this.nearUniverseReanchorListener = listener;
  }

  private reanchorNearUniverse(): void {
    if (!this.nearUniverseReanchorListener) {
      throw new Error('CameraController: no near-universe re-anchor registered');
    }
    this.nearUniverseReanchorListener();
  }

  private resolveAnchor(anchor: SequenceAnchor): { x: number; y: number; z: number } {
    if (!this.anchorResolver) {
      throw new Error(`CameraController: no anchor resolver registered for '${anchor}'`);
    }
    return this.anchorResolver(anchor);
  }

  /**
   * Tween the camera position while the view continuously pursues a live
   * anchor: update() re-resolves the anchor every frame and slews toward it.
   * Tracking persists after the tween so consecutive tracked steps (and the
   * sequence's end) hold the target; any other camera motion clears it.
   */
  private moveToTracking(
    position: { x: number; y: number; z: number },
    anchor: SequenceAnchor,
    options: TweenOptions = {}
  ): Promise<void> {
    const { duration = 2, ease = 'power2.inOut', onComplete } = options;

    this.killActiveTweens();
    this.setMode('cinematic');

    // Fail loud at step start, not on some mid-tween frame
    this.resolveAnchor(anchor);
    this.trackingAnchor = anchor;

    return new Promise((resolve) => {
      const posTween = gsap.to(this.camera.position, {
        x: position.x,
        y: position.y,
        z: position.z,
        duration,
        ease,
        onComplete: () => {
          this.cleanupTween(posTween);
          onComplete?.();
          resolve();
        },
      });

      this.activeTweens.push(posTween);
    });
  }

  /**
   * Run a multi-step camera sequence
   * Each step executes sequentially, with smooth transitions between them
   */
  async runSequence(sequence: CameraSequence): Promise<void> {
    const sequenceId = ++this.currentSequenceId;

    // Clear any pending delay
    if (this.delayTimeoutId) {
      clearTimeout(this.delayTimeoutId);
      this.delayTimeoutId = null;
    }

    for (const step of sequence.steps) {
      // Check if sequence was cancelled
      if (this.currentSequenceId !== sequenceId) return;

      switch (step.type) {
        case 'snapTo':
          if (step.position && step.lookAt) {
            if (typeof step.lookAt === 'string') {
              throw new Error('CameraController: snapTo requires a concrete lookAt target');
            }
            this.snapToNearUniverse({ position: step.position, lookAt: step.lookAt });
          }
          break;

        case 'moveTo':
          if (step.position && step.lookAt) {
            if (typeof step.lookAt === 'string') {
              await this.moveToTracking(step.position, step.lookAt, {
                duration: step.duration ?? 2,
                ease: step.ease,
              });
            } else {
              await this.moveTo(
                { position: step.position, lookAt: step.lookAt },
                { duration: step.duration ?? 2, ease: step.ease }
              );
            }
          }
          break;

        case 'transitionOrbit':
          if (step.orbitConfig) {
            await this.transitionOrbit(
              {
                distance: step.orbitConfig.distance ?? 20,
                height: step.orbitConfig.height ?? 1,
                speed: step.orbitConfig.speed ?? 1,
                lookAt: step.orbitConfig.lookAt,
                preserveAngle: step.orbitConfig.preserveAngle,
              },
              { duration: step.duration, ease: step.ease }
            );
          }
          break;

        case 'startOrbit':
          if (step.orbitConfig) {
            this.startOrbit({
              distance: step.orbitConfig.distance ?? 20,
              height: step.orbitConfig.height ?? 1,
              speed: step.orbitConfig.speed ?? 1,
              lookAt: step.orbitConfig.lookAt,
              preserveAngle: step.orbitConfig.preserveAngle,
            });
          }
          break;

        case 'stopOrbit':
          this.stopOrbit();
          break;

        case 'delay':
          await new Promise<void>((resolve) => {
            this.delayTimeoutId = setTimeout(
              () => {
                this.delayTimeoutId = null;
                resolve();
              },
              (step.duration || 1) * 1000
            );
          });
          break;
      }
    }
  }

  /**
   * Cancel any running sequence
   */
  cancelSequence(): void {
    this.currentSequenceId++;
    if (this.delayTimeoutId) {
      clearTimeout(this.delayTimeoutId);
      this.delayTimeoutId = null;
    }
    this.killActiveTweens();
  }

  /**
   * Get distance from camera to origin (in world units)
   */
  getDistance(): number {
    return this.camera.position.length();
  }

  /**
   * Get the camera position as a plain object
   */
  getPosition(): { x: number; y: number; z: number } {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };
  }

  /**
   * Project a 3D world position to normalized device coordinates (-1 to 1)
   * Returns null if the point is behind the camera
   */
  projectToNDC(worldPos: { x: number; y: number; z: number }): { x: number; y: number } | null {
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.project(this.camera);

    // Check if behind camera (z > 1 in NDC means behind)
    if (vec.z > 1) return null;

    return { x: vec.x, y: vec.y };
  }

  /**
   * Project a world position to NDC without discarding points behind the
   * camera: behind points get their direction mirrored so the result still
   * says which way to turn toward them. Used by the fly-mode target
   * indicator, which must point somewhere for every camera pose.
   */
  projectForIndicator(worldPos: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    behind: boolean;
  } {
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.applyMatrix4(this.camera.matrixWorldInverse);
    const behind = vec.z >= 0;
    vec.applyMatrix4(this.camera.projectionMatrix);
    // The perspective divide flips signs behind the camera; mirror back so
    // x/y point the shortest way around toward the target
    return behind ? { x: -vec.x, y: -vec.y, behind } : { x: vec.x, y: vec.y, behind };
  }

  /**
   * Project a 3D world position to screen coordinates (pixels)
   * Returns null if the point is behind the camera
   */
  projectToScreen(
    worldPos: { x: number; y: number; z: number },
    screenWidth: number,
    screenHeight: number
  ): { x: number; y: number } | null {
    const ndc = this.projectToNDC(worldPos);
    if (!ndc) return null;

    return {
      x: (ndc.x + 1) * 0.5 * screenWidth,
      y: (-ndc.y + 1) * 0.5 * screenHeight,
    };
  }

  /**
   * Update loop - call this every frame
   */
  update(deltaTime: number): void {
    if (this.mode === 'cinematic' && this.trackingAnchor) {
      const target = this.resolveAnchor(this.trackingAnchor);
      this.trackTargetPoint.set(target.x, target.y, target.z);
      this.trackDesiredDir.copy(this.trackTargetPoint).sub(this.camera.position);
      const targetDist = this.trackDesiredDir.length();
      if (targetDist > 1e-6) {
        this.trackDesiredDir.divideScalar(targetDist);
        this.camera.getWorldDirection(this.trackCurDir);
        const angle = this.trackCurDir.angleTo(this.trackDesiredDir);
        if (angle > 1e-6) {
          // Slew-rate limit: the anchor can jump a large angle in one frame
          // (the chart flip at a throat crossing); a capped rotation turns
          // that into a steady pan instead of a whip
          const stepFraction = Math.min(1, (CameraController.TRACK_MAX_SLEW * deltaTime) / angle);
          this.trackFullQuat.setFromUnitVectors(this.trackCurDir, this.trackDesiredDir);
          this.trackStepQuat.identity().slerp(this.trackFullQuat, stepFraction);
          this.trackCurDir.applyQuaternion(this.trackStepQuat);
        }
        this.currentLookAt.copy(this.camera.position).addScaledVector(this.trackCurDir, targetDist);
        this.targetLookAt.copy(this.trackTargetPoint);
        this.camera.lookAt(this.currentLookAt);
      }
    }

    if (this.mode === 'fly' && this.flyCamera) {
      this.flyCamera.update(deltaTime);

      // Keep the lookAt state coherent so getState(), projections, and the
      // transition out of fly mode all see where the camera actually points
      this.camera.getWorldDirection(this.flyDirection);
      this.currentLookAt.copy(this.camera.position).add(this.flyDirection.multiplyScalar(10));
      return;
    }

    if (this.mode === 'orbit' && this.orbitConfig) {
      // Update orbit angle
      const speedRad = THREE.MathUtils.degToRad(this.orbitConfig.speed);
      this.orbitAngle += speedRad * deltaTime;

      // Calculate new position
      const x = Math.sin(this.orbitAngle) * this.orbitConfig.distance;
      const z = Math.cos(this.orbitAngle) * this.orbitConfig.distance;
      const y = this.orbitConfig.height;

      this.camera.position.set(x, y, z);
      this.camera.lookAt(this.currentLookAt);
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setMode(newMode: ControlMode): void {
    if (this.mode === newMode) return;

    this.mode = newMode;

    // Exactly one control scheme owns the camera at a time
    this.orbitControls.enabled = newMode === 'manual';
    if (this.flyCamera) {
      this.flyCamera.enabled = newMode === 'fly';
    }
  }

  private killActiveTweens(): void {
    for (const tween of this.activeTweens) {
      tween.kill();
    }
    this.activeTweens = [];
    this.trackingAnchor = null;
  }

  private cleanupTween(tween: gsap.core.Tween): void {
    const index = this.activeTweens.indexOf(tween);
    if (index > -1) {
      this.activeTweens.splice(index, 1);
    }
  }
}
