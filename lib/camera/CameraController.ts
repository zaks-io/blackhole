import * as THREE from 'three';
import { gsap } from 'gsap';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

export type SequenceStepType = 'snapTo' | 'moveTo' | 'transitionOrbit' | 'startOrbit' | 'stopOrbit' | 'delay';

export interface CameraSequenceStep {
  type: SequenceStepType;
  position?: { x: number; y: number; z: number };
  lookAt?: { x: number; y: number; z: number };
  orbitConfig?: Partial<OrbitConfig>;
  duration?: number;
  ease?: string;
}

export interface CameraSequence {
  name: string;
  steps: CameraSequenceStep[];
}

type ControlMode = 'manual' | 'cinematic' | 'orbit';

// ============================================================================
// CameraController
// ============================================================================

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private orbitControls: OrbitControls;
  private mode: ControlMode = 'manual';
  
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
        case 'moveTo':
          if (step.position && step.lookAt) {
            await this.moveTo(
              { position: step.position, lookAt: step.lookAt },
              { duration: step.duration ?? 2, ease: step.ease }
            );
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
            this.delayTimeoutId = setTimeout(() => {
              this.delayTimeoutId = null;
              resolve();
            }, (step.duration || 1) * 1000);
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
    
    // Toggle OrbitControls
    this.orbitControls.enabled = newMode === 'manual';
  }

  private killActiveTweens(): void {
    for (const tween of this.activeTweens) {
      tween.kill();
    }
    this.activeTweens = [];
  }

  private cleanupTween(tween: gsap.core.Tween): void {
    const index = this.activeTweens.indexOf(tween);
    if (index > -1) {
      this.activeTweens.splice(index, 1);
    }
  }
}

