import * as THREE from 'three';

/**
 * Generate a 256-entry blackbody color lookup table texture
 * Covers temperatures from 1000K to 15000K
 * 
 * Uses Planck's law approximation via color temperature formulas
 * Based on algorithm by Tanner Helland
 */
export function createBlackbodyLUT(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * 4);
  
  for (let i = 0; i < size; i++) {
    // Map index to temperature: 1000K to 15000K
    const temperature = 1000 + (i / (size - 1)) * 14000;
    const rgb = temperatureToRGB(temperature);
    
    data[i * 4 + 0] = Math.round(rgb.r * 255);
    data[i * 4 + 1] = Math.round(rgb.g * 255);
    data[i * 4 + 2] = Math.round(rgb.b * 255);
    data[i * 4 + 3] = 255;
  }
  
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  
  return texture;
}

/**
 * Convert color temperature in Kelvin to RGB
 * Algorithm based on Tanner Helland's approximation
 * which is derived from CIE color matching functions
 */
function temperatureToRGB(kelvin: number): { r: number; g: number; b: number } {
  const temp = kelvin / 100;
  
  let r: number, g: number, b: number;
  
  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }
  
  // Green
  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    g = Math.max(0, Math.min(255, g));
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    g = Math.max(0, Math.min(255, g));
  }
  
  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = temp - 10;
    b = 138.5177312231 * Math.log(b) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }
  
  return {
    r: r / 255,
    g: g / 255,
    b: b / 255
  };
}

export { temperatureToRGB };

