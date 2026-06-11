import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

// Brightness adjustment shader - dims the starfield
const BrightnessShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float brightness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb *= brightness;
      gl_FragColor = color;
    }
  `,
};

/**
 * Pre-blurs a texture and optionally adjusts brightness.
 * Used to process the starfield texture once at load time.
 */
export function blurTexture(
  renderer: THREE.WebGLRenderer,
  texture: THREE.Texture,
  strength: number,
  iterations: number = 1,
  brightness: number = 1.0
): THREE.Texture {
  const width = texture.image?.width || 4096;
  const height = texture.image?.height || 2048;

  // Create two render targets for ping-pong blurring. The result is sampled
  // under extreme lensing minification, so it needs mips + anisotropy or the
  // stars alias; the renderer regenerates mips after each render-to-target.
  const rtOptions: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    depthBuffer: false,
    stencilBuffer: false,
  };

  const rtA = new THREE.WebGLRenderTarget(width, height, rtOptions);
  const rtB = new THREE.WebGLRenderTarget(width, height, rtOptions);

  // Create blur materials
  const hBlurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      h: { value: strength / width },
    },
    vertexShader: HorizontalBlurShader.vertexShader,
    fragmentShader: HorizontalBlurShader.fragmentShader,
  });

  const vBlurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      v: { value: strength / height },
    },
    vertexShader: VerticalBlurShader.vertexShader,
    fragmentShader: VerticalBlurShader.fragmentShader,
  });

  // Brightness material
  const brightnessMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      brightness: { value: brightness },
    },
    vertexShader: BrightnessShader.vertexShader,
    fragmentShader: BrightnessShader.fragmentShader,
  });

  // Fullscreen quad setup
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, hBlurMaterial);
  const scene = new THREE.Scene();
  scene.add(mesh);

  let readTarget = rtA;
  let writeTarget = rtB;

  // First pass: copy input texture with horizontal blur
  hBlurMaterial.uniforms.tDiffuse.value = texture;
  mesh.material = hBlurMaterial;
  renderer.setRenderTarget(writeTarget);
  renderer.render(scene, camera);

  // Swap targets
  [readTarget, writeTarget] = [writeTarget, readTarget];

  // Vertical blur
  vBlurMaterial.uniforms.tDiffuse.value = readTarget.texture;
  mesh.material = vBlurMaterial;
  renderer.setRenderTarget(writeTarget);
  renderer.render(scene, camera);

  // Additional iterations
  for (let i = 1; i < iterations; i++) {
    [readTarget, writeTarget] = [writeTarget, readTarget];

    // Horizontal
    hBlurMaterial.uniforms.tDiffuse.value = readTarget.texture;
    mesh.material = hBlurMaterial;
    renderer.setRenderTarget(writeTarget);
    renderer.render(scene, camera);

    [readTarget, writeTarget] = [writeTarget, readTarget];

    // Vertical
    vBlurMaterial.uniforms.tDiffuse.value = readTarget.texture;
    mesh.material = vBlurMaterial;
    renderer.setRenderTarget(writeTarget);
    renderer.render(scene, camera);
  }

  // Apply brightness adjustment if needed
  if (brightness !== 1.0) {
    [readTarget, writeTarget] = [writeTarget, readTarget];
    brightnessMaterial.uniforms.tDiffuse.value = readTarget.texture;
    mesh.material = brightnessMaterial;
    renderer.setRenderTarget(writeTarget);
    renderer.render(scene, camera);
  }

  // Reset render target
  renderer.setRenderTarget(null);

  // The result is in writeTarget after the last pass
  const resultTexture = writeTarget.texture;

  // Copy texture properties from original
  resultTexture.mapping = texture.mapping;
  resultTexture.wrapS = texture.wrapS;
  resultTexture.wrapT = texture.wrapT;

  // Cleanup the unused render target
  readTarget.dispose();

  // Cleanup materials and geometry
  hBlurMaterial.dispose();
  vBlurMaterial.dispose();
  brightnessMaterial.dispose();
  geometry.dispose();

  return resultTexture;
}
