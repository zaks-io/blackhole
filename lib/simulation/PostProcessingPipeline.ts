import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import gsap from 'gsap';
import { LensingPass, LensingParams } from '@/lib/passes/LensingPass';
import { CONFIG } from '@/lib/config';
import { EhtBlurController, PostProcessingConfig } from './types';

export class PostProcessingPipeline {
  private _composer: EffectComposer;
  private _lensingPass: LensingPass;
  private fxaaPass: ShaderPass;
  private bloomPass: UnrealBloomPass;
  private blurPasses: { h: ShaderPass; v: ShaderPass }[] = [];
  private ehtBlurState = { intensity: 0 };
  private ehtBlurEnabled: boolean;
  private ehtBlurStrength: number;
  private renderer: THREE.WebGLRenderer;

  constructor(
    renderer: THREE.WebGLRenderer,
    starfieldTexture: THREE.Texture,
    initialParams: LensingParams,
    config: PostProcessingConfig
  ) {
    this.renderer = renderer;
    this.ehtBlurEnabled = config.ehtBlurEnabled;
    this.ehtBlurStrength = config.ehtBlurStrength;
    this.ehtBlurState.intensity = config.ehtBlurEnabled ? 1.0 : 0.0;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create render target with HalfFloatType for HDR
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._composer = new EffectComposer(renderer, renderTarget);

    // Lensing pass
    this._lensingPass = new LensingPass(starfieldTexture, CONFIG.noise.textureSize);
    this._lensingPass.updateResolution(width, height);
    this._lensingPass.updateParams(initialParams);
    this._composer.addPass(this._lensingPass);

    // FXAA pass
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.uniforms['resolution'].value.set(
      1 / (width * renderer.getPixelRatio()),
      1 / (height * renderer.getPixelRatio())
    );
    this.fxaaPass.enabled = config.fxaaEnabled;
    this._composer.addPass(this.fxaaPass);

    // Bloom pass
    const bloomRes = new THREE.Vector2(
      Math.floor(width * config.bloomResolutionScale),
      Math.floor(height * config.bloomResolutionScale)
    );
    this.bloomPass = new UnrealBloomPass(
      bloomRes,
      config.bloomStrength,
      config.bloomRadius,
      config.bloomThreshold
    );
    this._composer.addPass(this.bloomPass);

    // EHT blur passes
    for (let i = 0; i < config.ehtBlurIterations; i++) {
      const hBlurPass = new ShaderPass(HorizontalBlurShader);
      const vBlurPass = new ShaderPass(VerticalBlurShader);

      const blurAmount = this.ehtBlurStrength * this.ehtBlurState.intensity;
      hBlurPass.uniforms['h'].value = blurAmount / width;
      vBlurPass.uniforms['v'].value = blurAmount / height;

      hBlurPass.enabled = this.ehtBlurEnabled;
      vBlurPass.enabled = this.ehtBlurEnabled;

      this._composer.addPass(hBlurPass);
      this._composer.addPass(vBlurPass);

      this.blurPasses.push({ h: hBlurPass, v: vBlurPass });
    }
  }

  get composer(): EffectComposer {
    return this._composer;
  }

  get lensingPass(): LensingPass {
    return this._lensingPass;
  }

  get ehtBlurController(): EhtBlurController {
    return {
      setEnabled: (enabled: boolean) => this.setEhtBlurEnabled(enabled),
      isEnabled: () => this.ehtBlurEnabled,
    };
  }

  getBlurPasses(): { h: ShaderPass; v: ShaderPass }[] {
    return this.blurPasses;
  }

  private updateBlurStrength(intensity: number): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const blurAmount = this.ehtBlurStrength * intensity;
    const enabled = intensity > 0;

    this.blurPasses.forEach(({ h, v }) => {
      h.uniforms['h'].value = blurAmount / width;
      v.uniforms['v'].value = blurAmount / height;
      h.enabled = enabled;
      v.enabled = enabled;
    });
  }

  setEhtBlurEnabled(enabled: boolean): void {
    this.ehtBlurEnabled = enabled;
    gsap.killTweensOf(this.ehtBlurState);

    gsap.to(this.ehtBlurState, {
      intensity: enabled ? 1.0 : 0.0,
      duration: enabled ? 0.8 : 0.6,
      ease: enabled ? 'power2.in' : 'power2.out',
      onUpdate: () => this.updateBlurStrength(this.ehtBlurState.intensity),
    });
  }

  setEhtBlurStrength(strength: number): void {
    this.ehtBlurStrength = strength;
    this.updateBlurStrength(this.ehtBlurState.intensity);
  }

  setFxaaEnabled(enabled: boolean): void {
    this.fxaaPass.enabled = enabled;
  }

  updateBloom(threshold: number, strength: number, radius: number): void {
    this.bloomPass.threshold = threshold;
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
  }

  updateResolution(width: number, height: number, pixelRatio: number): void {
    this._composer.setSize(width, height);
    this._lensingPass.updateResolution(width, height);

    this.fxaaPass.uniforms['resolution'].value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio)
    );

    const bloomResScale = CONFIG.bloom.resolutionScale;
    this.bloomPass.resolution.set(
      Math.floor(width * bloomResScale),
      Math.floor(height * bloomResScale)
    );

    const blurAmount = this.ehtBlurStrength * this.ehtBlurState.intensity;
    this.blurPasses.forEach(({ h, v }) => {
      h.uniforms['h'].value = blurAmount / width;
      v.uniforms['v'].value = blurAmount / height;
    });
  }

  render(): void {
    this._composer.render();
  }

  dispose(): void {
    this._lensingPass.dispose();
    this._composer.dispose();
  }
}
