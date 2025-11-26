# Schwarzschild Black Hole Lensing - Technical Specification

## Overview

This document specifies a real-time WebGL2 gravitational lensing simulation of a Schwarzschild (non-rotating, uncharged) black hole with an accretion disk and starfield background.

## Goals

1. **Visual Accuracy**: Reproduce the characteristic appearance of a black hole as seen in scientific visualizations (e.g., Interstellar, Event Horizon Telescope)
2. **Real-time Performance**: Maintain 60 FPS at 1440p resolution, 30+ FPS at 4K
3. **Interactive**: Allow camera orbit/zoom and parameter adjustment
4. **Educational**: Demonstrate gravitational lensing, Doppler shift, and relativistic effects

## Physics Model

### Schwarzschild Metric

The simulation uses the Schwarzschild solution to Einstein's field equations for a non-rotating black hole. In geometric units (G = c = 1):

```
ds² = -(1 - rs/r)dt² + (1 - rs/r)⁻¹dr² + r²dΩ²
```

Where `rs = 2GM/c²` is the Schwarzschild radius (event horizon).

### Light Ray Tracing

Photon trajectories are computed by integrating the null geodesic equations. For real-time performance, we use an approximate integration:

**Deflection Formula:**
```glsl
vec3 rHat = pos / r;
float vDotR = dot(rayDir, rHat);
float vPerpSq = 1.0 - vDotR * vDotR;
float accel = -1.5 * rs * vPerpSq / (r * r);
rayDir = normalize(rayDir + accel * rHat * stepSize);
```

This approximation captures:
- 1/r² radial dependence
- Stronger bending for tangential rays (v_perp² term)
- Correct weak-field limit deflection angle α ≈ 4GM/bc² = 2rs/b

### Event Horizon

Rays crossing r < rs are absorbed (render black). The photon sphere at r = 1.5rs creates the bright ring where light can orbit.

### Accretion Disk Model

**Geometry:**
- Infinitely thin disk in the y=0 plane
- Inner edge: ISCO (Innermost Stable Circular Orbit) = 3rs
- Outer edge: Configurable, default 12rs

**Kinematics:**
- Keplerian circular orbits: v = √(GM/r) = √(0.5rs/r)
- Counter-clockwise rotation when viewed from +Y

**Emission:**
- Blackbody spectrum based on temperature
- Temperature profile: T(r) = T_inner at ISCO, decreasing to T_outer at disk edge
- Default: 10,000K (inner) to 3,000K (outer)

**Relativistic Effects:**

1. **Doppler Shift:**
   ```glsl
   float vRadial = dot(diskVelocity, -rayDir);
   float doppler = sqrt((1.0 + vRadial) / (1.0 - vRadial));
   float shiftedTemp = baseTemp * doppler;
   ```

2. **Relativistic Beaming:**
   ```glsl
   float intensity = pow(doppler, 3.0);
   ```

3. **Gravitational Redshift** (optional):
   ```glsl
   float gravRedshift = sqrt(1.0 - rs / r);
   ```

### Starfield Background

- Equirectangular HDR texture (4096x2048 recommended)
- Sampled using final ray direction after gravitational deflection
- Rays escaping to r > max(100, 2*cameraDist) sample the starfield

## Rendering Architecture

### Pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    Per Frame                             │
├─────────────────────────────────────────────────────────┤
│  1. Update camera matrices                              │
│  2. LensingPass (fullscreen fragment shader)            │
│     ├── For each pixel:                                 │
│     │   ├── Reconstruct world ray from NDC              │
│     │   ├── Ray march with gravitational deflection     │
│     │   ├── Check event horizon absorption              │
│     │   ├── Check disk intersection                     │
│     │   └── Sample starfield if escaped                 │
│     └── Output: HDR color                               │
│  3. UnrealBloomPass                                     │
│     └── Threshold, blur, composite                      │
│  4. Tone mapping (ACES Filmic)                          │
│  5. Output to screen                                    │
└─────────────────────────────────────────────────────────┘
```

### Shader Uniforms

| Uniform | Type | Description |
|---------|------|-------------|
| `starfield` | sampler2D | Equirectangular HDR starfield |
| `blackbodyLUT` | sampler2D | 1D temperature-to-color lookup |
| `cameraPos` | vec3 | Camera world position |
| `inverseProjection` | mat4 | Inverse projection matrix |
| `inverseView` | mat4 | Camera world matrix |
| `rs` | float | Schwarzschild radius |
| `maxSteps` | int | Ray march iteration limit |
| `resolution` | vec2 | Viewport resolution |
| `diskInnerRadius` | float | Disk inner edge (ISCO) |
| `diskOuterRadius` | float | Disk outer edge |
| `diskTemperatureInner` | float | Temperature at inner edge |
| `diskTemperatureOuter` | float | Temperature at outer edge |

### Ray March Algorithm

```glsl
for (int i = 0; i < maxSteps; i++) {
    float r = length(rayPos);
    
    // Event horizon check
    if (r < rs) {
        absorbed = true;
        break;
    }
    
    // Escape check
    if (r > escapeRadius && movingAway) {
        color = sampleStarfield(rayDir);
        break;
    }
    
    // Gravitational deflection
    vec3 rHat = rayPos / r;
    float vPerpSq = 1.0 - dot(rayDir, rHat)²;
    float accel = -1.5 * rs * vPerpSq / (r * r);
    rayDir = normalize(rayDir + accel * rHat * stepSize);
    
    // Disk intersection (y=0 plane crossing)
    if (crossedDiskPlane && withinDiskBounds) {
        color = sampleDiskWithDoppler(hitPos);
    }
    
    // Adaptive step size
    stepSize = baseStep * clamp(r / (3 * rs), 0.15, 2.0);
    
    rayPos += rayDir * stepSize;
}
```

## Performance Specifications

### Target Frame Rates

| Resolution | Target FPS | Ray March Steps |
|------------|------------|-----------------|
| 4K (3840x2160) | 60 | 64 |
| 1440p (2560x1440) | 60 | 100 |
| 1080p (1920x1080) | 60 | 150 |

### Adaptive Scaling

Step count scales inversely with pixel count:
```typescript
const t = (pixels - 2M) / (8.3M - 2M);  // 0 at 1080p, 1 at 4K
const steps = lerp(150, 64, t);
```

### Optimization Techniques

1. **Adaptive step size**: 0.1rs near BH, up to 0.5rs far away
2. **Early termination**: Exit loop on absorption or escape
3. **No geometry**: All rendering in fragment shader
4. **Precomputed LUT**: Blackbody colors from 1D texture
5. **Fixed loop count**: Helps GPU branch prediction

## File Structure

```
/
├── index.html              # Entry HTML
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config
├── public/
│   └── textures/
│       └── starmap_2020_4k.exr  # HDR starfield
└── src/
    ├── main.ts             # App initialization, render loop
    ├── shaders/
    │   ├── lensing.vert.glsl   # Vertex shader
    │   └── lensing.frag.glsl   # Fragment shader (ray marching)
    ├── passes/
    │   └── LensingPass.ts      # Three.js ShaderPass wrapper
    └── utils/
        └── blackbodyLUT.ts     # Blackbody LUT generation
```

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| three | ^0.164.1 | 3D rendering, WebGL |
| lil-gui | ^0.19.2 | Parameter GUI |
| stats.js | ^0.17.0 | FPS counter |
| vite | ^5.2.0 | Dev server, bundler |
| typescript | ^5.2.2 | Type safety |
| vite-plugin-glsl | ^1.3.0 | GLSL imports |

## Browser Requirements

- WebGL2 support
- EXT_color_buffer_float extension (for HDR render targets)
- Minimum 4GB GPU memory recommended for 4K

## Known Limitations

1. **Non-rotating black hole**: Does not model Kerr (spinning) black holes
2. **Thin disk approximation**: No volumetric disk effects
3. **No gravitational time dilation**: Disk emission not corrected for time dilation
4. **No higher-order images**: Limited to ~3 disk crossings
5. **Approximate geodesics**: Not exact Schwarzschild integration

## Future Enhancements

- [ ] Kerr (rotating) black hole support
- [ ] Volumetric accretion disk with density falloff
- [ ] Jet emission
- [ ] Multiple photon ring rendering
- [ ] VR support
- [ ] GPU compute shader optimization

