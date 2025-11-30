'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

import { LensingPass, defaultLensingParams } from '@/lib/passes/LensingPass';
import { CONFIG } from '@/lib/config';
import { RenderController } from '@/lib/render/RenderController';
import { RENDER_PRESETS, DEFAULT_PRESET, DEFAULT_SIMULATION_SPEED } from '@/lib/render/renderConfig';
import { RenderControlPanel } from './RenderControlPanel';
import { CAMERA_SEQUENCES } from './BlackHoleSimulation';
import type { RenderProgress, RenderStatus } from '@/lib/render/types';
import { UserMenu } from './UserMenu';

export function RenderView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const lensingPassRef = useRef<LensingPass | null>(null);
  const renderControllerRef = useRef<RenderController | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const animationIdRef = useRef<number | null>(null);
  const blurPassesRef = useRef<{ h: ShaderPass; v: ShaderPass }[]>([]);

  const [selectedSequence, setSelectedSequence] = useState<string>('fallIn');
  const [selectedPreset, setSelectedPreset] = useState<string>(DEFAULT_PRESET);
  const [status, setStatus] = useState<RenderStatus>('idle');
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Create renderer - match BlackHoleSimulation setup exactly
    const renderer = new THREE.WebGLRenderer({
      antialias: CONFIG.renderer.antialias,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Required for frame capture
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.renderer.pixelRatioMax));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CONFIG.renderer.toneMappingExposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 1.0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      container.clientWidth / container.clientHeight,
      CONFIG.camera.near,
      CONFIG.camera.far
    );
    camera.position.set(0, 10, 40);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Load starfield and setup post-processing
    const setupScene = async () => {
      let starfieldTexture: THREE.Texture;

      try {
        const exrLoader = new EXRLoader();
        starfieldTexture = await exrLoader.loadAsync('/textures/starmap_2020_4k.exr');
        starfieldTexture.mapping = THREE.EquirectangularReflectionMapping;
        starfieldTexture.minFilter = THREE.LinearFilter;
        starfieldTexture.magFilter = THREE.LinearFilter;
        starfieldTexture.wrapS = THREE.RepeatWrapping;
        starfieldTexture.wrapT = THREE.ClampToEdgeWrapping;
      } catch {
        // Fallback to procedural starfield
        starfieldTexture = createProceduralStarfield();
      }

      // Setup post-processing
      const renderTarget = new THREE.WebGLRenderTarget(
        container.clientWidth,
        container.clientHeight,
        {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        }
      );

      const composer = new EffectComposer(renderer, renderTarget);
      composerRef.current = composer;

      // Lensing pass
      const lensingPass = new LensingPass(starfieldTexture);
      lensingPass.updateResolution(container.clientWidth, container.clientHeight);
      lensingPass.updateParams(defaultLensingParams);
      composer.addPass(lensingPass);
      lensingPassRef.current = lensingPass;

      // FXAA pass - use same resolution calculation as BlackHoleSimulation
      const fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.uniforms['resolution'].value.set(
        1 / (container.clientWidth * renderer.getPixelRatio()),
        1 / (container.clientHeight * renderer.getPixelRatio())
      );
      fxaaPass.enabled = CONFIG.antiAliasing.fxaaEnabled;
      composer.addPass(fxaaPass);

      // Bloom pass - use scaled resolution like BlackHoleSimulation
      const bloomResScale = CONFIG.bloom.resolutionScale;
      const bloomRes = new THREE.Vector2(
        Math.floor(container.clientWidth * bloomResScale),
        Math.floor(container.clientHeight * bloomResScale)
      );
      const bloomPass = new UnrealBloomPass(
        bloomRes,
        CONFIG.bloom.strength,
        CONFIG.bloom.radius,
        CONFIG.bloom.threshold
      );
      composer.addPass(bloomPass);

      // EHT blur passes - controlled by preset
      const iterations = CONFIG.ehtBlur.iterations;
      const blurPasses: { h: ShaderPass; v: ShaderPass }[] = [];
      const preset = RENDER_PRESETS[selectedPreset];
      const ehtBlurEnabled = preset.ehtBlur?.enabled ?? false;
      const ehtBlurAmount = preset.ehtBlur?.amount ?? 0;

      for (let i = 0; i < iterations; i++) {
        const hBlurPass = new ShaderPass(HorizontalBlurShader);
        const vBlurPass = new ShaderPass(VerticalBlurShader);

        hBlurPass.uniforms['h'].value = ehtBlurAmount / container.clientWidth;
        vBlurPass.uniforms['v'].value = ehtBlurAmount / container.clientHeight;

        hBlurPass.enabled = ehtBlurEnabled;
        vBlurPass.enabled = ehtBlurEnabled;

        composer.addPass(hBlurPass);
        composer.addPass(vBlurPass);
        blurPasses.push({ h: hBlurPass, v: vBlurPass });
      }
      blurPassesRef.current = blurPasses;

      setIsReady(true);

      // Start preview animation loop
      const animate = () => {
        animationIdRef.current = requestAnimationFrame(animate);

        if (status === 'rendering') return; // Don't update during render

        const deltaTime = clockRef.current.getDelta();
        lensingPass.updateTime(clockRef.current.getElapsedTime() * DEFAULT_SIMULATION_SPEED);
        lensingPass.updateCamera(camera);
        composer.render();
      };

      animate();
    };

    setupScene();

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (renderControllerRef.current) {
        renderControllerRef.current.dispose();
      }
      if (lensingPassRef.current) {
        lensingPassRef.current.dispose();
      }
      if (composerRef.current) {
        composerRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        container.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  // Update blur passes when preset changes
  useEffect(() => {
    if (!containerRef.current || blurPassesRef.current.length === 0) return;

    const preset = RENDER_PRESETS[selectedPreset];
    const ehtBlurEnabled = preset.ehtBlur?.enabled ?? false;
    const ehtBlurAmount = preset.ehtBlur?.amount ?? 0;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    blurPassesRef.current.forEach(({ h, v }) => {
      h.uniforms['h'].value = ehtBlurAmount / width;
      v.uniforms['v'].value = ehtBlurAmount / height;
      h.enabled = ehtBlurEnabled;
      v.enabled = ehtBlurEnabled;
    });
  }, [selectedPreset]);

  // Update camera preview when sequence changes
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const sequence = CAMERA_SEQUENCES[selectedSequence];
    if (!sequence) return;

    const firstStep = sequence.steps[0];
    if ((firstStep?.type === 'snapTo' || firstStep?.type === 'moveTo') && firstStep.position && firstStep.lookAt) {
      camera.position.set(firstStep.position.x, firstStep.position.y, firstStep.position.z);
      camera.lookAt(firstStep.lookAt.x, firstStep.lookAt.y, firstStep.lookAt.z);
    }
  }, [selectedSequence]);

  // Create procedural starfield fallback
  const createProceduralStarfield = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const starCount = 3000;
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const brightness = 0.3 + Math.random() * 0.7;
      const starSize = Math.random() < 0.1 ? 1.5 : 1;

      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
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
  }, []);

  const handleStartRender = useCallback(async () => {
    if (!rendererRef.current || !cameraRef.current || !composerRef.current || !lensingPassRef.current) {
      return;
    }

    const sequence = CAMERA_SEQUENCES[selectedSequence];
    const preset = RENDER_PRESETS[selectedPreset];

    if (!sequence) return;

    // Stop preview animation
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    const controller = new RenderController(
      rendererRef.current,
      cameraRef.current,
      composerRef.current,
      lensingPassRef.current,
      preset,
      DEFAULT_SIMULATION_SPEED,
      {
        onProgress: setProgress,
        onStatusChange: setStatus,
        onRenderComplete: () => {
          // Restart preview animation
          const animate = () => {
            animationIdRef.current = requestAnimationFrame(animate);
            lensingPassRef.current?.updateTime(clockRef.current.getElapsedTime() * DEFAULT_SIMULATION_SPEED);
            lensingPassRef.current?.updateCamera(cameraRef.current!);
            composerRef.current?.render();
          };
          animate();
        },
        onError: (error) => {
          console.error('Render error:', error);
          setStatus('idle');
        },
      }
    );

    renderControllerRef.current = controller;

    try {
      await controller.startRender(sequence);
    } catch (error) {
      console.error('Render failed:', error);
    }
  }, [selectedSequence, selectedPreset]);

  const handleCancelRender = useCallback(() => {
    if (renderControllerRef.current) {
      renderControllerRef.current.cancel();

      // Restart preview animation
      const animate = () => {
        animationIdRef.current = requestAnimationFrame(animate);
        lensingPassRef.current?.updateTime(clockRef.current.getElapsedTime() * DEFAULT_SIMULATION_SPEED);
        lensingPassRef.current?.updateCamera(cameraRef.current!);
        composerRef.current?.render();
      };
      animate();
    }
  }, []);

  return (
    <div className="render-view">
      <div ref={containerRef} className="canvas-container" />

      <UserMenu />

      {isReady && (
        <RenderControlPanel
          sequences={CAMERA_SEQUENCES}
          selectedSequence={selectedSequence}
          selectedPreset={selectedPreset}
          status={status}
          progress={progress}
          onSequenceChange={setSelectedSequence}
          onPresetChange={setSelectedPreset}
          onStartRender={handleStartRender}
          onCancelRender={handleCancelRender}
        />
      )}

      {!isReady && (
        <div className="loading">
          <span>Initializing renderer...</span>
        </div>
      )}

      <style jsx>{`
        .render-view {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: #000;
        }

        .canvas-container {
          width: 100%;
          height: 100%;
        }

        .loading {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #fff;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
          font-size: 14px;
          letter-spacing: 0.1em;
        }
      `}</style>
    </div>
  );
}
