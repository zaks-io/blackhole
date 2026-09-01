import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'stats.js';
import { CameraController, FlyCamera } from '@/lib/camera';
import { defaultLensingParams, LensingParams } from '@/lib/passes/LensingPass';
import { CONFIG } from '@/lib/config';
import { DiagnosticsMode, ToggleState } from '@/lib/types';
import { detectHDRSupport, HDRSupport } from '@/lib/display';
import { CAMERA_PRESETS } from '@/lib/presets';
import { BinaryAudioController } from '@/lib/audio';
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
  private flyCamera!: FlyCamera;
  private clock!: THREE.Clock;

  // Controllers
  private _cameraController!: CameraController;
  private pipeline!: PostProcessingPipeline;
  private starfieldManager!: StarfieldManager;
  private audioController: BinaryAudioController;
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
    this.audioController = new BinaryAudioController();
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

    // Camera anchors resolve against live scene state every frame; the far
    // black hole's apparent position shifts as the camera nears the throat
    // and flips with every crossing
    const anchorScratch = new THREE.Vector3();
    this._cameraController.setAnchorResolver(() => {
      this.pipeline!.lensingPass.updateWormholeCameraChart(this.camera.position);
      return this.pipeline!.lensingPass.getWormholeFarBhApparentPos(
        anchorScratch,
        this.camera.position
      );
    });

    // Preset endpoints and sequence snap points are authored in near-universe
    // coordinates. Re-anchor only when the camera reaches that pose so chart
    // state and camera state cannot disagree for an intermediate frame.
    this._cameraController.setNearUniverseReanchorListener(() =>
      this.pipeline!.lensingPass.resetWormholeChart()
    );

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
    this.callbacks.onAudioControllerReady?.(this.audioController);

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

    this.flyCamera = new FlyCamera(
      this.camera,
      this.renderer.domElement,
      CONFIG.controls.flyMovementSpeed
    );
    this.flyCamera.pointerSpeed = CONFIG.controls.flyPointerSpeed;

    this._cameraController = new CameraController(this.camera, this.controls);
    this._cameraController.attachFlyCamera(this.flyCamera);
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

      // Clamp: after tab suspension getDelta() returns the whole hidden
      // duration, which would teleport fly/orbit cameras in one frame
      const deltaTime = Math.min(this.clock.getDelta(), 0.1);
      this.scaledTime += deltaTime * this.params.simulationSpeed;

      this._cameraController.update(deltaTime);

      if (!this._cameraController.isActive()) {
        this.controls.update();
      }

      this.pipeline.lensingPass.updateTime(this.scaledTime);
      this.camera.updateMatrixWorld();
      this.pipeline.lensingPass.updateCamera(this.camera);
      this.pipeline.updateEhtBlurForCamera(this.camera);

      // Update audio with full simulation state
      const binaryState = this.pipeline.lensingPass.getBinaryState();
      const camPos = this._cameraController.getPosition();
      const cameraDistance = this._cameraController.getDistance();

      // Calculate camera angle to orbital plane (XZ)
      // 0 = edge-on (camera at Y=0), π/2 = face-on (camera above)
      const cameraAngle = Math.atan2(Math.abs(camPos.y), Math.sqrt(camPos.x ** 2 + camPos.z ** 2));

      if (binaryState) {
        // Binary mode - pass full binary state
        this.audioController.update({
          isBinaryMode: true,
          orbitalPhase: binaryState.orbitalPhase,
          separation: binaryState.separation,
          cameraDistance,
          cameraPosition: { x: camPos.x, y: camPos.y, z: camPos.z },
          cameraAngle,
          diskOpacity: this.params.diskOpacity,
          diskOuterRadius: this.params.diskOuterRadius ?? 30,
          mass1: binaryState.mass1,
          bh1Pos: binaryState.bh1Pos,
          bh2Pos: binaryState.bh2Pos,
          gwChirpEnvelope: binaryState.gwChirpEnvelope,
          deltaTime,
        });
      } else {
        // Single BH mode - synthesize state with BH at origin
        this.audioController.update({
          isBinaryMode: false,
          orbitalPhase: this.scaledTime * 0.5, // Slow rotation for arpeggio variety
          separation: this.params.diskOuterRadius ?? 30, // Use disk radius for pulse rate
          cameraDistance,
          cameraPosition: { x: camPos.x, y: camPos.y, z: camPos.z },
          cameraAngle,
          diskOpacity: this.params.diskOpacity,
          diskOuterRadius: this.params.diskOuterRadius ?? 30,
          mass1: 1.0, // Single BH has all mass
          bh1Pos: { x: 0, z: 0 }, // At origin
          bh2Pos: { x: 0, z: 0 }, // Unused but required
          gwChirpEnvelope: 0, // No inspiral in single mode
          deltaTime,
        });
      }

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

  updateToggleState(state: ToggleState, diagnosticsMode?: DiagnosticsMode): void {
    const diagnosticsParams =
      diagnosticsMode === undefined
        ? {}
        : { overlayIsco: diagnosticsMode === 'anatomy' ? 1.0 : 0.0 };

    this.pipeline?.lensingPass.updateParams({
      ...diagnosticsParams,
      overlayEventHorizon: state.eventHorizon ? 1.0 : 0.0,
      diskOpacity: state.disk ? CONFIG.disk.opacity : 0.0,
      binaryEnabled: state.binary && !state.wormhole ? 1.0 : 0.0,
      wormholeEnabled: state.wormhole ? 1.0 : 0.0,
    });
    this.flyCamera?.setWormholeAttractor(state.wormhole ? CONFIG.wormhole.throatRadius : null);
    if (state.wormhole) {
      void this.ensureWormholeFarSky();
    }
  }

  // Loaded on first wormhole enable so black-hole sessions never pay for it
  private wormholeFarSkyLoad: Promise<void> | null = null;

  private ensureWormholeFarSky(): Promise<void> {
    this.wormholeFarSkyLoad ??= this.starfieldManager
      .loadFar(CONFIG.wormhole.farSky)
      .then(({ texture, exposure }) => {
        if (this.disposed) return;
        this.pipeline?.lensingPass.setStarfieldFar(
          texture,
          exposure * CONFIG.wormhole.farSkyExposure
        );
      });
    return this.wormholeFarSkyLoad;
  }

  async enableAudio(enabled: boolean): Promise<void> {
    if (enabled && !this.audioController.isInitialized()) {
      await this.audioController.initialize();
    }
    this.audioController.setEnabled(enabled);
  }

  getAudioController(): BinaryAudioController {
    return this.audioController;
  }

  private cleanup(): void {
    this.renderer?.dispose();
    this.controls?.dispose();
    this.flyCamera?.dispose();
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
    this.audioController?.dispose();
    this.renderer?.dispose();
    this.controls?.dispose();
    this.flyCamera?.dispose();

    if (this.stats?.dom) {
      this.stats.dom.remove();
    }
  }
}
