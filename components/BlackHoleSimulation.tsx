'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { blurTexture } from '@/lib/utils/blurTexture';
import GUI from 'lil-gui';
import gsap from 'gsap';
import Stats from 'stats.js';

import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { LensingPass, defaultLensingParams, LensingParams } from '@/lib/passes/LensingPass';
import { CONFIG } from '@/lib/config';
import { CameraController, CameraSequence } from '@/lib/camera';
import { ToggleState } from '@/lib/types';

export interface CameraPreset {
  name: string;
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  duration?: number;
  ease?: string;
}

export interface EhtBlurController {
  setEnabled: (enabled: boolean) => void;
  isEnabled: () => boolean;
}

export interface BlackHoleSimulationProps {
  /** Show lil-gui dev controls panel (default: false) */
  showDevControls?: boolean;
  /** Show FPS stats counter (default: false) */
  showStats?: boolean;
  /** Initial camera preset key (default: 'far') */
  initialCameraPreset?: keyof typeof CAMERA_PRESETS;
  /** Initial EHT blur enabled state (default: CONFIG.ehtBlur.enabled) */
  initialEhtBlurEnabled?: boolean;
  /** Toggle visibility state */
  toggleState?: ToggleState;
  /** Callback with camera controller when ready */
  onCameraReady?: (controller: CameraController) => void;
  /** Callback with EHT blur controller when ready */
  onEhtBlurReady?: (controller: EhtBlurController) => void;
}

export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  far: {
    name: 'Far',
    position: { x: -25, y: 5, z: 45 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 3,
  },
  default: {
    name: 'Default',
    position: { x: 0, y: 1, z: 20 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 2,
  },
  accretionDisk: {
    name: 'Accretion Disk',
    position: { x: 8, y: 2, z: 8 },
    lookAt: { x: -3, y: -2, z: 0 },
    duration: 3,
  },
  topDown: {
    name: 'Top Down',
    position: { x: 0, y: 25, z: 1 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 3,
  },
  edgeOn: {
    name: 'Edge On',
    position: { x: 20, y: 0.1, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 3,
  },
  eht: {
    name: 'EHT View',
    position: { x: 30, y: 50, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 2.5,
    ease: 'power2.inOut',
  },
  photonSphere: {
    name: 'Photon Sphere',
    position: { x: 2, y: 1.5, z: 5 },
    lookAt: { x: 0, y: 0, z: 0 },
    duration: 2.5,
  },
};

export const STARFIELD_BACKGROUNDS = {
  milkyWay: { name: 'Milky Way', path: '/textures/starmap_4k.webp', hdr: false, exposure: 0.5 },
  milkyWayHdr: {
    name: 'Milky Way HDR',
    path: '/textures/starmap_2020_4k.exr',
    hdr: true,
    exposure: 0.5,
  },
  nebulaBlue: {
    name: 'Blue Nebula',
    path: '/textures/HDR_rich_blue_nebulae_1_4k.exr',
    hdr: true,
    exposure: 1.0,
  },
  nebulaPlanet: {
    name: 'Planet Nebula',
    path: '/textures/HDR_artificial_planet_4k.exr',
    hdr: true,
    exposure: 1.0,
  },
  nebulaHazy: {
    name: 'Hazy Nebula',
    path: '/textures/HDR_hazy_nebulae_4k.exr',
    hdr: true,
    exposure: 5.0,
  },
  nebulaMulti: {
    name: 'Multi Nebula',
    path: '/textures/HDR_rich_multi_nebulae_2_4k.exr',
    hdr: true,
    exposure: 0.5,
  },
} as const;

export type StarfieldKey = keyof typeof STARFIELD_BACKGROUNDS;

export const CAMERA_SEQUENCES: Record<string, CameraSequence> = {
  fallIn: {
    name: 'Fall In',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 10, z: 40 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 1.3, y: 1.3, z: 0 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power2.in',
      },
      {
        type: 'moveTo',
        position: { x: 1.3, y: 1.3, z: 8 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 4,
        ease: 'power2.out',
      },
    ],
  },

  warpingTour: {
    name: 'Warping Tour',
    steps: [
      {
        type: 'snapTo',
        position: { x: 4, y: 1, z: 3 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      // Closer view of photon rings
      {
        type: 'moveTo',
        position: { x: 2, y: 1, z: 2 },
        lookAt: { x: 1.6, y: 0, z: 0 },
        duration: 4,
        ease: 'power1.inOut',
      },
      // Shadow covers entire camera
      {
        type: 'moveTo',
        position: { x: 1.5, y: 0.3, z: 1.5 },
        lookAt: { x: 0, y: 0.3, z: 0 },
        duration: 4,
        ease: 'power1.in',
      },
      // Emerge to see photon ring nearly touch accretion disk. Grandiose moment.
      {
        type: 'moveTo',
        position: { x: 1.5, y: 0.01, z: 1.5 },
        lookAt: { x: -40, y: 0.01, z: 40 },
        duration: 8,
        ease: 'power1.out',
      },
      // Pan to top down view
      {
        type: 'moveTo',
        position: { x: 1.5, y: 10, z: 1.5 },
        lookAt: { x: -0.1, y: 0.01, z: 0.01 },
        duration: 16,
        ease: 'power1.inOut',
      },
    ],
  },

  shadowExplore: {
    name: 'Shadow Explore',
    steps: [
      {
        type: 'snapTo',
        position: { x: 0, y: 0.3, z: 5 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      {
        type: 'moveTo',
        position: { x: 2, y: 1, z: 2 },
        lookAt: { x: 1.6, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0.01, z: 3 },
        lookAt: { x: 1.6, y: 0.01, z: 1.6 },
        duration: 6,
        ease: 'power1.inOut',
      },
      {
        type: 'moveTo',
        position: { x: 0, y: 0.3, z: 5 },
        lookAt: { x: 0, y: 0, z: 0 },
        duration: 6,
        ease: 'power1.inOut',
      },
    ],
  },
};

export default function BlackHoleSimulation({
  showDevControls = false,
  showStats = false,
  initialCameraPreset = 'far',
  initialEhtBlurEnabled = CONFIG.ehtBlur.enabled,
  toggleState,
  onCameraReady,
  onEhtBlurReady,
}: BlackHoleSimulationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const currentInitIdRef = useRef(0);

  // Store refs to objects that need cleanup
  const cleanupRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    composer?: EffectComposer;
    controls?: OrbitControls;
    gui?: GUI;
    stats?: Stats;
    lensingPass?: LensingPass;
    animationId?: number;
    blurPasses?: { h: ShaderPass; v: ShaderPass }[];
  }>({});

  const init = useCallback(
    async (initId: number) => {
      if (!containerRef.current || initRef.current) return;
      initRef.current = true;

      const container = containerRef.current;

      // Helper to check if this init instance is still valid
      const isStillValid = () => currentInitIdRef.current === initId;

      // Create renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: CONFIG.renderer.antialias,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.renderer.pixelRatioMax));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = CONFIG.renderer.toneMappingExposure;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 1.0);
      container.appendChild(renderer.domElement);
      cleanupRef.current.renderer = renderer;

      // Create camera - start at specified preset position
      const camera = new THREE.PerspectiveCamera(
        CONFIG.camera.fov,
        window.innerWidth / window.innerHeight,
        CONFIG.camera.near,
        CONFIG.camera.far
      );
      const initialPreset = CAMERA_PRESETS[initialCameraPreset];
      camera.position.set(
        initialPreset.position.x,
        initialPreset.position.y,
        initialPreset.position.z
      );
      camera.lookAt(initialPreset.lookAt.x, initialPreset.lookAt.y, initialPreset.lookAt.z);

      // Create controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = CONFIG.controls.enableDamping;
      controls.dampingFactor = CONFIG.controls.dampingFactor;
      controls.minDistance = CONFIG.camera.minDistance * CONFIG.rs;
      controls.maxDistance = CONFIG.camera.maxDistance * CONFIG.rs;
      controls.target.set(0, 0, 0);
      controls.update();
      cleanupRef.current.controls = controls;

      // Create camera controller for cinematic movements
      const cameraController = new CameraController(camera, controls);

      // Initialize clock
      const clock = new THREE.Clock();

      // Params state
      const params: LensingParams & {
        bloomThreshold: number;
        bloomStrength: number;
        bloomRadius: number;
        autoSteps: boolean;
        autoStepsMin: number;
        autoStepsMax: number;
        fxaaEnabled: boolean;
        ehtBlurEnabled: boolean;
        ehtBlurStrength: number;
        simulationSpeed: number;
      } = {
        ...defaultLensingParams,
        bloomThreshold: CONFIG.bloom.threshold,
        bloomStrength: CONFIG.bloom.strength,
        bloomRadius: CONFIG.bloom.radius,
        autoSteps: CONFIG.rayMarching.autoSteps,
        autoStepsMin: CONFIG.rayMarching.autoStepsMin,
        autoStepsMax: CONFIG.rayMarching.autoStepsMax,
        fxaaEnabled: CONFIG.antiAliasing.fxaaEnabled,
        supersampleLevel: CONFIG.antiAliasing.supersampleLevel,
        ehtBlurEnabled: initialEhtBlurEnabled,
        ehtBlurStrength: CONFIG.ehtBlur.strength,
        simulationSpeed: 3.0,
      };

      // EHT blur animation state
      const ehtBlurState = { intensity: initialEhtBlurEnabled ? 1.0 : 0.0 };

      // Scaled simulation time (accumulates based on simulationSpeed)
      let scaledTime = 0;

      // Composer and passes (will be set after texture loads)
      let composer: EffectComposer;
      let lensingPass: LensingPass;
      let fxaaPass: ShaderPass;
      let bloomPass: UnrealBloomPass;
      let blurPasses: { h: ShaderPass; v: ShaderPass }[] = [];

      const loadStarfield = (
        path: string = STARFIELD_BACKGROUNDS.milkyWay.path,
        isHdr: boolean = STARFIELD_BACKGROUNDS.milkyWay.hdr
      ): Promise<THREE.Texture> => {
        return new Promise((resolve) => {
          if (isHdr) {
            const isExr = path.endsWith('.exr');
            const hdrLoader = isExr ? new EXRLoader() : new RGBELoader();
            hdrLoader.load(
              path,
              (texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                resolve(texture);
              },
              undefined,
              () => {
                console.error('Error loading HDR starfield, using fallback');
                resolve(createFallbackStarfield());
              }
            );
          } else {
            const loader = new THREE.TextureLoader();
            loader.load(
              path,
              (texture: THREE.Texture) => {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;

                // Blur to smooth compression artifacts (only for non-HDR)
                const blurredTexture = blurTexture(renderer, texture, 0.1, 1, 1.0);
                blurredTexture.mapping = THREE.EquirectangularReflectionMapping;
                blurredTexture.wrapS = THREE.RepeatWrapping;
                blurredTexture.wrapT = THREE.ClampToEdgeWrapping;

                texture.dispose();
                resolve(blurredTexture);
              },
              undefined,
              () => {
                console.error('Error loading starfield, using fallback');
                resolve(createFallbackStarfield());
              }
            );
          }
        });
      };

      const createFallbackStarfield = (): THREE.Texture => {
        const width = 2048;
        const height = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 3000; i++) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const brightness = Math.random();
          const starSize = Math.random() * 1.5 + 0.5;

          ctx.fillStyle = `rgba(255, 255, ${200 + Math.random() * 55}, ${brightness})`;
          ctx.beginPath();
          ctx.arc(x, y, starSize, 0, Math.PI * 2);
          ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        return texture;
      };

      const setupPostProcessing = (starfieldTexture: THREE.Texture) => {
        // Use HalfFloatType for render targets - sufficient precision with half the memory
        const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        });
        composer = new EffectComposer(renderer, renderTarget);
        cleanupRef.current.composer = composer;

        lensingPass = new LensingPass(starfieldTexture, CONFIG.noise.textureSize);
        lensingPass.updateResolution(window.innerWidth, window.innerHeight);
        lensingPass.updateParams(params);
        composer.addPass(lensingPass);
        cleanupRef.current.lensingPass = lensingPass;

        fxaaPass = new ShaderPass(FXAAShader);
        fxaaPass.uniforms['resolution'].value.set(
          1 / (window.innerWidth * renderer.getPixelRatio()),
          1 / (window.innerHeight * renderer.getPixelRatio())
        );
        fxaaPass.enabled = params.fxaaEnabled;
        composer.addPass(fxaaPass);

        // Use scaled resolution for bloom (default 0.5x for performance)
        const bloomResScale = CONFIG.bloom.resolutionScale;
        const bloomRes = new THREE.Vector2(
          Math.floor(window.innerWidth * bloomResScale),
          Math.floor(window.innerHeight * bloomResScale)
        );
        bloomPass = new UnrealBloomPass(
          bloomRes,
          params.bloomStrength,
          params.bloomRadius,
          params.bloomThreshold
        );
        composer.addPass(bloomPass);

        // EHT blur passes (multiple iterations for heavy blur)
        // Disabled by default since starfield is pre-blurred
        const iterations = CONFIG.ehtBlur.iterations;
        for (let i = 0; i < iterations; i++) {
          const hBlurPass = new ShaderPass(HorizontalBlurShader);
          const vBlurPass = new ShaderPass(VerticalBlurShader);

          // Set blur strength based on resolution and intensity
          const blurAmount = params.ehtBlurStrength * ehtBlurState.intensity;
          hBlurPass.uniforms['h'].value = blurAmount / window.innerWidth;
          vBlurPass.uniforms['v'].value = blurAmount / window.innerHeight;

          // Disabled by default (starfield is pre-blurred)
          hBlurPass.enabled = params.ehtBlurEnabled;
          vBlurPass.enabled = params.ehtBlurEnabled;

          composer.addPass(hBlurPass);
          composer.addPass(vBlurPass);

          blurPasses.push({ h: hBlurPass, v: vBlurPass });
        }
        cleanupRef.current.blurPasses = blurPasses;

        updateStepCount();
      };

      // Update blur passes strength and enabled state
      const updateBlurStrength = (intensity: number) => {
        const blurAmount = params.ehtBlurStrength * intensity;
        const enabled = intensity > 0;
        blurPasses.forEach(({ h, v }) => {
          h.uniforms['h'].value = blurAmount / window.innerWidth;
          v.uniforms['v'].value = blurAmount / window.innerHeight;
          h.enabled = enabled;
          v.enabled = enabled;
        });
      };

      // Toggle EHT blur with animation
      const setEhtBlurEnabled = (enabled: boolean) => {
        params.ehtBlurEnabled = enabled;
        gsap.killTweensOf(ehtBlurState);

        gsap.to(ehtBlurState, {
          intensity: enabled ? 1.0 : 0.0,
          duration: enabled ? 0.8 : 0.6,
          ease: enabled ? 'power2.in' : 'power2.out',
          onUpdate: () => updateBlurStrength(ehtBlurState.intensity),
        });
      };

      const updateStepCount = () => {
        if (!params.autoSteps) return;

        const width = window.innerWidth * renderer.getPixelRatio();
        const height = window.innerHeight * renderer.getPixelRatio();
        const pixels = width * height;

        const minPixels = 2_000_000;
        const maxPixels = 8_300_000;
        const minSteps = params.autoStepsMin;
        const maxSteps = params.autoStepsMax;

        const t = Math.max(0, Math.min(1, (pixels - minPixels) / (maxPixels - minPixels)));
        const steps = Math.round(maxSteps - t * (maxSteps - minSteps));

        params.maxSteps = steps;
        if (lensingPass) {
          lensingPass.updateParams({ maxSteps: steps });
        }

        console.log(
          `Resolution: ${width}x${height} (${(pixels / 1_000_000).toFixed(
            1
          )}M pixels) → ${steps} steps`
        );
      };

      // Track starfield transition state
      let isTransitioning = false;

      // Swap starfield texture with crossfade
      const swapStarfield = async (
        key: StarfieldKey,
        exposureController?: { setValue: (v: number) => void }
      ) => {
        if (!lensingPass || isTransitioning) return;

        const bg = STARFIELD_BACKGROUNDS[key];
        const newTexture = await loadStarfield(bg.path, bg.hdr);
        const oldTexture = lensingPass.getCurrentStarfield();

        isTransitioning = true;
        lensingPass.setStarfieldNext(newTexture);
        lensingPass.setStarfieldExposure(bg.exposure);
        exposureController?.setValue(bg.exposure);

        // Animate the blend
        const blendState = { value: 0 };
        gsap.to(blendState, {
          value: 1,
          duration: 0.8,
          ease: 'power2.inOut',
          onUpdate: () => {
            lensingPass?.setStarfieldBlend(blendState.value);
          },
          onComplete: () => {
            lensingPass?.finalizeStarfieldTransition();
            oldTexture?.dispose();
            isTransitioning = false;
          },
        });
      };

      // Setup GUI (only if showDevControls is true)
      const setupGUI = () => {
        if (!showDevControls) return;

        const gui = new GUI({ title: 'Black Hole Controls' });
        cleanupRef.current.gui = gui;

        // ========== ENVIRONMENT ==========
        const envFolder = gui.addFolder('Environment');
        const defaultBg = 'milkyWay' as StarfieldKey;
        const envParams = {
          background: defaultBg,
          starfieldExposure: STARFIELD_BACKGROUNDS[defaultBg].exposure,
        };
        const backgroundOptions = Object.fromEntries(
          Object.entries(STARFIELD_BACKGROUNDS).map(([key, val]) => [val.name, key])
        );
        const exposureController = envFolder
          .add(envParams, 'starfieldExposure', 0.01, 10.0, 0.05)
          .name('HDR Exposure')
          .onChange((value: number) => {
            lensingPass?.setStarfieldExposure(value);
          });
        envFolder
          .add(envParams, 'background', backgroundOptions)
          .name('Background')
          .onChange((key: StarfieldKey) => {
            swapStarfield(key, exposureController);
          });

        // ========== PHYSICS ==========
        const physicsFolder = gui.addFolder('Physics');
        physicsFolder.close();
        physicsFolder
          .add(params, 'rs', 0.5, 2.0, 0.1)
          .name('Schwarzschild Radius')
          .onChange((value: number) => {
            lensingPass?.updateParams({ rs: value });
            controls.minDistance = CONFIG.camera.minDistance * value;
            controls.maxDistance = CONFIG.camera.maxDistance * value;
          });
        physicsFolder
          .add(params, 'photonSphereIntensity', 0.0, 1.0, 0.05)
          .name('Photon Sphere Glow')
          .onChange((value: number) => {
            lensingPass?.updateParams({ photonSphereIntensity: value });
          });
        physicsFolder.add(params, 'simulationSpeed', 0.0, 3.0, 0.1).name('Time Scale');

        // ========== ACCRETION DISK ==========
        const diskFolder = gui.addFolder('Accretion Disk');
        diskFolder.close();

        // Geometry
        const diskGeomFolder = diskFolder.addFolder('Geometry');
        diskGeomFolder
          .add(params, 'diskInnerRadius', 1.5, 6.0, 0.1)
          .name('Inner Radius (rs)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskInnerRadius: value });
          });
        diskGeomFolder
          .add(params, 'diskOuterRadius', 6.0, 20.0, 0.5)
          .name('Outer Radius (rs)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskOuterRadius: value });
          });
        diskGeomFolder
          .add(params, 'thickDiskEnabled', { Off: 0, On: 1 })
          .name('3D Thickness')
          .onChange((value: number) => {
            lensingPass?.updateParams({ thickDiskEnabled: value });
          });
        diskGeomFolder
          .add(params, 'thickDiskHalfThickness', 0.1, 1.0, 0.05)
          .name('Thickness (rs)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ thickDiskHalfThickness: value });
          });
        diskGeomFolder
          .add(params, 'thickDiskPuffiness', 0.1, 0.8, 0.05)
          .name('Puffiness')
          .onChange((value: number) => {
            lensingPass?.updateParams({ thickDiskPuffiness: value });
          });

        // Appearance
        const diskAppearFolder = diskFolder.addFolder('Appearance');
        diskAppearFolder
          .add(params, 'diskTemperatureInner', 5000, 20000, 500)
          .name('Inner Temp (K)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskTemperatureInner: value });
          });
        diskAppearFolder
          .add(params, 'diskTemperatureOuter', 1000, 8000, 200)
          .name('Outer Temp (K)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskTemperatureOuter: value });
          });
        diskAppearFolder
          .add(params, 'diskLuminanceCompression', 0.0, 0.5, 0.01)
          .name('Luminance Comp.')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskLuminanceCompression: value });
          });
        diskAppearFolder
          .add(params, 'diskTextureContrast', 0.0, 2.0, 0.1)
          .name('Texture Contrast')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskTextureContrast: value });
          });
        const diskOpacityControl = diskAppearFolder
          .add(params, 'diskOpacity', 0.0, 1.0, 0.05)
          .name('Opacity')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskOpacity: value });
          });
        const diskActions = {
          hideDisk: () => {
            params.diskOpacity = 0;
            lensingPass?.updateParams({ diskOpacity: 0 });
            diskOpacityControl.updateDisplay();
          },
        };
        diskAppearFolder.add(diskActions, 'hideDisk').name('Hide Disk');

        // Motion
        const diskMotionFolder = diskFolder.addFolder('Motion');
        diskMotionFolder
          .add(params, 'diskMaterialSpeed', 0.0, 50.0, 1.0)
          .name('Orbital Speed')
          .onChange((value: number) => {
            lensingPass?.updateParams({ diskMaterialSpeed: value });
          });

        // ========== DISK TURBULENCE ==========
        const turbFolder = gui.addFolder('Disk Turbulence');
        turbFolder.close();
        turbFolder
          .add(params, 'mhdTurbulenceIntensity', 0.0, 1.0, 0.05)
          .name('Intensity')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdTurbulenceIntensity: value });
          });
        turbFolder
          .add(params, 'mhdSpiralArms', 1, 4, 1)
          .name('Spiral Arms')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdSpiralArms: value });
          });
        turbFolder
          .add(params, 'mhdSpiralTightness', 1.0, 6.0, 0.5)
          .name('Spiral Tightness')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdSpiralTightness: value });
          });
        turbFolder
          .add(params, 'mhdHotspotIntensity', 0.0, 1.0, 0.05)
          .name('Hotspot Intensity')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdHotspotIntensity: value });
          });
        turbFolder
          .add(params, 'mhdHotspotCount', 0, 5, 1)
          .name('Hotspot Count')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdHotspotCount: value });
          });
        turbFolder
          .add(params, 'mhdPatternSpeed', 0.0, 150.0, 0.5)
          .name('Pattern Speed')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdPatternSpeed: value });
          });
        turbFolder
          .add(params, 'mhdMinDensity', 0.0, 1.0, 0.05)
          .name('Min Density')
          .onChange((value: number) => {
            lensingPass?.updateParams({ mhdMinDensity: value });
          });

        // ========== CORONA & JETS ==========
        const coronaJetsFolder = gui.addFolder('Corona & Jets');
        coronaJetsFolder.close();

        // Corona
        const coronaFolder = coronaJetsFolder.addFolder('Corona');
        coronaFolder
          .add(params, 'coronaEnabled', { Off: 0, On: 1 })
          .name('Enable')
          .onChange((value: number) => {
            lensingPass?.updateParams({ coronaEnabled: value });
          });
        coronaFolder
          .add(params, 'coronaRadius', 3, 15, 0.5)
          .name('Radius (rs)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ coronaRadius: value });
          });
        coronaFolder
          .add(params, 'coronaDensity', 0.01, 1.0, 0.01)
          .name('Density')
          .onChange((value: number) => {
            lensingPass?.updateParams({ coronaDensity: value });
          });

        // Jets
        const jetsFolder = coronaJetsFolder.addFolder('Relativistic Jets');
        jetsFolder
          .add(params, 'jetsEnabled', { Off: 0, On: 1 })
          .name('Enable')
          .onChange((value: number) => {
            lensingPass?.updateParams({ jetsEnabled: value });
          });
        jetsFolder
          .add(params, 'jetsHalfOpeningAngle', 5, 30, 1)
          .name('Opening Angle (°)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ jetsHalfOpeningAngle: value });
          });
        jetsFolder
          .add(params, 'jetsVelocity', 0.5, 0.99, 0.01)
          .name('Velocity (c)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ jetsVelocity: value });
          });
        jetsFolder
          .add(params, 'jetsLength', 10, 80, 5)
          .name('Length (rs)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ jetsLength: value });
          });
        jetsFolder
          .add(params, 'jetsDensity', 0, 1.0, 0.025)
          .name('Density')
          .onChange((value: number) => {
            lensingPass?.updateParams({ jetsDensity: value });
          });

        // ========== POST-PROCESSING ==========
        const postFolder = gui.addFolder('Post-Processing');
        postFolder.close();

        // Bloom
        const bloomFolder = postFolder.addFolder('Bloom');
        bloomFolder
          .add(params, 'bloomThreshold', 0.0, 1.0, 0.05)
          .name('Threshold')
          .onChange((value: number) => {
            if (bloomPass) bloomPass.threshold = value;
          });
        bloomFolder
          .add(params, 'bloomStrength', 0.0, 3.0, 0.1)
          .name('Strength')
          .onChange((value: number) => {
            if (bloomPass) bloomPass.strength = value;
          });
        bloomFolder
          .add(params, 'bloomRadius', 0.0, 1.0, 0.05)
          .name('Radius')
          .onChange((value: number) => {
            if (bloomPass) bloomPass.radius = value;
          });

        // Anti-Aliasing
        const aaFolder = postFolder.addFolder('Anti-Aliasing');
        aaFolder
          .add(params, 'fxaaEnabled')
          .name('FXAA')
          .onChange((value: boolean) => {
            if (fxaaPass) fxaaPass.enabled = value;
          });
        aaFolder
          .add(params, 'supersampleLevel', {
            'Off (1x)': 1,
            '2x2 (4 samples)': 2,
            '4x4 (16 samples)': 4,
          })
          .name('Supersampling')
          .onChange((value: number) => {
            lensingPass?.updateParams({ supersampleLevel: value });
          });
        aaFolder
          .add(params, 'bhEdgeSoftness', 0.0, 1.0, 0.05)
          .name('Edge Softness')
          .onChange((value: number) => {
            lensingPass?.updateParams({ bhEdgeSoftness: value });
          });

        // EHT Blur
        const ehtFolder = postFolder.addFolder('EHT Telescope Blur');
        ehtFolder
          .add(params, 'ehtBlurEnabled')
          .name('Enable')
          .onChange((value: boolean) => {
            setEhtBlurEnabled(value);
          });
        ehtFolder
          .add(params, 'ehtBlurStrength', 0.5, 5.0, 0.25)
          .name('Strength')
          .onChange(() => {
            updateBlurStrength(ehtBlurState.intensity);
          });

        // ========== OVERLAYS ==========
        const overlaysFolder = gui.addFolder('Overlays');
        overlaysFolder.close();

        const overlayParams = {
          isco: 0,
          eventHorizon: 0,
          scale: 0,
          doppler: 0,
          showLabels: false,
        };

        const dispatchOverlayChange = (key: string, value: boolean) => {
          window.dispatchEvent(
            new CustomEvent('dev-overlay-change', {
              detail: { key, value },
            })
          );
        };

        overlaysFolder
          .add(overlayParams, 'isco', { Off: 0, On: 1 })
          .name('ISCO (3 rs)')
          .onChange((value: number) => {
            lensingPass?.updateParams({ overlayIsco: value });
            dispatchOverlayChange('isco', value === 1);
          });
        overlaysFolder
          .add(overlayParams, 'eventHorizon', { Off: 0, On: 1 })
          .name('Event Horizon')
          .onChange((value: number) => {
            lensingPass?.updateParams({ overlayEventHorizon: value });
            dispatchOverlayChange('eventHorizon', value === 1);
          });
        overlaysFolder
          .add(overlayParams, 'scale', { Off: 0, On: 1 })
          .name('Scale Rings')
          .onChange((value: number) => {
            lensingPass?.updateParams({ overlayScale: value });
            dispatchOverlayChange('scale', value === 1);
          });
        overlaysFolder
          .add(overlayParams, 'doppler', { Off: 0, On: 1 })
          .name('Doppler Shift')
          .onChange((value: number) => {
            lensingPass?.updateParams({ overlayDoppler: value });
            dispatchOverlayChange('doppler', value === 1);
          });
        overlaysFolder
          .add(overlayParams, 'showLabels')
          .name('Show Labels')
          .onChange((value: boolean) => {
            const labelsContainer = document.getElementById('dev-overlay-labels');
            if (labelsContainer) {
              labelsContainer.style.display = value ? 'block' : 'none';
            }
          });

        // ========== CAMERA ==========
        const cameraFolder = gui.addFolder('Camera');
        cameraFolder.close();

        const cameraInfo = {
          get distance() {
            return camera.position.length().toFixed(1) + ' rs';
          },
          get mode() {
            return cameraController.getMode();
          },
        };
        cameraFolder.add(cameraInfo, 'distance').name('Distance').listen().disable();
        cameraFolder.add(cameraInfo, 'mode').name('Mode').listen().disable();

        // Orbit controls
        const orbitFolder = cameraFolder.addFolder('Orbit Mode');
        const orbitParams = {
          distance: 20,
          height: 1,
          speed: 1,
          startOrbit: () => {
            cameraController.startOrbit({
              distance: orbitParams.distance * CONFIG.rs,
              height: orbitParams.height * CONFIG.rs,
              speed: orbitParams.speed,
            });
          },
          stopOrbit: () => {
            cameraController.stopOrbit();
          },
          returnToManual: () => {
            cameraController.returnToManual();
          },
        };
        orbitFolder.add(orbitParams, 'distance', 10, 50, 1).name('Distance (rs)');
        orbitFolder.add(orbitParams, 'height', -10, 20, 1).name('Height (rs)');
        orbitFolder.add(orbitParams, 'speed', 1, 60, 1).name('Speed (°/s)');
        orbitFolder.add(orbitParams, 'startOrbit').name('Start Orbit');
        orbitFolder.add(orbitParams, 'stopOrbit').name('Stop Orbit');
        orbitFolder.add(orbitParams, 'returnToManual').name('Manual Control');

        // Presets
        const presetFolder = cameraFolder.addFolder('Presets');
        const presets = {
          accretionDisk: () => {
            cameraController.moveTo(
              {
                position: CAMERA_PRESETS.accretionDisk.position,
                lookAt: CAMERA_PRESETS.accretionDisk.lookAt,
              },
              { duration: CAMERA_PRESETS.accretionDisk.duration }
            );
          },
          topDown: () => {
            cameraController.moveTo(
              {
                position: CAMERA_PRESETS.topDown.position,
                lookAt: CAMERA_PRESETS.topDown.lookAt,
              },
              { duration: CAMERA_PRESETS.topDown.duration }
            );
          },
          edgeOn: () => {
            cameraController.moveTo(
              {
                position: CAMERA_PRESETS.edgeOn.position,
                lookAt: CAMERA_PRESETS.edgeOn.lookAt,
              },
              { duration: CAMERA_PRESETS.edgeOn.duration }
            );
          },
          eht: () => {
            cameraController.moveTo(
              {
                position: CAMERA_PRESETS.eht.position,
                lookAt: CAMERA_PRESETS.eht.lookAt,
              },
              {
                duration: CAMERA_PRESETS.eht.duration,
                ease: CAMERA_PRESETS.eht.ease,
              }
            );
          },
          resetDefault: () => {
            cameraController
              .moveTo(
                {
                  position: {
                    x: 0,
                    y: 1 * CONFIG.rs,
                    z: CONFIG.camera.initialDistance,
                  },
                  lookAt: { x: 0, y: 0, z: 0 },
                },
                { duration: 2 }
              )
              .then(() => {
                cameraController.returnToManual();
              });
          },
        };
        presetFolder.add(presets, 'accretionDisk').name('Accretion Disk');
        presetFolder.add(presets, 'topDown').name('Top Down');
        presetFolder.add(presets, 'edgeOn').name('Edge On');
        presetFolder.add(presets, 'eht').name('EHT View');
        presetFolder.add(presets, 'resetDefault').name('Reset Default');

        // Sequences
        const sequenceFolder = cameraFolder.addFolder('Sequences');
        const sequences = {
          fallIn: () => {
            cameraController.runSequence(CAMERA_SEQUENCES.fallIn);
          },
          warpingTour: () => {
            cameraController.runSequence(CAMERA_SEQUENCES.warpingTour);
          },
          shadowExplore: () => {
            cameraController.runSequence(CAMERA_SEQUENCES.shadowExplore);
          },
          cancelSequence: () => {
            cameraController.cancelSequence();
          },
        };
        sequenceFolder.add(sequences, 'fallIn').name('Fall In');
        sequenceFolder.add(sequences, 'warpingTour').name('Warping Tour');
        sequenceFolder.add(sequences, 'shadowExplore').name('Shadow Explore');
        sequenceFolder.add(sequences, 'cancelSequence').name('Cancel');

        // ========== RAY MARCHING (Advanced) ==========
        const rayMarchFolder = gui.addFolder('Ray Marching (Advanced)');
        rayMarchFolder.close();
        rayMarchFolder
          .add(params, 'autoSteps')
          .name('Auto Step Count')
          .onChange(() => {
            if (params.autoSteps) updateStepCount();
          });
        rayMarchFolder
          .add(params, 'autoStepsMin', 16, 500, 4)
          .name('Auto Min')
          .onChange(() => {
            if (params.autoSteps) updateStepCount();
          });
        rayMarchFolder
          .add(params, 'autoStepsMax', 50, 1000, 4)
          .name('Auto Max')
          .onChange(() => {
            if (params.autoSteps) updateStepCount();
          });
        rayMarchFolder
          .add(params, 'maxSteps', 16, 1000, 4)
          .name('Manual Steps')
          .listen()
          .onChange((value: number) => {
            params.autoSteps = false;
            lensingPass?.updateParams({ maxSteps: value });
          });
        rayMarchFolder
          .add(params, 'baseStepSize', 0.01, 0.5, 0.005)
          .name('Base Step Size')
          .onChange((value: number) => {
            lensingPass?.updateParams({ baseStepSize: value });
          });
        rayMarchFolder
          .add(params, 'stepJitter', { Off: 0, On: 1 })
          .name('Step Jitter')
          .onChange((value: number) => {
            lensingPass?.updateParams({ stepJitter: value });
          });
        rayMarchFolder
          .add(params, 'curvatureAdaptation', 0.0, 1.0, 0.1)
          .name('Curvature Adapt')
          .onChange((value: number) => {
            lensingPass?.updateParams({ curvatureAdaptation: value });
          });
        rayMarchFolder
          .add(params, 'coronaStepRefinement', 0.0, 1.0, 0.1)
          .name('Corona Refinement')
          .onChange((value: number) => {
            lensingPass?.updateParams({ coronaStepRefinement: value });
          });
        rayMarchFolder
          .add(params, 'lodEnabled', { Off: 0, On: 1 })
          .name('Distance LOD')
          .onChange((value: number) => {
            lensingPass?.updateParams({ lodEnabled: value });
          });
      };

      // Setup stats (only if showStats is true)
      const setupStats = (): Stats | null => {
        if (!showStats) return null;

        const stats = new Stats();
        stats.showPanel(0);
        stats.dom.style.cssText =
          'position:fixed;bottom:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
        document.body.appendChild(stats.dom);
        cleanupRef.current.stats = stats;
        return stats;
      };

      // Handle resize
      const onWindowResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        composer?.setSize(width, height);

        lensingPass?.updateResolution(width, height);

        if (fxaaPass) {
          fxaaPass.uniforms['resolution'].value.set(
            1 / (width * renderer.getPixelRatio()),
            1 / (height * renderer.getPixelRatio())
          );
        }

        if (bloomPass) {
          const bloomResScale = CONFIG.bloom.resolutionScale;
          bloomPass.resolution.set(
            Math.floor(width * bloomResScale),
            Math.floor(height * bloomResScale)
          );
        }

        // Update blur passes for new resolution
        if (blurPasses.length > 0) {
          const blurAmount = params.ehtBlurStrength * ehtBlurState.intensity;
          blurPasses.forEach(({ h, v }) => {
            h.uniforms['h'].value = blurAmount / width;
            v.uniforms['v'].value = blurAmount / height;
          });
        }

        updateStepCount();
      };

      // Animation loop
      const animate = (stats: Stats | null) => {
        const loop = () => {
          cleanupRef.current.animationId = requestAnimationFrame(loop);

          stats?.begin();

          const deltaTime = clock.getDelta();

          // Accumulate scaled time based on simulation speed
          scaledTime += deltaTime * params.simulationSpeed;

          cameraController.update(deltaTime);

          if (!cameraController.isActive()) {
            controls.update();
          }

          lensingPass?.updateTime(scaledTime);

          camera.updateMatrixWorld();
          lensingPass?.updateCamera(camera);

          composer?.render();

          stats?.end();
        };
        loop();
      };

      // Initialize everything
      const starfieldTexture = await loadStarfield();

      // Check if this init instance was superseded by a newer one (React Strict Mode)
      if (!isStillValid()) {
        // Clean up resources we've already created
        renderer.dispose();
        controls.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        return;
      }

      setupPostProcessing(starfieldTexture);
      const stats = setupStats();
      setupGUI();

      window.addEventListener('resize', onWindowResize);

      // Hide loading screen
      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.classList.add('hidden');
        setTimeout(() => loadingEl.remove(), 500);
      }

      // Notify parent with camera controller
      onCameraReady?.(cameraController);

      // Notify parent with EHT blur controller
      onEhtBlurReady?.({
        setEnabled: setEhtBlurEnabled,
        isEnabled: () => params.ehtBlurEnabled,
      });

      // Start animation
      animate(stats);

      // Store resize handler for cleanup
      return () => {
        window.removeEventListener('resize', onWindowResize);
      };
    },
    [showDevControls, showStats, initialCameraPreset, onCameraReady, onEhtBlurReady]
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    // Increment init ID to invalidate any previous init instances
    const thisInitId = ++currentInitIdRef.current;

    init(thisInitId).then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      cleanup?.();

      // Cancel animation frame
      if (cleanupRef.current.animationId) {
        cancelAnimationFrame(cleanupRef.current.animationId);
      }

      // Remove renderer canvas from DOM
      if (cleanupRef.current.renderer?.domElement?.parentNode) {
        cleanupRef.current.renderer.domElement.parentNode.removeChild(
          cleanupRef.current.renderer.domElement
        );
      }

      // Dispose Three.js resources
      cleanupRef.current.lensingPass?.dispose();
      cleanupRef.current.composer?.dispose();
      cleanupRef.current.renderer?.dispose();
      cleanupRef.current.controls?.dispose();

      // Remove GUI and stats
      cleanupRef.current.gui?.destroy();
      if (cleanupRef.current.stats?.dom) {
        cleanupRef.current.stats.dom.remove();
      }

      // Reset init flag
      initRef.current = false;

      // Reset cleanup ref
      cleanupRef.current = {};
    };
  }, [init]);

  // Sync toggle state to shader
  useEffect(() => {
    if (cleanupRef.current.lensingPass && toggleState) {
      cleanupRef.current.lensingPass.updateParams({
        overlayIsco: toggleState.isco ? 1.0 : 0.0,
        overlayEventHorizon: toggleState.eventHorizon ? 1.0 : 0.0,
        overlayDoppler: toggleState.doppler ? 1.0 : 0.0,
        overlayScale: toggleState.scale ? 1.0 : 0.0,
        diskOpacity: toggleState.disk ? CONFIG.disk.opacity : 0.0,
        jetsEnabled: toggleState.jets ? 1.0 : 0.0,
      });
    }
  }, [toggleState]);

  return (
    <>
      <div id="loading" className="loading">
        <span>INITIALIZING SIMULATION...</span>
      </div>
      <div ref={containerRef} className="simulation-container" />
      <style jsx>{`
        .simulation-container {
          width: 100%;
          height: 100%;
          position: fixed;
          top: 0;
          left: 0;
        }
        .loading {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          color: #fff;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
          font-size: 14px;
          letter-spacing: 0.1em;
          z-index: 1000;
          transition: opacity 0.5s ease;
        }
        .loading.hidden {
          opacity: 0;
          pointer-events: none;
        }
        .loading span {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}
