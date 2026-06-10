/**
 * Shader performance benchmark for LensingPass.
 *
 * Renders the real lensing shader across fixed scenarios, times frames with a
 * forced GPU sync per frame, and POSTs timings + deterministic frame captures
 * to the local bench server (bench/server.mjs) for before/after comparison.
 *
 * Run: bun bench/server.mjs, then open http://localhost:8123/?label=<name>
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { LensingPass, type LensingParams } from '../lib/passes/LensingPass';
import { buildLensingParams } from '../lib/config';

const W = 1280;
const H = 720;
const WARMUP_FRAMES = 10;
const TIMED_FRAMES = 40;
const REPS = 3;

interface Scenario {
  name: string;
  cam: [number, number, number];
  params?: Partial<LensingParams>;
}

const SCENARIOS: Scenario[] = [
  // Typical app view: camera at initialDistance 10, slightly above disk plane
  { name: 'wide', cam: [0, 3.4, 9.4] },
  // Strong lensing close to the photon sphere
  { name: 'closeup', cam: [0, 1.2, 4.3] },
  // Edge-on: maximizes volumetric disk sampling
  { name: 'edge-on', cam: [0, 0.4, 12] },
  // Far view: long escape paths for background rays
  { name: 'far', cam: [0, 8, 29] },
  // Everything on: jets, overlays, doppler
  {
    name: 'allfx',
    cam: [0, 3.4, 9.4],
    params: {
      jetsEnabled: 1,
      overlayIsco: 1,
      overlayEventHorizon: 1,
      overlayDoppler: 1,
      overlayScale: 1,
    },
  },
  // Binary black hole system
  { name: 'binary', cam: [0, 7, 24], params: { binaryEnabled: 1 } },
  // 2x2 supersampling path
  { name: 'ss2', cam: [0, 3.4, 9.4], params: { supersampleLevel: 2 } },
  // Cost-isolation probes (uniform toggles only)
  { name: 'p-noedge', cam: [0, 3.4, 9.4], params: { bhEdgeSoftness: 0 } },
  { name: 'p-nocorona', cam: [0, 3.4, 9.4], params: { coronaEnabled: 0 } },
  { name: 'p-thin', cam: [0, 3.4, 9.4], params: { thickDiskEnabled: 0 } },
];

// Deterministic LCG so the starfield texture is identical across runs
function makeStarfield(): THREE.DataTexture {
  const w = 1024;
  const h = 512;
  const data = new Uint8Array(w * h * 4);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 4000; i++) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h);
    const b = 64 + Math.floor(rand() * 191);
    const idx = (y * w + x) * 4;
    data[idx] = b;
    data[idx + 1] = b;
    data[idx + 2] = Math.min(255, b + Math.floor(rand() * 40));
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function log(msg: string) {
  const el = document.getElementById('log')!;
  el.textContent += msg + '\n';
}

async function post(path: string, body: BodyInit, type: string) {
  const res = await fetch(path, { method: 'POST', body, headers: { 'content-type': type } });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
}

function pixelsToPngBlob(px: Uint8Array): Promise<Blob> {
  // readPixels returns bottom-up; flip for PNG
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4;
    img.data.set(px.subarray(src, src + W * 4), y * W * 4);
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  );
}

async function run() {
  const label = new URLSearchParams(location.search).get('label') ?? 'run';
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    depth: false,
    stencil: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  const gl = renderer.getContext() as WebGL2RenderingContext;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';

  const target = new THREE.WebGLRenderTarget(W, H, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const pass = new LensingPass(makeStarfield(), 64);
  const quad = new FullScreenQuad(pass.material);
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);

  const syncPixel = new Uint8Array(4);
  const frame = (time: number) => {
    pass.updateTime(time);
    renderer.setRenderTarget(target);
    quad.render(renderer);
    // 1x1 readback forces a full GPU sync so the wall clock includes GPU time
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, syncPixel);
  };

  log(`GPU: ${gpu}`);
  log(`Label: ${label} | ${W}x${H} | ${TIMED_FRAMES} frames x ${REPS} reps\n`);

  const results: object[] = [];
  for (const sc of SCENARIOS) {
    const params: LensingParams = { ...buildLensingParams(), ...sc.params };
    pass.updateParams(params);
    pass.updateResolution(W, H);
    camera.position.set(...sc.cam);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    pass.updateCamera(camera);

    for (let i = 0; i < WARMUP_FRAMES; i++) frame(10 + i * 0.016);

    const medians: number[] = [];
    for (let rep = 0; rep < REPS; rep++) {
      const times: number[] = [];
      for (let f = 0; f < TIMED_FRAMES; f++) {
        const t0 = performance.now();
        frame(10 + f * 0.016);
        times.push(performance.now() - t0);
      }
      medians.push(median(times));
      await sleep(30);
    }

    // Deterministic capture at fixed time for visual-parity diffing
    frame(10.0);
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(target, 0, 0, W, H, px);
    await post(`/pixels?label=${label}&scenario=${sc.name}`, px, 'application/octet-stream');
    await post(`/png?label=${label}&scenario=${sc.name}`, await pixelsToPngBlob(px), 'image/png');

    const best = Math.min(...medians);
    results.push({ scenario: sc.name, medianMs: best, allMedians: medians });
    log(
      `${sc.name.padEnd(10)} ${best.toFixed(2)} ms  (reps: ${medians.map((m) => m.toFixed(2)).join(', ')})`
    );
    await sleep(50);
  }

  await post(
    `/results?label=${label}`,
    JSON.stringify(
      { label, gpu, width: W, height: H, timedFrames: TIMED_FRAMES, reps: REPS, results },
      null,
      2
    ),
    'application/json'
  );
  log('\nDONE - results saved');
  document.title = 'BENCH DONE';
}

run().catch((e) => {
  log(`ERROR: ${e?.stack ?? e}`);
  document.title = 'BENCH ERROR';
});
