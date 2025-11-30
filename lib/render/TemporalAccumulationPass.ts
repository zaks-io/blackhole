import * as THREE from 'three';
import { haltonJitter } from '../utils/haltonSequence';

/**
 * Manages temporal accumulation for high-quality offline rendering
 * Renders multiple samples per frame with sub-pixel jitter and averages them
 */
export class TemporalAccumulator {
  private accumulationTargetA: THREE.WebGLRenderTarget;
  private accumulationTargetB: THREE.WebGLRenderTarget;
  private pingPong: boolean = false;
  private currentSample: number = 0;
  private totalSamples: number;
  private resolution: THREE.Vector2;
  private blendMaterial: THREE.ShaderMaterial;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;

  constructor(width: number, height: number, samples: number) {
    this.totalSamples = samples;
    this.resolution = new THREE.Vector2(width, height);

    const targetOptions: THREE.RenderTargetOptions = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.accumulationTargetA = new THREE.WebGLRenderTarget(width, height, targetOptions);
    this.accumulationTargetB = new THREE.WebGLRenderTarget(width, height, targetOptions);

    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tPrevAccum: { value: null },
        tCurrentFrame: { value: null },
        sampleWeight: { value: 1.0 },
        prevWeight: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tPrevAccum;
        uniform sampler2D tCurrentFrame;
        uniform float sampleWeight;
        uniform float prevWeight;
        varying vec2 vUv;

        void main() {
          vec4 prev = texture2D(tPrevAccum, vUv);
          vec4 curr = texture2D(tCurrentFrame, vUv);
          gl_FragColor = prev * prevWeight + curr * sampleWeight;
        }
      `,
    });

    // Setup fullscreen quad for blending
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.blendMaterial);
    this.scene.add(this.quad);
  }

  get readTarget(): THREE.WebGLRenderTarget {
    return this.pingPong ? this.accumulationTargetB : this.accumulationTargetA;
  }

  get writeTarget(): THREE.WebGLRenderTarget {
    return this.pingPong ? this.accumulationTargetA : this.accumulationTargetB;
  }

  /**
   * Get the current jitter offset for the projection matrix
   */
  getCurrentJitter(): { x: number; y: number } {
    return haltonJitter(this.currentSample);
  }

  /**
   * Apply sub-pixel jitter to the camera's projection matrix
   */
  applyJitterToCamera(camera: THREE.PerspectiveCamera): void {
    const jitter = this.getCurrentJitter();
    const pixelJitterX = (jitter.x * 2.0) / this.resolution.x;
    const pixelJitterY = (jitter.y * 2.0) / this.resolution.y;

    // Modify projection matrix to add jitter
    camera.projectionMatrix.elements[8] = pixelJitterX;
    camera.projectionMatrix.elements[9] = pixelJitterY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /**
   * Remove jitter from camera's projection matrix
   */
  clearJitterFromCamera(camera: THREE.PerspectiveCamera): void {
    camera.projectionMatrix.elements[8] = 0;
    camera.projectionMatrix.elements[9] = 0;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  /**
   * Accumulate a new sample into the buffer
   */
  accumulate(renderer: THREE.WebGLRenderer, currentFrameTexture: THREE.Texture): void {
    const sampleIndex = this.currentSample;

    // Running average weights
    const sampleWeight = 1.0 / (sampleIndex + 1);
    const prevWeight = 1.0 - sampleWeight;

    this.blendMaterial.uniforms.tCurrentFrame.value = currentFrameTexture;
    this.blendMaterial.uniforms.tPrevAccum.value = this.readTarget.texture;
    this.blendMaterial.uniforms.sampleWeight.value = sampleWeight;
    this.blendMaterial.uniforms.prevWeight.value = prevWeight;

    renderer.setRenderTarget(this.writeTarget);
    renderer.render(this.scene, this.camera);

    this.pingPong = !this.pingPong;
    this.currentSample++;
  }

  /**
   * Check if all samples for this frame have been accumulated
   */
  isComplete(): boolean {
    return this.currentSample >= this.totalSamples;
  }

  /**
   * Reset for a new frame
   */
  reset(): void {
    this.currentSample = 0;
    this.pingPong = false;
  }

  /**
   * Get the accumulated result texture
   */
  getResult(): THREE.Texture {
    return this.readTarget.texture;
  }

  /**
   * Get current sample index
   */
  getCurrentSampleIndex(): number {
    return this.currentSample;
  }

  /**
   * Set the number of samples per frame
   */
  setSamples(samples: number): void {
    this.totalSamples = samples;
  }

  /**
   * Resize the accumulation buffers
   */
  setSize(width: number, height: number): void {
    this.resolution.set(width, height);
    this.accumulationTargetA.setSize(width, height);
    this.accumulationTargetB.setSize(width, height);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.accumulationTargetA.dispose();
    this.accumulationTargetB.dispose();
    this.blendMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
