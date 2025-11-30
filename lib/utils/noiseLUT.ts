import * as THREE from 'three';

/**
 * Generate a 3D simplex noise lookup table texture
 * Uses the Z dimension for time-based animation (cycling through Z slices)
 */
export function createNoiseLUT3D(size: number = 128): THREE.Data3DTexture {
  const data = new Uint8Array(size * size * size * 4);

  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Normalize coordinates to [0, 1] range for seamless tiling
        const nx = x / size;
        const ny = y / size;
        const nz = z / size;

        // Generate seamless tileable 3D simplex noise
        // Use 4D simplex noise with coordinates on a torus for seamless tiling
        const noise = seamlessNoise3D(nx, ny, nz, size);

        // Convert from [-1, 1] to [0, 255]
        const value = Math.round((noise * 0.5 + 0.5) * 255);

        const idx = (z * size * size + y * size + x) * 4;
        data[idx + 0] = value; // R
        data[idx + 1] = value; // G (same value for grayscale)
        data[idx + 2] = value; // B (same value for grayscale)
        data[idx + 3] = 255; // A
      }
    }
  }

  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.needsUpdate = true;

  return texture;
}

/**
 * Generate seamless tileable 3D noise using 4D simplex noise on a torus
 * This ensures the noise tiles perfectly at all boundaries
 */
function seamlessNoise3D(x: number, y: number, z: number, size: number): number {
  // Map 3D coordinates to 6D torus for perfect tiling
  // Each axis wraps around using sin/cos pairs
  const scale = 4.0; // Controls noise frequency

  const s = x * Math.PI * 2;
  const t = y * Math.PI * 2;
  const u = z * Math.PI * 2;

  // 6D coordinates on a 3-torus
  const nx1 = Math.cos(s) * scale;
  const nx2 = Math.sin(s) * scale;
  const ny1 = Math.cos(t) * scale;
  const ny2 = Math.sin(t) * scale;
  const nz1 = Math.cos(u) * scale;
  const nz2 = Math.sin(u) * scale;

  // Use 3D simplex noise with modified coordinates
  // We'll combine multiple samples for a pseudo-6D effect
  const n1 = simplex3D(nx1, ny1, nz1);
  const n2 = simplex3D(nx2, ny2, nz2);
  const n3 = simplex3D(nx1 + ny2, ny1 + nz2, nz1 + nx2);

  return (n1 + n2 + n3) / 3.0;
}

// Simplex 3D noise implementation
// Based on Stefan Gustavson's implementation

const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

// Permutation table
const perm = new Uint8Array(512);
const permMod12 = new Uint8Array(512);

// Initialize permutation table with random values
const p = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142,
  8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203,
  117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165,
  71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92,
  41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208,
  89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
  226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58,
  17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155,
  167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218,
  246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14,
  239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150,
  254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];

for (let i = 0; i < 512; i++) {
  perm[i] = p[i & 255];
  permMod12[i] = perm[i] % 12;
}

// Gradient vectors for 3D
const grad3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

function simplex3D(xin: number, yin: number, zin: number): number {
  let n0: number, n1: number, n2: number, n3: number;

  // Skew the input space to determine which simplex cell we're in
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);

  const t = (i + j + k) * G3;
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  const z0 = zin - Z0;

  // Determine which simplex we're in
  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3;
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3;
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  // Hash coordinates of the four simplex corners
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  const gi0 = permMod12[ii + perm[jj + perm[kk]]];
  const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
  const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
  const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];

  // Calculate contribution from each corner
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 < 0) {
    n0 = 0.0;
  } else {
    t0 *= t0;
    n0 = t0 * t0 * dot3(grad3[gi0], x0, y0, z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 < 0) {
    n1 = 0.0;
  } else {
    t1 *= t1;
    n1 = t1 * t1 * dot3(grad3[gi1], x1, y1, z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 < 0) {
    n2 = 0.0;
  } else {
    t2 *= t2;
    n2 = t2 * t2 * dot3(grad3[gi2], x2, y2, z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 < 0) {
    n3 = 0.0;
  } else {
    t3 *= t3;
    n3 = t3 * t3 * dot3(grad3[gi3], x3, y3, z3);
  }

  // Scale result to [-1, 1]
  return 32.0 * (n0 + n1 + n2 + n3);
}
