import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import GUI from 'lil-gui';
import Stats from 'stats.js';

import { LensingPass, defaultLensingParams, LensingParams } from './passes/LensingPass';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Schwarzschild radius (base unit)
  rs: 1.0,
  
  // Camera limits
  cameraMinDistance: 5,
  cameraMaxDistance: 100,
  cameraInitialDistance: 20,
  
  // Performance settings
  targetFPS: 60,
  
  // Bloom settings
  bloomThreshold: 0,
  bloomStrength: 0.4,
  bloomRadius: 0.5,
  
  // Disk parameters
  diskInnerRadius: 3.0,  // ISCO
  diskOuterRadius: 12.0,
  diskTemperatureInner: 10000,
  diskTemperatureOuter: 3000,
};

// ============================================================================
// Global State
// ============================================================================

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let composer: EffectComposer;
let lensingPass: LensingPass;
let bloomPass: UnrealBloomPass;
let stats: Stats;
let gui: GUI;
let clock: THREE.Clock;
let starfieldTexture: THREE.Texture | null = null;

const params: LensingParams & { 
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  autoSteps: boolean;
} = {
  ...defaultLensingParams,
  bloomThreshold: CONFIG.bloomThreshold,
  bloomStrength: CONFIG.bloomStrength,
  bloomRadius: CONFIG.bloomRadius,
  autoSteps: true,
  // MHD defaults from defaultLensingParams are spread above
};

// ============================================================================
// Initialization
// ============================================================================

async function init(): Promise<void> {
  // Create renderer
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1.0);  // Black background
  document.body.appendChild(renderer.domElement);
  
  // Create scene (not used for geometry, but needed for composer)
  scene = new THREE.Scene();
  
  // Create camera
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5 * CONFIG.rs, CONFIG.cameraInitialDistance * CONFIG.rs);
  camera.lookAt(0, 0, 0);
  
  // Create controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = CONFIG.cameraMinDistance * CONFIG.rs;
  controls.maxDistance = CONFIG.cameraMaxDistance * CONFIG.rs;
  controls.target.set(0, 0, 0);
  controls.update();
  
  // Initialize clock
  clock = new THREE.Clock();
  
  // Load starfield and set up rendering
  await loadStarfield();
  
  // Setup stats
  setupStats();
  
  // Setup GUI
  setupGUI();
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Hide loading screen
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 500);
  }
  
  // Start render loop
  animate();
}

// ============================================================================
// Asset Loading
// ============================================================================

async function loadStarfield(): Promise<void> {
  return new Promise((resolve) => {
    const exrLoader = new EXRLoader();
    
    exrLoader.load(
      '/textures/starmap_2020_4k.exr',
      (texture) => {
        // Use equirectangular texture directly
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        
        starfieldTexture = texture;
        
        // Setup post-processing pipeline
        setupPostProcessing();
        
        resolve();
      },
      (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        console.log(`Loading starfield: ${percent.toFixed(1)}%`);
      },
      (error) => {
        console.error('Error loading starfield:', error);
        // Create fallback starfield texture
        starfieldTexture = createFallbackStarfield();
        setupPostProcessing();
        resolve();
      }
    );
  });
}

function createFallbackStarfield(): THREE.Texture {
  // Create a simple equirectangular starfield as fallback
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  
  // Add random stars
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
}

// ============================================================================
// Post-Processing Setup
// ============================================================================

function setupPostProcessing(): void {
  if (!starfieldTexture) return;
  
  // Create effect composer
  composer = new EffectComposer(renderer);
  
  // Create and add lensing pass
  lensingPass = new LensingPass(starfieldTexture);
  lensingPass.updateResolution(window.innerWidth, window.innerHeight);
  lensingPass.updateParams(params);
  composer.addPass(lensingPass);
  
  // Create and add bloom pass
  const resolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
  bloomPass = new UnrealBloomPass(resolution, params.bloomStrength, params.bloomRadius, params.bloomThreshold);
  composer.addPass(bloomPass);
  
  // Update step count based on resolution
  updateStepCount();
}

// ============================================================================
// Resolution Scaling
// ============================================================================

function updateStepCount(): void {
  if (!params.autoSteps) return;
  
  const width = window.innerWidth * renderer.getPixelRatio();
  const height = window.innerHeight * renderer.getPixelRatio();
  const pixels = width * height;
  
  // Scale steps based on resolution:
  // 4K (8.3M pixels): 24-32 steps
  // 1440p (3.7M pixels): 32-48 steps
  // 1080p (2M pixels): 48+ steps
  
  const minPixels = 2_000_000;  // 1080p
  const maxPixels = 8_300_000;  // 4K
  const minSteps = 64;
  const maxSteps = 150;
  
  const t = Math.max(0, Math.min(1, (pixels - minPixels) / (maxPixels - minPixels)));
  const steps = Math.round(maxSteps - t * (maxSteps - minSteps));
  
  params.maxSteps = steps;
  if (lensingPass) {
    lensingPass.updateParams({ maxSteps: steps });
  }
  
  console.log(`Resolution: ${width}x${height} (${(pixels / 1_000_000).toFixed(1)}M pixels) → ${steps} steps`);
}

// ============================================================================
// GUI Setup
// ============================================================================

function setupGUI(): void {
  gui = new GUI({ title: 'Black Hole Controls' });
  
  // Simulation folder
  const simFolder = gui.addFolder('Simulation');
  simFolder.add(params, 'rs', 0.5, 2.0, 0.1)
    .name('Schwarzschild Radius')
    .onChange((value: number) => {
      lensingPass?.updateParams({ rs: value });
      controls.minDistance = CONFIG.cameraMinDistance * value;
      controls.maxDistance = CONFIG.cameraMaxDistance * value;
    });
  
  simFolder.add(params, 'autoSteps')
    .name('Auto Ray Steps')
    .onChange(() => {
      if (params.autoSteps) updateStepCount();
    });
  
  simFolder.add(params, 'maxSteps', 16, 96, 4)
    .name('Ray March Steps')
    .listen()
    .onChange((value: number) => {
      lensingPass?.updateParams({ maxSteps: value });
    });
  
  // Disk folder
  const diskFolder = gui.addFolder('Accretion Disk');
  diskFolder.add(params, 'diskInnerRadius', 1.5, 6.0, 0.1)
    .name('Inner Radius (rs)')
    .onChange((value: number) => {
      lensingPass?.updateParams({ diskInnerRadius: value });
    });
  
  diskFolder.add(params, 'diskOuterRadius', 6.0, 20.0, 0.5)
    .name('Outer Radius (rs)')
    .onChange((value: number) => {
      lensingPass?.updateParams({ diskOuterRadius: value });
    });
  
  diskFolder.add(params, 'diskTemperatureInner', 5000, 20000, 500)
    .name('Inner Temp (K)')
    .onChange((value: number) => {
      lensingPass?.updateParams({ diskTemperatureInner: value });
    });
  
  diskFolder.add(params, 'diskTemperatureOuter', 1000, 8000, 200)
    .name('Outer Temp (K)')
    .onChange((value: number) => {
      lensingPass?.updateParams({ diskTemperatureOuter: value });
    });
  
  // MHD Effects folder
  const mhdFolder = gui.addFolder('MHD Turbulence');
  mhdFolder.add(params, 'mhdTurbulenceIntensity', 0.0, 1.0, 0.05)
    .name('Turbulence')
    .onChange((value: number) => {
      lensingPass?.updateParams({ mhdTurbulenceIntensity: value });
    });
  
  mhdFolder.add(params, 'mhdSpiralArms', 1, 4, 1)
    .name('Spiral Arms')
    .onChange((value: number) => {
      lensingPass?.updateParams({ mhdSpiralArms: value });
    });
  
  mhdFolder.add(params, 'mhdSpiralTightness', 1.0, 6.0, 0.5)
    .name('Spiral Tightness')
    .onChange((value: number) => {
      lensingPass?.updateParams({ mhdSpiralTightness: value });
    });
  
  mhdFolder.add(params, 'mhdHotspotIntensity', 0.0, 1.0, 0.05)
    .name('Hotspot Intensity')
    .onChange((value: number) => {
      lensingPass?.updateParams({ mhdHotspotIntensity: value });
    });
  
  mhdFolder.add(params, 'mhdHotspotCount', 0, 5, 1)
    .name('Hotspot Count')
    .onChange((value: number) => {
      lensingPass?.updateParams({ mhdHotspotCount: value });
    });
  
  mhdFolder.add(params, 'mhdPatternSpeed', 0.0, 3.0, 0.1)
    .name('Pattern Speed')
    .onChange((value: number) => {
      lensingPass?.updateParams({ mhdPatternSpeed: value });
    });
  
  // Bloom folder
  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder.add(params, 'bloomThreshold', 0.0, 1.0, 0.05)
    .name('Threshold')
    .onChange((value: number) => {
      if (bloomPass) bloomPass.threshold = value;
    });
  
  bloomFolder.add(params, 'bloomStrength', 0.0, 3.0, 0.1)
    .name('Strength')
    .onChange((value: number) => {
      if (bloomPass) bloomPass.strength = value;
    });
  
  bloomFolder.add(params, 'bloomRadius', 0.0, 1.0, 0.05)
    .name('Radius')
    .onChange((value: number) => {
      if (bloomPass) bloomPass.radius = value;
    });
  
  // Camera info (read-only)
  const cameraFolder = gui.addFolder('Camera');
  const cameraInfo = {
    get distance() {
      return camera.position.length().toFixed(1) + ' rs';
    }
  };
  cameraFolder.add(cameraInfo, 'distance').name('Distance').listen().disable();
}

// ============================================================================
// Stats Setup
// ============================================================================

function setupStats(): void {
  stats = new Stats();
  stats.showPanel(0); // FPS
  stats.dom.style.cssText = 'position:fixed;bottom:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
  document.body.appendChild(stats.dom);
}

// ============================================================================
// Event Handlers
// ============================================================================

function onWindowResize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
  composer?.setSize(width, height);
  
  lensingPass?.updateResolution(width, height);
  
  if (bloomPass) {
    bloomPass.resolution.set(width, height);
  }
  
  updateStepCount();
}

// ============================================================================
// Animation Loop
// ============================================================================

function animate(): void {
  requestAnimationFrame(animate);
  
  stats.begin();
  
  // Update controls
  controls.update();
  
  // Update time
  const elapsed = clock.getElapsedTime();
  lensingPass?.updateTime(elapsed);
  
  // Update camera matrices
  camera.updateMatrixWorld();
  lensingPass?.updateCamera(camera);
  
  // Render
  composer?.render();
  
  stats.end();
}

// ============================================================================
// Entry Point
// ============================================================================

init().catch(console.error);

