import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'stats.js';
import { CameraController } from '@/lib/camera';
import { defaultLensingParams, LensingParams } from '@/lib/passes/LensingPass';
import { CONFIG } from '@/lib/config';
import { ToggleState } from '@/lib/types';
import { detectHDRSupport, HDRSupport } from '@/lib/display';
import { CAMERA_PRESETS } from '@/lib/presets';
import { StarfieldManager } from './StarfieldManager';
import { PostProcessingPipeline } from './PostProcessingPipeline';
import { SimulationConfig, SimulationCallbacks, SimulationParams } from './types';

export class SimulationController {
  private config: SimulationConfig;
  private callbacks: SimulationCallbacks;

  // Three.js core
  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private clock!: THREE.Clock;

  // Controllers
  private _cameraController!: CameraController;
  private pipeline!: PostProcessingPipeline;
  private starfieldManager!: StarfieldManager;
  private stats: Stats | null = null;

  // State
  private hdrSupport!: HDRSupport;
  private params!: SimulationParams;
  private scaledTime = 0;
  private animationId?: number;
  private disposed = false;
  private resizeHandler?: () => void;

  constructor(config: SimulationConfig, callbacks: SimulationCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;

    // Detect HDR support
    this.hdrSupport = detectHDRSupport();
    console.log('HDR Support:', this.hdrSupport.details.join(', '));

    this.setupRenderer();
    this.setupCamera();
    this.setupControls();
    this.initializeClock();
    this.initializeParams();

    // Create starfield manager and load initial texture
    this.starfieldManager = new StarfieldManager(this.renderer);
    const starfieldTexture = await this.starfieldManager.load();

    if (this.disposed) {
      this.cleanup();
      return;
    }

    // Setup post-processing pipeline
    this.pipeline = new PostProcessingPipeline(this.renderer, starfieldTexture, this.params, {
      fxaaEnabled: this.params.fxaaEnabled,
      ehtBlurEnabled: this.params.ehtBlurEnabled,
      ehtBlurStrength: this.params.ehtBlurStrength,
      ehtBlurIterations: CONFIG.ehtBlur.iterations,
      bloomThreshold: this.params.bloomThreshold,
      bloomStrength: this.params.bloomStrength,
      bloomRadius: this.params.bloomRadius,
      bloomResolutionScale: CONFIG.bloom.resolutionScale,
    });

    // Setup stats if enabled
    if (this.config.showStats) {
      this.setupStats();
    }

    // Update step count based on resolution
    this.updateStepCount();

    // Setup resize handler
    this.resizeHandler = () => this.onWindowResize();
    window.addEventListener('resize', this.resizeHandler);

    // Hide loading screen
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.classList.add('hidden');
      setTimeout(() => loadingEl.remove(), 500);
    }

    // Notify callbacks
    this.callbacks.onCameraReady?.(this._cameraController);
    this.callbacks.onEhtBlurReady?.(this.pipeline.ehtBlurController);

    // Start animation loop
    this.animate();
  }

  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: CONFIG.renderer.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.renderer.pixelRatioMax));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 1.0);

    if (this.hdrSupport.hdr) {
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      console.log('HDR output enabled automatically');
    } else {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = CONFIG.renderer.toneMappingExposure;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.config.container.appendChild(this.renderer.domElement);
  }

  private setupCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / window.innerHeight,
      CONFIG.camera.near,
      CONFIG.camera.far
    );

    const preset = CAMERA_PRESETS[this.config.initialCameraPreset] || CAMERA_PRESETS.far;
    this.camera.position.set(preset.position.x, preset.position.y, preset.position.z);
    this.camera.lookAt(preset.lookAt.x, preset.lookAt.y, preset.lookAt.z);
  }

  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = CONFIG.controls.enableDamping;
    this.controls.dampingFactor = CONFIG.controls.dampingFactor;
    this.controls.minDistance = CONFIG.camera.minDistance * CONFIG.rs;
    this.controls.maxDistance = CONFIG.camera.maxDistance * CONFIG.rs;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this._cameraController = new CameraController(this.camera, this.controls);
  }

  private initializeClock(): void {
    this.clock = new THREE.Clock();
  }

  private initializeParams(): void {
    this.params = {
      ...defaultLensingParams,
      bloomThreshold: CONFIG.bloom.threshold,
      bloomStrength: CONFIG.bloom.strength,
      bloomRadius: CONFIG.bloom.radius,
      autoSteps: CONFIG.rayMarching.autoSteps,
      autoStepsMin: CONFIG.rayMarching.autoStepsMin,
      autoStepsMax: CONFIG.rayMarching.autoStepsMax,
      fxaaEnabled: CONFIG.antiAliasing.fxaaEnabled,
      supersampleLevel: CONFIG.antiAliasing.supersampleLevel,
      ehtBlurEnabled: this.config.initialEhtBlurEnabled,
      ehtBlurStrength: CONFIG.ehtBlur.strength,
      simulationSpeed: 3.0,
    };
  }

  private setupStats(): void {
    this.stats = new Stats();
    this.stats.showPanel(0);
    this.stats.dom.style.cssText =
      'position:fixed;bottom:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
    document.body.appendChild(this.stats.dom);
  }

  private updateStepCount(): void {
    if (!this.params.autoSteps) return;

    const width = window.innerWidth * this.renderer.getPixelRatio();
    const height = window.innerHeight * this.renderer.getPixelRatio();
    const pixels = width * height;

    const minPixels = 2_000_000;
    const maxPixels = 8_300_000;
    const minSteps = this.params.autoStepsMin;
    const maxSteps = this.params.autoStepsMax;

    const t = Math.max(0, Math.min(1, (pixels - minPixels) / (maxPixels - minPixels)));
    const steps = Math.round(maxSteps - t * (maxSteps - minSteps));

    this.params.maxSteps = steps;
    this.pipeline?.lensingPass.updateParams({ maxSteps: steps });

    console.log(
      `Resolution: ${width}x${height} (${(pixels / 1_000_000).toFixed(1)}M pixels) → ${steps} steps`
    );
  }

  private onWindowResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.pipeline?.updateResolution(width, height, this.renderer.getPixelRatio());

    this.updateStepCount();
  }

  private animate(): void {
    const loop = () => {
      if (this.disposed) return;

      this.animationId = requestAnimationFrame(loop);

      this.stats?.begin();

      const deltaTime = this.clock.getDelta();
      this.scaledTime += deltaTime * this.params.simulationSpeed;

      this._cameraController.update(deltaTime);

      if (!this._cameraController.isActive()) {
        this.controls.update();
      }

      this.pipeline.lensingPass.updateTime(this.scaledTime);
      this.camera.updateMatrixWorld();
      this.pipeline.lensingPass.updateCamera(this.camera);

      this.pipeline.render();

      this.stats?.end();
    };

    loop();
  }

  // Public getters
  get cameraController(): CameraController {
    return this._cameraController;
  }

  get lensingPass() {
    return this.pipeline?.lensingPass;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getControls(): OrbitControls {
    return this.controls;
  }

  getParams(): SimulationParams {
    return this.params;
  }

  getHdrSupport(): HDRSupport {
    return this.hdrSupport;
  }

  getStarfieldManager(): StarfieldManager {
    return this.starfieldManager;
  }

  getPipeline(): PostProcessingPipeline {
    return this.pipeline;
  }

  updateToggleState(state: ToggleState): void {
    this.pipeline?.lensingPass.updateParams({
      overlayIsco: state.isco ? 1.0 : 0.0,
      overlayEventHorizon: state.eventHorizon ? 1.0 : 0.0,
      overlayDoppler: state.doppler ? 1.0 : 0.0,
      overlayScale: state.scale ? 1.0 : 0.0,
      diskOpacity: state.disk ? CONFIG.disk.opacity : 0.0,
      jetsEnabled: state.jets ? 1.0 : 0.0,
    });
  }

  private cleanup(): void {
    this.renderer?.dispose();
    this.controls?.dispose();
    if (this.config.container.contains(this.renderer?.domElement)) {
      this.config.container.removeChild(this.renderer.domElement);
    }
  }

  dispose(): void {
    this.disposed = true;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    this.pipeline?.dispose();
    this.starfieldManager?.dispose();
    this.renderer?.dispose();
    this.controls?.dispose();

    if (this.stats?.dom) {
      this.stats.dom.remove();
    }
  }
}
