# GRMHD Baked Disk Texture - Technical Specification

Replace the procedural MHD turbulence in the accretion disk with a looped texture
sequence baked from a real 3D GRMHD simulation, run offline with AthenaK on a
Windows machine with an RTX 4090 (under WSL2), then consumed by the existing
WebGL2 lensing shader at 60fps.

This document is the contract between the two machines. The sim/bake side
(Windows) and the web integration side (this repo) can proceed independently as
long as both honor the **Asset Contract** below.

See [HANDOFF.md](HANDOFF.md) for conversation context and decision rationale.

## Why baked, and why these numbers

- Sampling a texture at 60fps is cheaper than the current 1-4 octave procedural
  noise. The constraint is VRAM and download size, never fill rate.
- A naive 4096²+ frame sequence is 4-16 GB. Two tricks make it fit:
  1. **Bake in polar (r, φ)**, which the disk shader already samples in. Polar
     concentrates resolution at the ISCO; ~1024² polar reads like 4K Cartesian.
  2. **Keplerian de-rotation + in-shader flow advection.** Store frames in a
     de-rotated frame so keyframes only carry slow turbulent evolution. The
     shader re-advects analytically and crossfades two keyframes. ~32-64
     keyframes replace hundreds of raw frames.
- 2D GRMHD is a trap: standard 2D runs are axisymmetric (r-θ, the wrong plane)
  and MRI turbulence decays in 2D (anti-dynamo theorem). We need a **3D run**
  and we keep only the **equatorial midplane slice**.
- The web sim is Schwarzschild, so the AthenaK run uses spin **a = 0**.

## Units

- AthenaK uses geometric units, G = c = M = 1. The horizon is r = 2M.
- This app uses rs = 1 ([lib/config.ts:8](../../lib/config.ts)), so **1 rs = 2M**.
  Disk: inner 3 rs = 6M (ISCO), outer 12 rs = 24M.
- Times below are in GM/c³ ("M").

## Phase 1: Simulation (Windows / 4090 / WSL2)

### Setup

- Code: AthenaK, https://github.com/IAS-Astrophysics/athenak (CMake, bundled
  Kokkos).
- Build under WSL2 Ubuntu with CUDA toolkit. Kokkos arch for the 4090 is
  `Kokkos_ARCH_ADA89`. Native Windows builds are not supported; WSL2 is the
  path. Verify current build flags against the AthenaK wiki, do not trust this
  doc over upstream.
- Problem: GRMHD Fishbone-Moncrief magnetized torus (SANE), a = 0, standard
  single-loop initial B field. AthenaK ships a GR torus problem generator and
  sample input files; start from those rather than writing one. (Exact input
  file path: verify in the repo, look under `inputs/`.)

### Grid

Spherical Kerr-Schild-type coordinates, full 2π in φ, heavy in r and φ, thin in
θ because only the midplane is consumed:

| Run          | nr × nθ × nφ    | Zones | Est. VRAM | Purpose                             |
| ------------ | --------------- | ----- | --------- | ----------------------------------- |
| Pilot        | 128 × 48 × 256  | 1.6M  | ~1-2 GB   | Validate config, measure throughput |
| Production A | 320 × 96 × 640  | 19.7M | ~10-14 GB | Safe default                        |
| Production B | 384 × 128 × 768 | 37.7M | ~18-24 GB | Only if A leaves headroom           |

- Radial domain: r ∈ [~1.9M (inside horizon), ~50M], logarithmic spacing.
- During the pilot, **measure actual VRAM** and zone-cycles/sec, then pick A or
  B. The 4090's FP64 is 1:64 but these codes are bandwidth-bound; expect
  somewhere in 10⁷-10⁸ zone-cycles/sec.

### Run plan

1. Evolve to quasi-steady turbulence: t ≈ 5,000-10,000M. Steady when the
   accretion rate through the horizon plateaus (fluctuating but not trending).
2. Record the loop window: ~1,000-1,500M more.
3. Outputs during the window:
   - **Midplane slice** of density ρ and pressure p (temperature Θ = p/ρ),
     every **2M** (500-750 slices, a few MB each). AthenaK/Athena++ outputs
     support slicing; verify the slice output syntax for AthenaK specifically.
     If slice output is unavailable, dump full snapshots less often and slice
     in post, but watch disk usage (full 3D dumps are GB each).
   - Restart files every ~500M so the run survives crashes.
4. Wall clock estimate: pilot in hours, production roughly **2-7 days**. Check
   daily via accretion rate history.

## Phase 2: Post-processing (either machine, Python)

Readers for AthenaK's binary output format live in the AthenaK repo (verify
under `vis/python`). Pipeline per output slice:

1. Extract midplane ρ and Θ = p/ρ on the (r, φ) grid.
2. Resample to the **polar texture grid** defined in the Asset Contract.
3. **De-rotate**: shift each radial ring by φ → φ + Ω_K(r) · t_dump where
   Ω_K(r) = r^(-3/2) (r in M). After this, frame-to-frame motion is slow
   turbulent residual only.
4. Normalize: R = log10(ρ) mapped linearly to [0, 1] over a fixed global range
   chosen from the whole window (e.g. clip at 0.5th/99.5th percentile);
   G = Θ likewise. Record both ranges in `meta.json`.
5. **Keyframe reduction**: keep every Nth de-rotated frame to land at 32-64
   keyframes spanning the loop window.
6. **Loop closure**: crossfade the last ~15% of keyframes with the first ~15%
   (GRMHD output is not periodic).

## Phase 3: Encoding

- Primary: **KTX2 2D texture array**, BasisU UASTC, via `toktx --uastc` (KTX
  tools) or `basisu`. Three.js `KTX2Loader` loads array textures and
  transcodes to BC/ETC per device.
- Fallback (if KTX2 array tooling fights back): raw RG8 binary, one blob,
  gzip/brotli served, uploaded as `THREE.DataArrayTexture`. Simpler, ~2-4x
  larger over the wire.
- Budget: ≤ 150 MB download, ≤ 350 MB VRAM decoded.

## Asset Contract (the interface between machines)

Deliverable: `public/textures/grmhd/` (or R2-hosted, same layout):

```
grmhd-disk.ktx2     # 2D array texture, N layers, RG channels
meta.json
```

Texture mapping:

- **u = φ / 2π**, wraps (RepeatWrapping in u).
- **v = log(r / r_in) / log(r_out / r_in)** with r_in = 3 rs, r_out = 12 rs
  (log-radial, clamp in v).
- Resolution: 2048 (u) × 1024 (v) preferred; 1024 × 512 acceptable.
- **R channel**: normalized log10 density. **G channel**: normalized Θ.
- Frames are de-rotated; each layer k has a timestamp t_k.

`meta.json`:

```json
{
  "version": 1,
  "frames": 48,
  "width": 2048,
  "height": 1024,
  "rInnerRs": 3.0,
  "rOuterRs": 12.0,
  "radialMapping": "log",
  "frameTimesM": [0.0, 31.25, "..."],
  "loopPeriodM": 1500.0,
  "derotation": "omega = pow(r_in_M, -1.5), phi_stored = phi_sim + omega * t_dump",
  "densityLogRange": [-4.0, 0.5],
  "thetaRange": [0.0, 0.35],
  "simulation": { "code": "athenak", "spin": 0.0, "grid": "320x96x640", "problem": "fm_torus_sane" }
}
```

A bake is **valid** when: the texture loads in `KTX2Loader`, layer count and
dimensions match `meta.json`, frame 0 and frame N-1 differ by less than 2%
mean absolute error in R (loop closure), and no layer has more than 0.1% of
texels at exactly 0.0 or 1.0 in R (clipping check). Write a small validation
script as part of the bake.

## Phase 4: Web integration (this repo)

Shader and pass work, doable before the real asset exists by generating a
synthetic placeholder asset matching the contract:

1. **LensingPass** ([lib/passes/LensingPass.ts](../../lib/passes/LensingPass.ts)):
   add uniforms `grmhdTex` (sampler2DArray), `grmhdEnabled`, `grmhdFrameA/B`,
   `grmhdBlend`, `grmhdTimeScale`, plus the normalization ranges from
   `meta.json`. Frame index/blend driven from `updateTime`, same pattern as the
   starfield crossfade (LensingPass.ts ~476-494).
2. **mhd.glsl** ([lib/shaders/chunks/mhd.glsl](../../lib/shaders/chunks/mhd.glsl)):
   in `getMHDCombined`, when `grmhdEnabled`, replace the synthesized
   density/temperature with: compute (u, v) from (r, φ) using contract mapping,
   re-advect u by Ω_K(r) · t, sample layers A and B, mix, denormalize. Keep the
   fine-detail procedural layer on top. `MHDResult` signature unchanged, so
   [disk.glsl](../../lib/shaders/chunks/disk.glsl) does not change.
3. **Loading**: lazy `KTX2Loader` load behind a quality toggle in
   [ToggleControlBar](../../components/ToggleControlBar.tsx) / config flag in
   [lib/config.ts](../../lib/config.ts). Procedural path stays the default and
   the fallback (asset missing, load error, transcode unsupported).
4. LOD: keep the existing LOD octave logic for the procedural detail layer;
   the texture fetch needs no LOD work (mipmapped array).

## Done

- [ ] Pilot run completes on the 4090 under WSL2; VRAM and throughput recorded;
      production grid chosen.
- [ ] Production run reaches quasi-steady state (accretion rate plateau) and a
      ≥1,000M loop window is dumped as midplane slices.
- [ ] Bake pipeline produces `grmhd-disk.ktx2` + `meta.json` passing the
      validation script (loop closure, clipping, dimensions).
- [ ] Web: toggle swaps procedural ↔ baked at runtime; baked path holds 60fps
      at 1440p on the same hardware that currently does (existing perf target
      in root [SPEC.md](../../SPEC.md)); loop shows no visible seam or pop over
      two full periods; missing asset falls back to procedural with no error
      shown to the user.
- [ ] Asset hosted (repo `public/` if small enough, else R2) and lazy-loaded
      only when toggled on.

## Risks / open questions

- AthenaK slice-output syntax and Python reader specifics: verify on the
  Windows machine against the current repo before planning storage.
- 4090 FP64 throughput could land at the slow end; if the production run
  projects > ~10 days, drop to Production A or shorten the settled window.
- De-rotation leaves residual shear near the ISCO where Ω changes fastest;
  if keyframe blending smears there, increase keyframe count near-ISCO or
  raise total keyframes before shrinking texture resolution.
- 8-bit RG may band in smooth disk regions; if visible, UASTC HDR / RG16 raw
  fallback is the escape hatch, at 2x VRAM.
