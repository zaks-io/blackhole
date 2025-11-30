import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createBlackbodyLUT } from '../utils/blackbodyLUT';
import { buildLensingParams } from '../config';
import vertexShader from '../shaders/lensing.vert.glsl';
import fragmentShader from '../shaders/lensing.frag.glsl';

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
  // MHD parameters
  mhdTurbulenceIntensity: number;
  mhdSpiralArms: number;
  mhdSpiralTightness: number;
  mhdHotspotIntensity: number;
  mhdHotspotCount: number;
  mhdPatternSpeed: number;
  mhdMinDensity: number;
  // Supersampling for anti-aliasing (1 = off, 2 = 2x2, 4 = 4x4)
  supersampleLevel: number;
  // Black hole edge softness (0 = hard edge, 1 = very soft)
  bhEdgeSoftness: number;
  // Photon sphere glow intensity (0 = off, 1 = full)
  photonSphereIntensity: number;
  // Overlay visibility (0 = off, 1 = on)
  overlayIsco: number;
  overlayPhotonSphere: number;
  overlayEventHorizon: number;
  overlayShadowEdge: number;
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
}

// Default params built from centralized config
export const defaultLensingParams: LensingParams = buildLensingParams();

const LensingShader = {
  name: 'LensingShader',
  uniforms: {
    tDiffuse: { value: null },
    starfield: { value: null },
    blackbodyLUT: { value: null },
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
    diskLuminanceCompression: { value: 0.15 },
    // Texture contrast uniform
    diskTextureContrast: { value: 1.0 },
    // Material speed uniform
    diskMaterialSpeed: { value: 15.0 },
    // Disk opacity uniform
    diskOpacity: { value: 0.85 },
    // MHD uniforms
    mhdTurbulenceIntensity: { value: 0.8 },
    mhdSpiralArms: { value: 2.0 },
    mhdSpiralTightness: { value: 3.0 },
    mhdHotspotIntensity: { value: 0.7 },
    mhdHotspotCount: { value: 3 },
    mhdPatternSpeed: { value: 25.0 },
    mhdMinDensity: { value: 0.5 },
    // Supersampling uniform
    supersampleLevel: { value: 1 },
    // Black hole edge softness uniform
    bhEdgeSoftness: { value: 0.5 },
    // Photon sphere glow intensity uniform
    photonSphereIntensity: { value: 0.5 },
    // Overlay uniforms
    overlayIsco: { value: 0.0 },
    overlayPhotonSphere: { value: 0.0 },
    overlayEventHorizon: { value: 0.0 },
    overlayShadowEdge: { value: 0.0 },
    overlayDoppler: { value: 0.0 },
    overlayScale: { value: 0.0 },
    // Corona layer uniforms
    coronaEnabled: { value: 0.0 },
    coronaRadius: { value: 6.0 },
    coronaDensity: { value: 0.05 },
    coronaTemperature: { value: 100000.0 },
    // Jets layer uniforms
    jetsEnabled: { value: 0.0 },
    jetsHalfOpeningAngle: { value: 10.0 },
    jetsLength: { value: 30.0 },
    jetsVelocity: { value: 0.8 },
    jetsDensity: { value: 0.1 },
    // Thick disk layer uniforms
    thickDiskEnabled: { value: 0.0 },
    thickDiskHalfThickness: { value: 0.5 },
    thickDiskPuffiness: { value: 0.3 },
    // LOD uniforms
    lodEnabled: { value: 1.0 },
    lodNearDistance: { value: 10.0 },
    lodFarDistance: { value: 50.0 }
  },
  vertexShader,
  fragmentShader
};

export class LensingPass extends ShaderPass {
  private blackbodyLUT: THREE.DataTexture;

  // Camera caching for uniform update optimization
  private lastCameraPosition = new THREE.Vector3();
  private lastCameraMatrixWorld = new THREE.Matrix4();

  constructor(starfieldTexture: THREE.Texture) {
    super(LensingShader);

    // Create blackbody LUT texture
    this.blackbodyLUT = createBlackbodyLUT();
    this.uniforms['blackbodyLUT'].value = this.blackbodyLUT;
    this.uniforms['starfield'].value = starfieldTexture;
  }

  updateCamera(camera: THREE.PerspectiveCamera): void {
    // Skip update if camera hasn't moved (optimization for static camera)
    if (
      this.lastCameraPosition.equals(camera.position) &&
      this.lastCameraMatrixWorld.equals(camera.matrixWorld)
    ) {
      return;
    }

    // Cache current state
    this.lastCameraPosition.copy(camera.position);
    this.lastCameraMatrixWorld.copy(camera.matrixWorld);

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
    }
    if (params.maxSteps !== undefined) {
      this.uniforms['maxSteps'].value = params.maxSteps;
    }
    if (params.diskInnerRadius !== undefined) {
      this.uniforms['diskInnerRadius'].value = params.diskInnerRadius;
    }
    if (params.diskOuterRadius !== undefined) {
      this.uniforms['diskOuterRadius'].value = params.diskOuterRadius;
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
    }
    if (params.overlayPhotonSphere !== undefined) {
      this.uniforms['overlayPhotonSphere'].value = params.overlayPhotonSphere;
    }
    if (params.overlayEventHorizon !== undefined) {
      this.uniforms['overlayEventHorizon'].value = params.overlayEventHorizon;
    }
    if (params.overlayShadowEdge !== undefined) {
      this.uniforms['overlayShadowEdge'].value = params.overlayShadowEdge;
    }
    if (params.overlayDoppler !== undefined) {
      this.uniforms['overlayDoppler'].value = params.overlayDoppler;
    }
    if (params.overlayScale !== undefined) {
      this.uniforms['overlayScale'].value = params.overlayScale;
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
  }
  
  updateTime(time: number): void {
    this.uniforms['time'].value = time;
  }
  
  setStarfield(texture: THREE.Texture): void {
    this.uniforms['starfield'].value = texture;
  }
  
  dispose(): void {
    this.blackbodyLUT.dispose();
  }
}

