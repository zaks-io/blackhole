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
}

export const defaultLensingParams: LensingParams = {
  rs: 1.0,
  maxSteps: 100,
  diskInnerRadius: 3.0,  // ISCO
  diskOuterRadius: 12.0,
  diskTemperatureInner: 10000,
  diskTemperatureOuter: 3000
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
    time: { value: 0.0 }
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

