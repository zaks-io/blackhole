import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createBlackbodyLUT } from '../utils/blackbodyLUT';
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
  // Supersampling for anti-aliasing (1 = off, 2 = 2x2, 4 = 4x4)
  supersampleLevel: number;
}

export const defaultLensingParams: LensingParams = {
  rs: 1.0,
  maxSteps: 100,
  diskInnerRadius: 3.0,  // ISCO
  diskOuterRadius: 12.0,
  diskTemperatureInner: 10000,
  diskTemperatureOuter: 3000,
  // Volumetric disk defaults - subtle fuzz
  diskHalfThickness: 0.2,
  diskVolumeDensity: 0.15,
  // Luminance compression - preserves detail on bright Doppler side
  diskLuminanceCompression: 0.15,
  // Texture contrast boost - makes detail survive bloom
  diskTextureContrast: 1.0,
  // Material flow speed - how fast turbulence rotates
  diskMaterialSpeed: 15.0,
  // Base disk opacity - allows stars to show through
  diskOpacity: 0.85,
  // MHD defaults - dramatic cinematic look
  mhdTurbulenceIntensity: 0.8,
  mhdSpiralArms: 2.0,
  mhdSpiralTightness: 3.0,
  mhdHotspotIntensity: 0.7,
  mhdHotspotCount: 3,
  mhdPatternSpeed: 25.0,
  // Supersampling - 1 = off, 2 = 2x2 (4 samples), 4 = 4x4 (16 samples)
  supersampleLevel: 1
};

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
    // Supersampling uniform
    supersampleLevel: { value: 1 }
  },
  vertexShader,
  fragmentShader
};

export class LensingPass extends ShaderPass {
  private blackbodyLUT: THREE.DataTexture;
  
  constructor(starfieldTexture: THREE.Texture) {
    super(LensingShader);
    
    // Create blackbody LUT texture
    this.blackbodyLUT = createBlackbodyLUT();
    this.uniforms['blackbodyLUT'].value = this.blackbodyLUT;
    this.uniforms['starfield'].value = starfieldTexture;
  }
  
  updateCamera(camera: THREE.PerspectiveCamera): void {
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
    if (params.supersampleLevel !== undefined) {
      this.uniforms['supersampleLevel'].value = params.supersampleLevel;
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

