import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { createBlackbodyLUT } from '../utils/blackbodyLUT';
import { createNoiseLUT3D } from '../utils/noiseLUT';
import { buildLensingParams } from '../config';
import { registerLensingChunks } from '../shaders/registerChunks';
import vertexShader from '../shaders/lensing.vert.glsl';
import fragmentShader from '../shaders/lensing.frag.glsl';

// Register shader chunks before they are needed
registerLensingChunks();

// MHD turbulence is the dominant per-sample cost (16 noise fetches), so it is
// baked once per frame into a log-polar LUT (u = phi, v = log r) that the main
// pass reads with a single fetch. MHD_BAKE_PASS hides the LUT sampler from the
// bake shader itself so getMHDCombined is evaluated directly.
const MHD_LUT_WIDTH = 1024;
const MHD_LUT_HEIGHT = 512;

const mhdBakeFragmentShader = /* glsl */ `
precision highp float;

#define MHD_BAKE_PASS
#include <lensing_uniforms>
#include <lensing_noise>
#include <lensing_mhd>

void main() {
  float phi = (vUv.x - 0.5) * 2.0 * PI;
  float r = mhdLutRMin * exp(vUv.y * mhdLutLogRange);
  MHDResult m = getMHDCombined(r, phi, time, 1.0);
  gl_FragColor = vec4(m.density, m.temperature, 0.0, 1.0);
}
`;

export interface LensingParams {
  rs: number;
  maxSteps: number;
  diskInnerRadius: number;
  diskOuterRadius: number;
  diskTemperatureInner: number;
  diskTemperatureOuter: number;
  // Volumetric disk parameters
  diskHalfThickness: number;
  diskVolumeDensity: number;
  // Luminance compression for detail preservation
  diskLuminanceCompression: number;
  // Texture contrast boost (survives bloom)
  diskTextureContrast: number;
  // Material/turbulence flow speed
  diskMaterialSpeed: number;
  // Base disk opacity (0 = transparent, 1 = opaque)
  diskOpacity: number;
  // m=1 eccentric disk mode (single-BH only): amplitude and apsidal
  // precession speed multiplier (1 = the GR rate at 2 * r_in)
  diskEccentricity: number;
  diskEccentricityPrecessionSpeed: number;
  // MHD parameters
  mhdTurbulenceIntensity: number;
  mhdSpiralArms: number;
  mhdSpiralTightness: number;
  mhdHotspotIntensity: number;
  mhdHotspotCount: number;
  mhdPatternSpeed: number;
  mhdMinDensity: number;
  // Epicyclic radial oscillation amplitude of orbiting hotspots
  mhdHotspotEccentricity: number;
  // Supersampling for anti-aliasing (1 = off, 2 = 2x2, 4 = 4x4)
  supersampleLevel: number;
  // Black hole edge softness (0 = hard edge, 1 = very soft)
  bhEdgeSoftness: number;
  // Photon sphere glow intensity (0 = off, 1 = full)
  photonSphereIntensity: number;
  // Overlay visibility (0 = off, 1 = on)
  overlayIsco: number;
  overlayEventHorizon: number;
  overlayDoppler: number;
  overlayScale: number;
  // Corona layer
  coronaEnabled: number;
  coronaRadius: number;
  coronaDensity: number;
  coronaTemperature: number;
  // Jets layer
  jetsEnabled: number;
  jetsHalfOpeningAngle: number;
  jetsLength: number;
  jetsVelocity: number;
  jetsDensity: number;
  // Thick disk layer
  thickDiskEnabled: number;
  thickDiskHalfThickness: number;
  thickDiskPuffiness: number;
  // LOD system
  lodEnabled: number;
  lodNearDistance: number;
  lodFarDistance: number;
  // Anti-banding step refinement
  stepJitter: number;
  curvatureAdaptation: number;
  coronaStepRefinement: number;
  baseStepSize: number;
  // Noise LUT animation
  noiseTimeScale: number;
  // Binary black hole system
  binaryEnabled: number;
  binaryMass1: number;
  binarySeparation: number;
  circumbinaryOuterRadius: number;
  binaryBlendWidth: number;
  streamWidth: number;
  streamDensity: number;
}

// Default params built from centralized config
export const defaultLensingParams: LensingParams = buildLensingParams();

const LensingShader = {
  name: 'LensingShader',
  uniforms: {
    tDiffuse: { value: null },
    starfield: { value: null },
    starfieldNext: { value: null },
    starfieldBlend: { value: 0.0 },
    starfieldExposure: { value: 0.5 },
    blackbodyLUT: { value: null },
    noiseLUT: { value: null },
    noiseTimeScale: { value: 0.02 },
    cameraPos: { value: new THREE.Vector3() },
    inverseProjection: { value: new THREE.Matrix4() },
    inverseView: { value: new THREE.Matrix4() },
    rs: { value: 1.0 },
    maxSteps: { value: 40 },
    resolution: { value: new THREE.Vector2() },
    diskInnerRadius: { value: 3.0 },
    diskOuterRadius: { value: 12.0 },
    diskTemperatureInner: { value: 10000.0 },
    diskTemperatureOuter: { value: 3000.0 },
    time: { value: 0.0 },
    // Volumetric disk uniforms
    diskHalfThickness: { value: 0.2 },
    diskVolumeDensity: { value: 0.15 },
    // Luminance compression uniform
    diskLuminanceCompression: { value: 0.0 },
    // Texture contrast uniform
    diskTextureContrast: { value: 0.0 },
    // Material speed uniform
    diskMaterialSpeed: { value: 15.0 },
    // Disk opacity uniform
    diskOpacity: { value: 0.85 },
    // Eccentric disk uniforms (rate precomputed CPU-side)
    diskEccentricity: { value: 0.0 },
    diskEccPrecRate: { value: 0.0 },
    // MHD uniforms
    mhdTurbulenceIntensity: { value: 0.8 },
    mhdSpiralArms: { value: 2.0 },
    mhdSpiralTightness: { value: 3.0 },
    mhdHotspotIntensity: { value: 0.7 },
    mhdHotspotCount: { value: 3 },
    mhdPatternSpeed: { value: 25.0 },
    mhdMinDensity: { value: 0.5 },
    mhdHotspotEccentricity: { value: 0.0 },
    mhdLUT: { value: null },
    mhdLutRMin: { value: 1.5 },
    mhdLutLogRange: { value: 2.5 },
    // Supersampling uniform
    supersampleLevel: { value: 1 },
    // Black hole edge softness uniform
    bhEdgeSoftness: { value: 0.5 },
    // Optional cinematic ring enhancement
    photonSphereIntensity: { value: 0.0 },
    // Overlay uniforms
    overlayIsco: { value: 0.0 },
    overlayEventHorizon: { value: 0.0 },
    overlayDoppler: { value: 0.0 },
    overlayScale: { value: 0.0 },
    // Corona layer uniforms
    coronaEnabled: { value: 0.0 },
    coronaRadius: { value: 6.0 },
    coronaDensity: { value: 0.1 },
    coronaTemperature: { value: 100000.0 },
    // Jets layer uniforms
    jetsEnabled: { value: 0.0 },
    jetsHalfOpeningAngle: { value: 10.0 },
    jetsLength: { value: 30.0 },
    jetsVelocity: { value: 0.8 },
    jetsDensity: { value: 0.05 },
    // Thick disk layer uniforms
    thickDiskEnabled: { value: 0.0 },
    thickDiskHalfThickness: { value: 0.5 },
    thickDiskPuffiness: { value: 0.3 },
    // LOD uniforms
    lodEnabled: { value: 1.0 },
    lodNearDistance: { value: 10.0 },
    lodFarDistance: { value: 50.0 },
    // Anti-banding step refinement uniforms
    stepJitter: { value: 0.0 },
    curvatureAdaptation: { value: 1.0 },
    coronaStepRefinement: { value: 1.0 },
    baseStepSize: { value: 0.2 },
    // Precomputed values (CPU-side optimization)
    photonRingLogInner: { value: 0.0 },
    photonRingLogOuter: { value: 0.0 },
    diskRadiusRange: { value: 9.0 },
    anyOverlayEnabled: { value: 0.0 },
    // Binary black hole system
    binaryEnabled: { value: 0.0 },
    binaryMass1: { value: 0.5 },
    binaryMass2: { value: 0.5 },
    binarySeparation: { value: 8.0 },
    bh1Pos: { value: new THREE.Vector2(-4.0, 0.0) },
    bh2Pos: { value: new THREE.Vector2(4.0, 0.0) },
    circumbinaryInnerRadius: { value: 20.0 },
    circumbinaryOuterRadius: { value: 30.0 },
    binaryBlendWidth: { value: 2.0 },
    streamWidth: { value: 1.0 },
    streamDensity: { value: 1.0 },
  },
  vertexShader,
  fragmentShader,
};

export class LensingPass extends ShaderPass {
  private blackbodyLUT: THREE.DataTexture;
  private noiseLUT: THREE.Data3DTexture;

  // Per-frame MHD turbulence bake target and pass
  private mhdLutTarget: THREE.WebGLRenderTarget;
  private mhdBakeMaterial: THREE.ShaderMaterial;
  private mhdBakeQuad: FullScreenQuad;

  // Camera caching for uniform update optimization
  private lastCameraPosition = new THREE.Vector3();
  private lastCameraMatrixWorld = new THREE.Matrix4();
  private lastProjectionMatrix = new THREE.Matrix4();

  // Binary orbital phase for audio sync, integrated incrementally so that
  // changing the separation mid-flight changes the rate without teleporting
  private currentOrbitalPhase = 0;
  private lastBinaryTime: number | null = null;

  // CPU-side inputs to precomputed uniforms
  private eccentricityPrecessionSpeed = 1.0;
  private explicitCircumbinaryOuter = 30.0;

  constructor(starfieldTexture: THREE.Texture, noiseTextureSize: number = 128) {
    super(LensingShader);

    // Create blackbody LUT texture
    this.blackbodyLUT = createBlackbodyLUT();
    this.uniforms['blackbodyLUT'].value = this.blackbodyLUT;
    this.uniforms['starfield'].value = starfieldTexture;
    this.uniforms['starfieldNext'].value = starfieldTexture;

    // Create 3D noise LUT texture
    this.noiseLUT = createNoiseLUT3D(noiseTextureSize);
    this.uniforms['noiseLUT'].value = this.noiseLUT;

    // MHD LUT bake target: phi wraps (RepeatWrapping in u), log-r clamps
    this.mhdLutTarget = new THREE.WebGLRenderTarget(MHD_LUT_WIDTH, MHD_LUT_HEIGHT, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.uniforms['mhdLUT'].value = this.mhdLutTarget.texture;

    // The bake material shares this.uniforms, so time and MHD parameter
    // updates flow into the bake pass with no extra bookkeeping
    this.mhdBakeMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader: mhdBakeFragmentShader,
    });
    this.mhdBakeQuad = new FullScreenQuad(this.mhdBakeMaterial);

    this.updateMhdLutRange();
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean
  ): void {
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.mhdLutTarget);
    this.mhdBakeQuad.render(renderer);
    renderer.setRenderTarget(prevTarget);

    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  // The LUT's radial window must cover every (r, phi) the disk shaders ask
  // for: in single mode the eccentric streamline label a = r(1 + e cos f)
  // stays within [inner, outer] (eccentricity tapers to zero at both edges),
  // leaving 1.5x outer as margin; in binary mode the mini-disks
  // sample rescaled radii near the inner edge while the circumbinary disk
  // reaches out to its configured outer radius.
  private updateMhdLutRange(): void {
    const binary = (this.uniforms['binaryEnabled'].value as number) > 0.5;
    const diskInner = this.uniforms['diskInnerRadius'].value as number;
    const diskOuter = this.uniforms['diskOuterRadius'].value as number;

    let rMin: number;
    let rMax: number;
    if (binary) {
      rMin = Math.max(0.15, 0.2 * diskInner);
      rMax = Math.max(this.uniforms['circumbinaryOuterRadius'].value as number, 1.5 * diskOuter);
    } else {
      rMin = 0.5 * diskInner;
      rMax = 1.5 * diskOuter;
    }

    this.uniforms['mhdLutRMin'].value = rMin;
    this.uniforms['mhdLutLogRange'].value = Math.log(rMax / rMin);
  }

  updateCamera(camera: THREE.PerspectiveCamera): void {
    // Skip update if camera hasn't moved (optimization for static camera)
    if (
      this.lastCameraPosition.equals(camera.position) &&
      this.lastCameraMatrixWorld.equals(camera.matrixWorld) &&
      this.lastProjectionMatrix.equals(camera.projectionMatrix)
    ) {
      return;
    }

    // Cache current state
    this.lastCameraPosition.copy(camera.position);
    this.lastCameraMatrixWorld.copy(camera.matrixWorld);
    this.lastProjectionMatrix.copy(camera.projectionMatrix);

    // Update uniforms
    this.uniforms['cameraPos'].value.copy(camera.position);
    this.uniforms['inverseProjection'].value.copy(camera.projectionMatrixInverse);
    this.uniforms['inverseView'].value.copy(camera.matrixWorld);
  }

  updateResolution(width: number, height: number): void {
    this.uniforms['resolution'].value.set(width, height);
  }

  updateParams(params: Partial<LensingParams>): void {
    if (params.rs !== undefined) {
      this.uniforms['rs'].value = params.rs;
      // Update disk radii relative to rs
      this.uniforms['diskInnerRadius'].value = params.diskInnerRadius ?? 3.0 * params.rs;
      this.uniforms['diskOuterRadius'].value = params.diskOuterRadius ?? 12.0 * params.rs;
      // Update precomputed values
      this.updatePrecomputedUniforms();
    }
    if (params.maxSteps !== undefined) {
      this.uniforms['maxSteps'].value = params.maxSteps;
    }
    if (params.diskInnerRadius !== undefined) {
      this.uniforms['diskInnerRadius'].value = params.diskInnerRadius;
      this.updatePrecomputedUniforms();
    }
    if (params.diskOuterRadius !== undefined) {
      this.uniforms['diskOuterRadius'].value = params.diskOuterRadius;
      this.updatePrecomputedUniforms();
    }
    if (params.diskTemperatureInner !== undefined) {
      this.uniforms['diskTemperatureInner'].value = params.diskTemperatureInner;
    }
    if (params.diskTemperatureOuter !== undefined) {
      this.uniforms['diskTemperatureOuter'].value = params.diskTemperatureOuter;
    }
    // Volumetric disk parameters
    if (params.diskHalfThickness !== undefined) {
      this.uniforms['diskHalfThickness'].value = params.diskHalfThickness;
    }
    if (params.diskVolumeDensity !== undefined) {
      this.uniforms['diskVolumeDensity'].value = params.diskVolumeDensity;
    }
    // Luminance compression
    if (params.diskLuminanceCompression !== undefined) {
      this.uniforms['diskLuminanceCompression'].value = params.diskLuminanceCompression;
    }
    // Texture contrast
    if (params.diskTextureContrast !== undefined) {
      this.uniforms['diskTextureContrast'].value = params.diskTextureContrast;
    }
    // Material speed
    if (params.diskMaterialSpeed !== undefined) {
      this.uniforms['diskMaterialSpeed'].value = params.diskMaterialSpeed;
    }
    // Disk opacity
    if (params.diskOpacity !== undefined) {
      this.uniforms['diskOpacity'].value = params.diskOpacity;
    }
    // Eccentric disk mode
    if (params.diskEccentricity !== undefined) {
      this.uniforms['diskEccentricity'].value = params.diskEccentricity;
    }
    if (params.diskEccentricityPrecessionSpeed !== undefined) {
      this.eccentricityPrecessionSpeed = params.diskEccentricityPrecessionSpeed;
      this.updatePrecomputedUniforms();
    }
    // MHD parameters
    if (params.mhdTurbulenceIntensity !== undefined) {
      this.uniforms['mhdTurbulenceIntensity'].value = params.mhdTurbulenceIntensity;
    }
    if (params.mhdSpiralArms !== undefined) {
      this.uniforms['mhdSpiralArms'].value = params.mhdSpiralArms;
    }
    if (params.mhdSpiralTightness !== undefined) {
      this.uniforms['mhdSpiralTightness'].value = params.mhdSpiralTightness;
    }
    if (params.mhdHotspotIntensity !== undefined) {
      this.uniforms['mhdHotspotIntensity'].value = params.mhdHotspotIntensity;
    }
    if (params.mhdHotspotCount !== undefined) {
      this.uniforms['mhdHotspotCount'].value = params.mhdHotspotCount;
    }
    if (params.mhdPatternSpeed !== undefined) {
      this.uniforms['mhdPatternSpeed'].value = params.mhdPatternSpeed;
    }
    if (params.mhdMinDensity !== undefined) {
      this.uniforms['mhdMinDensity'].value = params.mhdMinDensity;
    }
    if (params.mhdHotspotEccentricity !== undefined) {
      this.uniforms['mhdHotspotEccentricity'].value = params.mhdHotspotEccentricity;
    }
    if (params.supersampleLevel !== undefined) {
      this.uniforms['supersampleLevel'].value = params.supersampleLevel;
    }
    if (params.bhEdgeSoftness !== undefined) {
      this.uniforms['bhEdgeSoftness'].value = params.bhEdgeSoftness;
    }
    if (params.photonSphereIntensity !== undefined) {
      this.uniforms['photonSphereIntensity'].value = params.photonSphereIntensity;
    }
    // Overlay parameters
    if (params.overlayIsco !== undefined) {
      this.uniforms['overlayIsco'].value = params.overlayIsco;
      this.updateAnyOverlayEnabled();
    }
    if (params.overlayEventHorizon !== undefined) {
      this.uniforms['overlayEventHorizon'].value = params.overlayEventHorizon;
      this.updateAnyOverlayEnabled();
    }
    if (params.overlayDoppler !== undefined) {
      this.uniforms['overlayDoppler'].value = params.overlayDoppler;
      this.updateAnyOverlayEnabled();
    }
    if (params.overlayScale !== undefined) {
      this.uniforms['overlayScale'].value = params.overlayScale;
      this.updateAnyOverlayEnabled();
    }
    // Corona layer parameters
    if (params.coronaEnabled !== undefined) {
      this.uniforms['coronaEnabled'].value = params.coronaEnabled;
    }
    if (params.coronaRadius !== undefined) {
      this.uniforms['coronaRadius'].value = params.coronaRadius;
    }
    if (params.coronaDensity !== undefined) {
      this.uniforms['coronaDensity'].value = params.coronaDensity;
    }
    if (params.coronaTemperature !== undefined) {
      this.uniforms['coronaTemperature'].value = params.coronaTemperature;
    }
    // Jets layer parameters
    if (params.jetsEnabled !== undefined) {
      this.uniforms['jetsEnabled'].value = params.jetsEnabled;
    }
    if (params.jetsHalfOpeningAngle !== undefined) {
      this.uniforms['jetsHalfOpeningAngle'].value = params.jetsHalfOpeningAngle;
    }
    if (params.jetsLength !== undefined) {
      this.uniforms['jetsLength'].value = params.jetsLength;
    }
    if (params.jetsVelocity !== undefined) {
      this.uniforms['jetsVelocity'].value = params.jetsVelocity;
    }
    if (params.jetsDensity !== undefined) {
      this.uniforms['jetsDensity'].value = params.jetsDensity;
    }
    // Thick disk layer parameters
    if (params.thickDiskEnabled !== undefined) {
      this.uniforms['thickDiskEnabled'].value = params.thickDiskEnabled;
    }
    if (params.thickDiskHalfThickness !== undefined) {
      this.uniforms['thickDiskHalfThickness'].value = params.thickDiskHalfThickness;
    }
    if (params.thickDiskPuffiness !== undefined) {
      this.uniforms['thickDiskPuffiness'].value = params.thickDiskPuffiness;
    }
    // LOD parameters
    if (params.lodEnabled !== undefined) {
      this.uniforms['lodEnabled'].value = params.lodEnabled;
    }
    if (params.lodNearDistance !== undefined) {
      this.uniforms['lodNearDistance'].value = params.lodNearDistance;
    }
    if (params.lodFarDistance !== undefined) {
      this.uniforms['lodFarDistance'].value = params.lodFarDistance;
    }
    // Anti-banding step refinement parameters
    if (params.stepJitter !== undefined) {
      this.uniforms['stepJitter'].value = params.stepJitter;
    }
    if (params.curvatureAdaptation !== undefined) {
      this.uniforms['curvatureAdaptation'].value = params.curvatureAdaptation;
    }
    if (params.coronaStepRefinement !== undefined) {
      this.uniforms['coronaStepRefinement'].value = params.coronaStepRefinement;
    }
    if (params.baseStepSize !== undefined) {
      this.uniforms['baseStepSize'].value = params.baseStepSize;
    }
    if (params.noiseTimeScale !== undefined) {
      this.uniforms['noiseTimeScale'].value = params.noiseTimeScale;
    }
    // Binary black hole system. The mode is a compile-time specialization:
    // toggling it swaps the BINARY_MODE define and recompiles the shader,
    // which keeps the single-BH hot loop free of per-BH register pressure.
    if (params.binaryEnabled !== undefined) {
      this.uniforms['binaryEnabled'].value = params.binaryEnabled;
      const wantBinary = params.binaryEnabled > 0.5;
      const hasBinary = 'BINARY_MODE' in this.material.defines;
      if (wantBinary !== hasBinary) {
        if (wantBinary) {
          this.material.defines['BINARY_MODE'] = '';
        } else {
          delete this.material.defines['BINARY_MODE'];
        }
        this.material.needsUpdate = true;
      }
      if (!wantBinary) {
        this.lastBinaryTime = null;
      }
      this.updateMhdLutRange();
    }
    if (params.binaryMass1 !== undefined) {
      this.uniforms['binaryMass1'].value = params.binaryMass1;
      this.uniforms['binaryMass2'].value = 1.0 - params.binaryMass1;
      this.updateBinaryDerivedUniforms();
    }
    if (params.binarySeparation !== undefined) {
      this.uniforms['binarySeparation'].value = params.binarySeparation;
      this.updateBinaryDerivedUniforms();
    }
    if (params.circumbinaryOuterRadius !== undefined) {
      this.explicitCircumbinaryOuter = params.circumbinaryOuterRadius;
      this.updateBinaryDerivedUniforms();
    }
    if (params.binaryBlendWidth !== undefined) {
      this.uniforms['binaryBlendWidth'].value = params.binaryBlendWidth;
    }
    if (params.streamWidth !== undefined) {
      this.uniforms['streamWidth'].value = params.streamWidth;
    }
    if (params.streamDensity !== undefined) {
      this.uniforms['streamDensity'].value = params.streamDensity;
    }
  }

  updateTime(time: number): void {
    this.uniforms['time'].value = time;

    // Update binary BH positions if binary mode is enabled
    if (this.uniforms['binaryEnabled'].value > 0.5) {
      this.updateBinaryPositions(time);
    }
  }

  private updateBinaryPositions(time: number): void {
    const m1 = this.uniforms['binaryMass1'].value as number;
    const m2 = this.uniforms['binaryMass2'].value as number;
    const separation = this.uniforms['binarySeparation'].value as number;
    const rs = this.uniforms['rs'].value as number;

    // Keplerian rate from Kepler's third law: omega = sqrt(GM_tot / a³).
    // Total mass is conserved across the split (rs1 + rs2 = rs), and
    // rs = 2GM/c² with c=1 gives GM_tot = rs/2.
    const omega = Math.sqrt((0.5 * rs) / (separation * separation * separation));

    // Integrate the phase so a separation change adjusts the rate from the
    // current position instead of re-evaluating omega * t (which teleports)
    if (this.lastBinaryTime === null) {
      this.currentOrbitalPhase = (omega * time) % (2 * Math.PI);
    } else {
      this.currentOrbitalPhase =
        (this.currentOrbitalPhase + omega * (time - this.lastBinaryTime)) % (2 * Math.PI);
    }
    this.lastBinaryTime = time;
    const phase = this.currentOrbitalPhase;

    // Distance from center of mass (COM at origin)
    const a1 = separation * m2; // BH1 distance from COM
    const a2 = separation * m1; // BH2 distance from COM

    // Update positions (orbiting in XZ plane, stored as XY in vec2)
    (this.uniforms['bh1Pos'].value as THREE.Vector2).set(
      -a1 * Math.cos(phase),
      -a1 * Math.sin(phase)
    );
    (this.uniforms['bh2Pos'].value as THREE.Vector2).set(
      a2 * Math.cos(phase),
      a2 * Math.sin(phase)
    );
  }

  private updateBinaryDerivedUniforms(): void {
    const separation = this.uniforms['binarySeparation'].value as number;

    // Circumbinary cavity inner edge (~2.5 * separation)
    const inner = 2.5 * separation;
    this.uniforms['circumbinaryInnerRadius'].value = inner;

    // Derive the outer edge from the explicit setting each time so growing
    // the separation pushes the disk out and shrinking it restores the
    // configured radius (a clamp on the uniform itself would be sticky)
    this.uniforms['circumbinaryOuterRadius'].value = Math.max(
      this.explicitCircumbinaryOuter,
      1.4 * inner
    );

    this.updateMhdLutRange();
  }

  setStarfield(texture: THREE.Texture): void {
    this.uniforms['starfield'].value = texture;
    this.uniforms['starfieldNext'].value = texture;
    this.uniforms['starfieldBlend'].value = 0.0;
  }

  setStarfieldNext(texture: THREE.Texture): void {
    this.uniforms['starfieldNext'].value = texture;
  }

  setStarfieldBlend(blend: number): void {
    this.uniforms['starfieldBlend'].value = blend;
  }

  finalizeStarfieldTransition(): void {
    this.uniforms['starfield'].value = this.uniforms['starfieldNext'].value;
    this.uniforms['starfieldBlend'].value = 0.0;
  }

  getCurrentStarfield(): THREE.Texture {
    return this.uniforms['starfield'].value as THREE.Texture;
  }

  setStarfieldExposure(exposure: number): void {
    this.uniforms['starfieldExposure'].value = exposure;
  }

  private updatePrecomputedUniforms(): void {
    const rs = this.uniforms['rs'].value as number;
    const diskInnerRadius = this.uniforms['diskInnerRadius'].value as number;
    const diskOuterRadius = this.uniforms['diskOuterRadius'].value as number;

    // Photon ring log bounds (used for logarithmic photon ring mapping)
    this.uniforms['photonRingLogInner'].value = Math.log(rs * 1.5);
    this.uniforms['photonRingLogOuter'].value = Math.log(diskInnerRadius);

    // Disk radius range (used multiple times in sampleDisk)
    this.uniforms['diskRadiusRange'].value = diskOuterRadius - diskInnerRadius;

    // Rigid apsidal precession rate for the m=1 eccentric mode: the GR
    // periapsis advance Omega_prec = Omega - kappa = Omega * (1 - sqrt(1 - 3rs/r)),
    // evaluated at a characteristic radius 2 * r_in and scaled by the user
    // multiplier. Precomputed so the shader gets a plain rate in rad/sim-time.
    const rc = 2 * diskInnerRadius;
    const omegaC = Math.sqrt((0.5 * rs) / (rc * rc * rc));
    const omegaPrec = omegaC * (1 - Math.sqrt(Math.max(0, 1 - (3 * rs) / rc)));
    this.uniforms['diskEccPrecRate'].value = this.eccentricityPrecessionSpeed * omegaPrec;

    this.updateMhdLutRange();
  }

  private updateAnyOverlayEnabled(): void {
    const overlayIsco = this.uniforms['overlayIsco'].value as number;
    const overlayEventHorizon = this.uniforms['overlayEventHorizon'].value as number;
    const overlayDoppler = this.uniforms['overlayDoppler'].value as number;
    const overlayScale = this.uniforms['overlayScale'].value as number;

    // Set to 1.0 if any overlay is enabled, 0.0 otherwise
    this.uniforms['anyOverlayEnabled'].value =
      overlayIsco + overlayEventHorizon + overlayDoppler + overlayScale > 0 ? 1.0 : 0.0;
  }

  getBinaryState(): {
    bh1Pos: { x: number; z: number };
    bh2Pos: { x: number; z: number };
    mass1: number;
    mass2: number;
    orbitalPhase: number;
    separation: number;
  } | null {
    if (this.uniforms['binaryEnabled'].value < 0.5) return null;

    const bh1 = this.uniforms['bh1Pos'].value as THREE.Vector2;
    const bh2 = this.uniforms['bh2Pos'].value as THREE.Vector2;

    return {
      bh1Pos: { x: bh1.x, z: bh1.y },
      bh2Pos: { x: bh2.x, z: bh2.y },
      mass1: this.uniforms['binaryMass1'].value as number,
      mass2: this.uniforms['binaryMass2'].value as number,
      orbitalPhase: this.currentOrbitalPhase,
      separation: this.uniforms['binarySeparation'].value as number,
    };
  }

  dispose(): void {
    super.dispose();
    this.blackbodyLUT.dispose();
    this.noiseLUT.dispose();
    this.mhdLutTarget.dispose();
    this.mhdBakeMaterial.dispose();
    this.mhdBakeQuad.dispose();
  }
}
