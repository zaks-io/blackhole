import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import gsap from 'gsap';
import { blurTexture } from '@/lib/utils/blurTexture';
import { LensingPass } from '@/lib/passes';
import { STARFIELD_BACKGROUNDS, StarfieldKey } from '@/lib/presets';

export class StarfieldManager {
  private renderer: THREE.WebGLRenderer;
  private currentTexture: THREE.Texture | null = null;
  private isTransitioning = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  // Lensing compresses the whole sky into a few pixels near the shadow;
  // without mips + anisotropy the stars alias (shimmer, moire).
  private applyLensingFilters(texture: THREE.Texture): void {
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
  }

  async load(key: StarfieldKey = 'milkyWay'): Promise<THREE.Texture> {
    const bg = STARFIELD_BACKGROUNDS[key];
    const texture = await this.loadTexture(bg.path, bg.hdr);
    this.currentTexture = texture;
    return texture;
  }

  private loadTexture(path: string, isHdr: boolean): Promise<THREE.Texture> {
    return new Promise((resolve) => {
      if (isHdr) {
        const isExr = path.endsWith('.exr');
        const hdrLoader = isExr ? new EXRLoader() : new RGBELoader();
        hdrLoader.load(
          path,
          (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.applyLensingFilters(texture);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            resolve(texture);
          },
          undefined,
          () => {
            console.error('Error loading HDR starfield, using fallback');
            resolve(this.createFallback());
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

            // Blur to smooth compression artifacts (only for non-HDR).
            // Mip filtering is baked into the blur render target; setting it
            // here after the fact would not reach the GPU sampler.
            const blurredTexture = blurTexture(this.renderer, texture, 0.1, 1, 1.0);
            blurredTexture.mapping = THREE.EquirectangularReflectionMapping;
            blurredTexture.wrapS = THREE.RepeatWrapping;
            blurredTexture.wrapT = THREE.ClampToEdgeWrapping;

            texture.dispose();
            resolve(blurredTexture);
          },
          undefined,
          () => {
            console.error('Error loading starfield, using fallback');
            resolve(this.createFallback());
          }
        );
      }
    });
  }

  private createFallback(): THREE.Texture {
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
    this.applyLensingFilters(texture);

    return texture;
  }

  async crossfadeTo(
    key: StarfieldKey,
    lensingPass: LensingPass,
    onExposureChange?: (exposure: number) => void
  ): Promise<void> {
    if (this.isTransitioning) return;

    const bg = STARFIELD_BACKGROUNDS[key];
    const newTexture = await this.loadTexture(bg.path, bg.hdr);
    const oldTexture = lensingPass.getCurrentStarfield();

    this.isTransitioning = true;
    lensingPass.setStarfieldNext(newTexture);
    lensingPass.setStarfieldExposure(bg.exposure);
    onExposureChange?.(bg.exposure);

    const blendState = { value: 0 };
    return new Promise((resolve) => {
      gsap.to(blendState, {
        value: 1,
        duration: 0.8,
        ease: 'power2.inOut',
        onUpdate: () => {
          lensingPass.setStarfieldBlend(blendState.value);
        },
        onComplete: () => {
          lensingPass.finalizeStarfieldTransition();
          oldTexture?.dispose();
          this.currentTexture = newTexture;
          this.isTransitioning = false;
          resolve();
        },
      });
    });
  }

  getCurrentTexture(): THREE.Texture | null {
    return this.currentTexture;
  }

  isTransitionInProgress(): boolean {
    return this.isTransitioning;
  }

  dispose(): void {
    this.currentTexture?.dispose();
    this.currentTexture = null;
  }
}
