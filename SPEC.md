# Schwarzschild Black Hole Lensing - Technical Specification

## Overview

A real-time WebGL2 gravitational lensing simulation of a Schwarzschild
(non-rotating, uncharged) black hole with an accretion disk and starfield
background, plus optional wormhole and binary black hole spacetimes.

This document specifies the physical model and the approximations it makes.
It deliberately does not mirror the code: file layout, dependency versions,
uniform names, and default values live in the repository and drift the moment
they are copied here. For architecture and conventions, see `AGENTS.md`. For
tunable parameters and their current defaults, read `lib/config.ts`.

## Goals

1. **Visual accuracy**: reproduce the appearance of a black hole as seen in
   scientific visualizations and Event Horizon Telescope imagery
2. **Real-time performance**: 60 FPS at 1440p, 30+ FPS at 4K
3. **Interactive**: camera orbit, fly, and live parameter adjustment
4. **Educational**: demonstrate lensing, Doppler shift, and relativistic beaming
5. **Verifiable**: the real-time approximation is tested against high-accuracy
   CPU reference implementations rather than judged by eye

## Physics model

### Schwarzschild metric

The simulation uses the Schwarzschild solution to Einstein's field equations for
a non-rotating black hole. In geometric units (G = c = 1):

```
ds² = -(1 - rs/r)dt² + (1 - rs/r)⁻¹dr² + r²dΩ²
```

`rs = 2GM/c²` is the Schwarzschild radius. The simulation works in units where
`rs = 1`.

### Light ray tracing

Photon trajectories follow the null geodesic equations. For real-time
performance the shader integrates an approximation rather than the exact
equations:

```
v_perp² = 1 - (v · r̂)²
a       = -1.5 * rs * v_perp² / r²
```

applied along `r̂` at each march step. This captures the 1/r² radial dependence,
stronger bending for tangential rays, and the correct weak-field deflection
`α ≈ 4GM/bc² = 2rs/b`.

Impact parameters for a camera at finite radius include the Schwarzschild lapse
correction, so the shadow subtends the correct angle at any camera distance
rather than only in the far field.

The approximation is validated against an RK4 null geodesic tracer in
`lib/physics/`. Tests assert critical impact parameter, photon sphere radius,
turning points, and shadow angular size. Any change to the marching scheme
should be checked there first.

### Event horizon and photon sphere

Rays reaching `r < rs` are absorbed and render black. The photon sphere at
`r = 1.5 rs` produces the bright ring, and the shadow diameter for a distant
observer is `3√3 rs`.

Higher-order images are physical: they come from successive traced crossings of
the disk plane, with an attenuation factor applied per crossing. An optional
synthetic photon-ring remap and glow exist as cinematic controls and default to
off.

### Accretion disk

**Geometry.** Inner edge at the ISCO, `3 rs`. Outer edge configurable. The disk
is not infinitely thin: it has a flared scale height `H = flare * r`, capped by
a half-thickness, with a Gaussian vertical falloff.

**Kinematics.** Keplerian circular orbits, `v = √(GM/r) = √(0.5 rs / r)`,
counter-clockwise viewed from +Y. Vertical shear lags the MHD pattern at the
disk surface relative to the midplane.

**Emission.** Blackbody spectrum from a temperature profile peaking at the ISCO
and falling outward, sampled from a precomputed lookup texture.

**Relativistic effects.**

- Doppler shift from the line-of-sight component of orbital velocity,
  `D = √((1 + v_r) / (1 - v_r))`
- Relativistic beaming, intensity scaling as `D³`
- Gravitational redshift at the emission radius, `√(1 - rs/r)`, combined with
  the Doppler term into a single frequency shift factor

**Additional structure.** A hot corona near the ISCO (on by default),
relativistic jets (off by default), and MHD turbulence with spiral arms and
hotspots.

### Starfield background

Equirectangular HDR or SDR texture sampled using the final ray direction after
deflection. Rays that escape past a distance threshold scaled to camera
distance sample the starfield. Falls back to a procedural starfield if no
texture is present.

### Alternate spacetimes

**Wormhole mode.** A static, spherically symmetric ultrastatic wormhole with a
configurable throat radius and neck length; zero length recovers the Ellis
metric. A Schwarzschild black hole is placed in the far universe, positioned so
the two lensing regions do not overlap at default parameters.

**Binary mode.** Two black holes with a mass ratio, a circumbinary disk with a
central cavity, accretion streams, and mini-disks. Gravitational waves use the
quadrupole approximation with Peters inspiral decay, exaggerated in propagation
speed and inspiral rate so a merger fits a demo timescale.

Binary mode superposes the two deflection fields. This is illustrative and is
not an exact binary black hole spacetime.

## Rendering architecture

Every frame renders as a single fullscreen fragment shader pass. There is no
scene geometry. Per pixel: reconstruct the world ray, march with gravitational
deflection, test for horizon absorption, accumulate disk and volumetric
contributions at plane crossings, and sample the starfield on escape.

The lensing pass feeds a post-processing chain: optional FXAA, bloom, then
optional EHT blur pass pairs that reproduce telescope diffraction at the 2017
EHT beam-to-ring ratio.

Output is display-dependent. HDR displays receive linear sRGB with no tone
mapping; everything else gets ACES Filmic at a configured exposure.

## Performance

Targets are 60 FPS at 1080p and 1440p and 30+ FPS at 4K, on a discrete GPU.

Techniques:

1. **Adaptive step size** — finer near the black hole, coarser far away, with
   extra refinement near the photon sphere where curvature is highest
2. **Automatic step count** — scales down as pixel count rises, between a
   configured floor and ceiling, so 4K stays interactive
3. **Early termination** — the march exits on absorption or escape
4. **No geometry** — everything happens in the fragment shader
5. **Precomputed lookups** — blackbody colors and noise come from textures
6. **Per-frame MHD bake** — turbulence is baked into a log-polar lookup once per
   frame rather than evaluated at every ray step
7. **Half-resolution bloom**

## Browser requirements

- WebGL2
- `EXT_color_buffer_float` for HDR render targets
- A discrete GPU is recommended for 4K

## Known limitations

1. **Non-rotating only**: no Kerr (spinning) black holes, and therefore no
   frame dragging or ergosphere
2. **Approximate geodesics**: the shader integrates an approximation, not the
   exact Schwarzschild null geodesic equations. The CPU reference in
   `lib/physics/` is the accurate one
3. **Bounded higher-order images**: disk crossings are capped, so the infinite
   sequence of photon-ring images terminates
4. **No emission-side time dilation**: gravitational redshift is applied to the
   observed color, but disk emission is not corrected for time dilation
5. **Binary is superposition**: see above
6. **Illustrative gravitational waves**: propagation speed and inspiral rate are
   exaggerated for visibility

## Future enhancements

- [ ] Kerr (rotating) black hole support
- [ ] VR support
- [ ] GPU compute shader optimization
