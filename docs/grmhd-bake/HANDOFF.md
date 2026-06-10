# Handoff: GRMHD disk texture bake

For the session picking this up on the Windows machine (RTX 4090). Read
[SPEC.md](SPEC.md) in this directory first; it is the full plan and the asset
contract. This file is only the context that is not in the spec.

## What this is

The accretion disk turbulence in this app is currently procedural GLSL noise
(`lib/shaders/chunks/mhd.glsl`, spiral arms + hotspots + simplex octaves). We
are replacing it with data baked from a real GRMHD simulation, run offline,
delivered as a looping compressed texture array. Real-time GRMHD was ruled out
immediately; this is a bake-once pipeline.

## Decisions already made (do not relitigate)

| Decision                           | Choice                                                                  | Why                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sim code                           | **AthenaK** (not KHARMA)                                                | Isaac was already looking at AthenaK; both are Kokkos GRMHD, either works                          |
| Machine                            | Windows 4090 under **WSL2**                                             | Kokkos has no Metal backend, the MacBook would be CPU-only and ~10x slower                         |
| Dimensionality                     | **3D run, midplane slice only**                                         | 2D axisymmetric GRMHD is the wrong plane (r-θ) and MRI turbulence dies in 2D (anti-dynamo theorem) |
| Spin                               | a = 0                                                                   | The web sim is Schwarzschild                                                                       |
| Texture                            | Polar (r, φ), RG8, de-rotated keyframes + in-shader Keplerian advection | Only way the memory math closes; see spec                                                          |
| Native 4096²/8192² frame sequences | Rejected                                                                | 4-16 GB; polar + advection at ~2048×1024 gives equivalent perceived detail                         |
| Delivery                           | KTX2 BasisU array, lazy-loaded, procedural stays as default + fallback  | Download/VRAM budget, offline users                                                                |

## State of work

- **Done**: feasibility analysis, codebase mapping, this spec. Nothing
  implemented, no code changes anywhere.
- **Next (Windows machine)**: clone AthenaK, build under WSL2 + CUDA
  (`Kokkos_ENABLE_CUDA`, `Kokkos_ARCH_ADA89`), run the pilot from SPEC Phase 1.
- **Next (this repo, can run in parallel)**: SPEC Phase 4 web integration
  against a synthetic placeholder asset that matches the contract.

## Things the fresh agent should know

- Several AthenaK specifics in the spec are flagged **verify**: exact torus
  input file path, slice-output syntax, Python reader location. They were not
  confirmed against the live repo. Check the AthenaK wiki/repo before building
  the run plan; update SPEC.md where it says verify.
- Sim outputs ρ and pressure; the shader wants density + temperature. Θ = p/ρ.
- Storage trap: full 3D dumps at the slice cadence (every 2M) would be
  terabytes. Slices at high cadence, full dumps rarely (restarts only).
- The 4090 FP64 penalty (1:64) is mostly hidden by bandwidth-bound stencils,
  but throughput is unverified. The pilot exists to measure it; do not commit
  to the big grid before that number exists.
- Integration points in this repo were already mapped: `getMHDCombined` in
  `lib/shaders/chunks/mhd.glsl` is the single seam (returns
  `MHDResult {density, temperature}`, consumed by `disk.glsl`); uniforms and
  texture wiring follow the existing starfield crossfade pattern in
  `lib/passes/LensingPass.ts`; the 3D noise LUT in `lib/utils/noiseLUT.ts` is
  the precedent for texture creation.
- Isaac's house rules apply: no prod deploys without approval, plans need a
  verifiable Done section (SPEC has one), keep it simple, don't invent
  parallel mechanisms when an existing pattern fits.

## Suggested skills for follow-up sessions

- None required for the sim phase (it lives outside this repo).
- Web integration phase in this repo: `/verify` or `/run` to confirm the
  toggle and fallback behavior in the real app, `/code-review` before PR,
  `/create-pr` to ship.
- When the bake is done on the Windows machine, `/handoff` again to bring the
  asset contract results back here.
