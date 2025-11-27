# Schwarzschild Black Hole Lensing Simulation

A real-time gravitational lensing simulation of a Schwarzschild (non-rotating) black hole with an accretion disk, built with Three.js and WebGL2.

![Black Hole Simulation](https://github.com/user-attachments/assets/placeholder.png)

## Features

- **Accurate Gravitational Lensing**: Ray-traced light bending using the Schwarzschild metric geodesic equations
- **Einstein Ring / Photon Ring**: Visible light bending around the event horizon shadow
- **Accretion Disk**: Analytical disk with temperature gradient and relativistic effects
- **Doppler Shift**: Color shift based on disk rotation velocity relative to observer
- **Relativistic Beaming**: Intensity variation due to relativistic motion
- **HDR Starfield**: 4K equirectangular star map background with proper lensing
- **Real-time Performance**: 60+ FPS at 1440p with adaptive ray march step scaling
- **Interactive Controls**: Orbit camera with zoom, plus GUI for simulation parameters

## Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun build
```

Open `http://localhost:3001` in your browser.

## Controls

- **Left Mouse Drag**: Orbit camera around black hole
- **Scroll Wheel**: Zoom in/out
- **Right Mouse Drag**: Pan camera

### GUI Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| Schwarzschild Radius | Size of the event horizon | 1.0 |
| Auto Ray Steps | Automatically scale steps based on resolution | On |
| Ray March Steps | Number of integration steps per ray | 64-150 |
| Inner Radius | Accretion disk inner edge (ISCO) | 3.0 rs |
| Outer Radius | Accretion disk outer edge | 12.0 rs |
| Inner Temp | Temperature at disk inner edge | 10,000 K |
| Outer Temp | Temperature at disk outer edge | 3,000 K |
| Bloom Threshold | HDR bloom cutoff | 0.3 |
| Bloom Strength | Bloom intensity | 1.2 |
| Bloom Radius | Bloom spread | 0.5 |

## Physics

### Gravitational Lensing

Light rays are traced using the Schwarzschild geodesic equation. The deflection acceleration is:

```
a = -1.5 * rs * v_perp² / r²
```

Where:
- `rs` is the Schwarzschild radius (event horizon)
- `v_perp` is the velocity component perpendicular to the radial direction
- `r` is the distance from the black hole center

This creates the characteristic bending where light passing close to the black hole is deflected more strongly, producing the Einstein ring effect.

### Accretion Disk

The disk is modeled analytically with:
- **Inner edge** at the Innermost Stable Circular Orbit (ISCO = 3rs)
- **Keplerian rotation**: v = √(GM/r)
- **Temperature gradient**: Hotter near the center, cooler at edges
- **Blackbody radiation**: Color based on temperature using a precomputed LUT
- **Doppler shift**: Frequency/color shift based on disk velocity relative to observer
- **Relativistic beaming**: Intensity ∝ (Doppler factor)³

### Event Horizon

Rays that cross inside the Schwarzschild radius (r < rs) are absorbed and render as pure black, creating the characteristic "shadow" of the black hole.

## Technical Details

### Architecture

```
src/
├── main.ts              # Application entry, scene setup, animation loop
├── shaders/
│   ├── lensing.vert.glsl   # Fullscreen quad vertex shader
│   └── lensing.frag.glsl   # Ray marching + lensing fragment shader
├── passes/
│   └── LensingPass.ts      # Custom Three.js post-processing pass
└── utils/
    └── blackbodyLUT.ts     # Blackbody color lookup table generation
```

### Rendering Pipeline

1. **LensingPass**: Fullscreen shader that traces rays from camera through each pixel
2. **UnrealBloomPass**: HDR bloom for the bright accretion disk glow

### Performance Optimization

- **Adaptive step count**: Fewer steps at higher resolutions (4K: 64 steps, 1080p: 150 steps)
- **Adaptive step size**: Smaller steps near the black hole for accuracy, larger steps far away
- **Early ray termination**: Rays exit loop when absorbed or escaped
- **No geometry rendering**: Everything computed analytically in the fragment shader

### Dependencies

- [Three.js](https://threejs.org/) - 3D rendering
- [lil-gui](https://lil-gui.georgealways.com/) - Parameter controls
- [stats.js](https://github.com/mrdoob/stats.js/) - FPS monitoring
- [Vite](https://vitejs.dev/) - Build tool

## Starfield Asset

The simulation uses `starmap_2020_4k.exr`, a 4K HDR equirectangular star map from [NASA's Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/). Place this file in `/public/textures/`.

## Browser Support

Requires WebGL2 support:
- Chrome 56+
- Firefox 51+
- Safari 15+
- Edge 79+

## License

MIT

## References

- [Interstellar Black Hole](https://iopscience.iop.org/article/10.1088/0264-9381/32/6/065001) - Oliver James et al.
- [Gravitational Lensing by Spinning Black Holes](https://arxiv.org/abs/1502.03808)
- [Black Hole Visualization](https://rantonels.github.io/starless/) - rantonels/starless

