import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _inward = new THREE.Vector3();
const _next = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _levelPose = new THREE.Matrix4();

export interface ThroatCapture {
  active: boolean;
  ramp: number;
}

// Seconds from entering the throat sphere to full homing on the origin
const CAPTURE_RAMP_TIME = 0.25;

// The universe-crossing chart map (see wormhole.glsl) is only continuous for
// paths that thread the exact origin, which a hand-flown path never does on
// its own. So the throat sphere captures inbound flights: entering it latches
// a capture that blends the flight direction toward the origin (full homing
// within CAPTURE_RAMP_TIME or by half the throat radius, whichever bites
// first) and cancels outward drift, guaranteeing a through-origin crossing,
// where the capture releases so the far side is free flight again. Matches
// the physics: the visible throat disk is exactly the set of aims with
// impact parameter < b, all of which transit. Preserves step length; ignores
// outbound flights so flying back out of the sphere after a crossing is free.
export function bendStepThroughThroat(
  step: THREE.Vector3,
  position: THREE.Vector3,
  throatRadius: number,
  capture: ThroatCapture,
  delta: number
): void {
  const dist = position.length();
  // Landing numerically on the origin is a completed transit; a capture that
  // somehow finds itself outside the sphere must not keep homing from afar
  if (dist < 1e-6 || (capture.active && dist >= throatRadius)) {
    capture.active = false;
    capture.ramp = 0;
    return;
  }

  if (!capture.active) {
    if (dist >= throatRadius) return;
    if (step.dot(position) >= 0) return; // outbound: free exit
    capture.active = true;
    capture.ramp = 0;
  }

  capture.ramp = Math.min(1, capture.ramp + delta / CAPTURE_RAMP_TIME);
  const pull = Math.max(
    capture.ramp,
    1 - THREE.MathUtils.smoothstep(dist, 0.5 * throatRadius, throatRadius)
  );

  const stepLength = step.length();
  _inward.copy(position).multiplyScalar(-1 / dist);
  step.divideScalar(stepLength).lerp(_inward, pull);

  // While the ramp builds, cancel outward radial motion so a grazing entry
  // cannot slip back out of the sphere before the pull takes hold
  const outward = step.dot(position) / dist;
  if (outward > 0) {
    step.addScaledVector(position, -outward / dist);
  }
  if (step.lengthSq() < 1e-12) {
    step.copy(_inward);
  }
  step.normalize().multiplyScalar(stepLength);

  // Crossing the origin this frame completes the transit
  if (position.dot(_next.copy(position).add(step)) < 0) {
    capture.active = false;
    capture.ramp = 0;
  }
}

/**
 * Free-flight camera: click captures the mouse for direct look control
 * (Esc releases it), WASD moves along the view direction, R/F move
 * vertically. No roll, so the horizon stays stable.
 */
export class FlyCamera {
  movementSpeed: number;

  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private look: PointerLockControls;
  private _enabled = false;

  // Wormhole throat radius when wormhole mode is on, else null
  private attractorRadius: number | null = null;
  private capture: ThroatCapture = { active: false, ramp: 0 };

  private moveState = { forward: 0, back: 0, left: 0, right: 0, up: 0, down: 0 };

  private forward = new THREE.Vector3();
  private rightDir = new THREE.Vector3();
  private step = new THREE.Vector3();

  private onKeyDown = (event: KeyboardEvent) => this.handleKey(event, 1);
  private onKeyUp = (event: KeyboardEvent) => this.handleKey(event, 0);
  private onClick = () => this.engagePointer();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, movementSpeed: number) {
    this.camera = camera;
    this.domElement = domElement;
    this.movementSpeed = movementSpeed;

    this.look = new PointerLockControls(camera, domElement);
    this.look.enabled = false;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    domElement.addEventListener('click', this.onClick);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (this._enabled === value) return;
    this._enabled = value;
    this.look.enabled = value;
    if (value) {
      // Level the horizon: pointer-lock look only ever changes yaw and pitch,
      // so any roll carried in from the previous camera mode would stick for
      // the whole flight. Rebuild the pose from the current forward direction
      // with world up.
      this.camera.getWorldDirection(this.forward);
      _levelPose.lookAt(_zero, this.forward, WORLD_UP);
      this.camera.quaternion.setFromRotationMatrix(_levelPose);
    }
    if (!value) {
      this.moveState = { forward: 0, back: 0, left: 0, right: 0, up: 0, down: 0 };
      if (this.look.isLocked) {
        this.look.unlock();
      }
    }
  }

  set pointerSpeed(value: number) {
    this.look.pointerSpeed = value;
  }

  /** Request mouse capture. Must be called during a user gesture. */
  engagePointer(): void {
    if (!this._enabled || this.look.isLocked) return;
    // Not PointerLockControls.lock(): that leaves the request promise
    // unhandled, and Chrome rejects it on missing user gesture or the ~1s
    // cooldown after Esc. Both are retryable (the next click works), so
    // swallow the rejection; the controls track lock state via the
    // pointerlockchange event either way.
    const request = this.domElement.requestPointerLock() as Promise<void> | undefined;
    request?.catch(() => {});
  }

  setWormholeAttractor(radius: number | null): void {
    this.attractorRadius = radius;
    this.capture.active = false;
    this.capture.ramp = 0;
  }

  update(delta: number): void {
    if (!this._enabled) return;

    const move = this.moveState;
    const speed = this.movementSpeed * delta;
    this.camera.getWorldDirection(this.forward);
    this.rightDir.setFromMatrixColumn(this.camera.matrix, 0);

    this.step
      .set(0, 0, 0)
      .addScaledVector(this.forward, (move.forward - move.back) * speed)
      .addScaledVector(this.rightDir, (move.right - move.left) * speed)
      .addScaledVector(WORLD_UP, (move.up - move.down) * speed);

    if (this.step.lengthSq() === 0) return;

    if (this.attractorRadius !== null) {
      bendStepThroughThroat(
        this.step,
        this.camera.position,
        this.attractorRadius,
        this.capture,
        delta
      );
    }
    this.camera.position.add(this.step);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.domElement.removeEventListener('click', this.onClick);
    this.enabled = false;
    this.look.dispose();
  }

  private handleKey(event: KeyboardEvent, pressed: 0 | 1): void {
    if (!this._enabled || event.altKey || event.ctrlKey || event.metaKey) return;
    switch (event.code) {
      case 'KeyW':
        this.moveState.forward = pressed;
        break;
      case 'KeyS':
        this.moveState.back = pressed;
        break;
      case 'KeyA':
        this.moveState.left = pressed;
        break;
      case 'KeyD':
        this.moveState.right = pressed;
        break;
      case 'KeyR':
        this.moveState.up = pressed;
        break;
      case 'KeyF':
        this.moveState.down = pressed;
        break;
    }
  }
}
