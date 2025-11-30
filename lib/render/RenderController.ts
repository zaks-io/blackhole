import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { LensingPass } from '../passes/LensingPass';
import { CameraTimeline } from './CameraTimeline';
import type { RenderQualityPreset, RenderProgress, RenderStatus } from './types';
import type { CameraSequence } from '../camera/CameraController';

export interface RenderControllerCallbacks {
  onProgress?: (progress: RenderProgress) => void;
  onStatusChange?: (status: RenderStatus) => void;
  onFrameComplete?: (frameIndex: number) => void;
  onRenderComplete?: () => void;
  onError?: (error: Error) => void;
}

export class RenderController {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private lensingPass: LensingPass;
  private timeline: CameraTimeline | null = null;

  private preset: RenderQualityPreset;
  private simulationSpeed: number;
  private callbacks: RenderControllerCallbacks;

  private status: RenderStatus = 'idle';
  private currentFrame: number = 0;
  private totalFrames: number = 0;
  private startTime: number = 0;
  private cancelled: boolean = false;

  // Original state to restore after rendering
  private originalRendererSize: { width: number; height: number } = { width: 0, height: 0 };
  private originalPixelRatio: number = 1;
  private originalMaxSteps: number = 100;
  private originalSupersampleLevel: number = 1;
  private originalLodEnabled: number = 1;

  constructor(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    composer: EffectComposer,
    lensingPass: LensingPass,
    preset: RenderQualityPreset,
    simulationSpeed: number = 3.0,
    callbacks: RenderControllerCallbacks = {}
  ) {
    this.renderer = renderer;
    this.camera = camera;
    this.composer = composer;
    this.lensingPass = lensingPass;
    this.preset = preset;
    this.simulationSpeed = simulationSpeed;
    this.callbacks = callbacks;
  }

  async startRender(sequence: CameraSequence): Promise<void> {
    if (this.status === 'rendering') {
      throw new Error('Already rendering');
    }

    this.cancelled = false;
    this.setStatus('rendering');
    this.startTime = performance.now();

    // Build camera timeline
    this.timeline = new CameraTimeline(sequence);
    this.totalFrames = Math.ceil(this.timeline.duration * this.preset.fps);
    this.currentFrame = 0;

    const { width, height } = this.preset.resolution;

    // Save original renderer state
    this.originalRendererSize = {
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
    };
    this.originalPixelRatio = this.renderer.getPixelRatio();

    // Configure renderer for offline rendering
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.lensingPass.updateResolution(width, height);

    // Save original lensing params and set high quality rendering params
    this.originalMaxSteps = 100;
    this.originalSupersampleLevel = 1;
    this.originalLodEnabled = 1;

    this.lensingPass.updateParams({
      maxSteps: this.preset.rayMarching.maxSteps,
      supersampleLevel: this.preset.supersampling,
      lodEnabled: 0,
    });

    // Update camera aspect ratio
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    try {
      await this.renderLoop();

      if (!this.cancelled) {
        this.setStatus('completed');
        this.callbacks.onRenderComplete?.();
      }
    } catch (error) {
      this.setStatus('idle');
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.cleanup();
    }
  }

  cancel(): void {
    if (this.status === 'rendering') {
      this.cancelled = true;
      this.setStatus('cancelled');
    }
  }

  getStatus(): RenderStatus {
    return this.status;
  }

  private async renderLoop(): Promise<void> {
    const frameDuration = 1 / this.preset.fps;

    for (let frame = 0; frame < this.totalFrames; frame++) {
      if (this.cancelled) break;

      this.currentFrame = frame;
      const frameTime = frame * frameDuration;

      // Update camera position from timeline
      const cameraState = this.timeline!.getStateAtTime(frameTime);
      this.camera.position.set(cameraState.position.x, cameraState.position.y, cameraState.position.z);
      this.camera.lookAt(cameraState.lookAt.x, cameraState.lookAt.y, cameraState.lookAt.z);
      this.camera.updateMatrixWorld();

      // Update shader uniforms
      this.lensingPass.updateTime(frameTime * this.simulationSpeed);
      this.lensingPass.updateCamera(this.camera);

      // Render to screen (includes all passes: lensing, FXAA, bloom, EHT blur)
      this.composer.renderToScreen = true;
      this.composer.render();

      // Capture directly from screen canvas
      await this.downloadFrame(frame);

      this.reportProgress();
      this.callbacks.onFrameComplete?.(frame);

      // Yield to UI thread
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  private async downloadFrame(frameIndex: number): Promise<void> {
    return new Promise((resolve) => {
      this.renderer.domElement.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `frame_${String(frameIndex).padStart(5, '0')}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
          resolve();
        },
        'image/png'
      );
    });
  }

  private reportProgress(): void {
    const elapsed = performance.now() - this.startTime;
    const framesCompleted = this.currentFrame + 1;
    const framesPerSecond = framesCompleted / (elapsed / 1000);
    const remainingFrames = this.totalFrames - framesCompleted;
    const estimatedRemainingMs = (remainingFrames / framesPerSecond) * 1000;

    const progress: RenderProgress = {
      currentFrame: this.currentFrame,
      totalFrames: this.totalFrames,
      elapsedMs: elapsed,
      estimatedRemainingMs: isFinite(estimatedRemainingMs) ? estimatedRemainingMs : 0,
      framesPerSecond: isFinite(framesPerSecond) ? framesPerSecond : 0,
    };

    this.callbacks.onProgress?.(progress);
  }

  private setStatus(status: RenderStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  private cleanup(): void {
    // Restore composer to render to screen
    this.composer.renderToScreen = true;

    // Restore renderer size and pixel ratio
    if (this.originalRendererSize.width > 0) {
      this.renderer.setPixelRatio(this.originalPixelRatio);
      this.renderer.setSize(this.originalRendererSize.width / this.originalPixelRatio, this.originalRendererSize.height / this.originalPixelRatio);
      this.composer.setSize(this.originalRendererSize.width / this.originalPixelRatio, this.originalRendererSize.height / this.originalPixelRatio);
      this.lensingPass.updateResolution(this.originalRendererSize.width / this.originalPixelRatio, this.originalRendererSize.height / this.originalPixelRatio);

      // Restore camera aspect ratio
      this.camera.aspect = (this.originalRendererSize.width / this.originalPixelRatio) / (this.originalRendererSize.height / this.originalPixelRatio);
      this.camera.updateProjectionMatrix();
    }

    // Restore original lensing params
    this.lensingPass.updateParams({
      maxSteps: this.originalMaxSteps,
      supersampleLevel: this.originalSupersampleLevel,
      lodEnabled: this.originalLodEnabled,
    });

    this.timeline = null;
  }

  dispose(): void {
    this.cancel();
    this.cleanup();
  }
}
