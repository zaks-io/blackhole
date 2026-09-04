# Physics review and validation

Reviewed September 4, 2026. Changes are local; no production deployment.

## Corrected behavior

- **Schwarzschild trajectories:** replaced normalized Euler stepping with affine
  velocity Verlet in the main and far-universe black-hole marches. The conserved
  angular momentum now agrees with the finite static camera's launch direction.
  Each advance caches its ending acceleration for the next half-kick, requiring
  one new force evaluation per step. See
  [the shared integrator](../lib/shaders/chunks/schwarzschild.glsl).
- **Shadow capture:** use the analytic radial-potential boundary to suppress sky
  through captured rays even when the main march runs out of samples. Foreground
  emission is still marched. A real GPU regression caught this at camera radius
  `20 rs` and impact parameter `0.98 bcrit` with the default 150-step budget.
- **Observed disk radiation:** include the finite observer's gravitational
  blueshift and correct the eccentric radial Doppler sign for backward tracing.
  Circular Doppler rotation keeps its existing convention. See
  [disk emission](../lib/shaders/chunks/disk.glsl).
- **Mini-disks:** keep their inner edge at each hole's `3 rs` ISCO instead of
  moving it inward to preserve apparent width. Return no disk when tidal
  truncation leaves no stable circular annulus. The outer fade now uses defined,
  ascending-edge GLSL `smoothstep` arguments.
- **Radiative transfer:** normalize binary volume source color before applying
  Beer-Lambert opacity, eliminating the second opacity multiplication. Far-side
  volume opacity now uses exponential transmission rather than a linear step
  approximation. See [the main march](../lib/shaders/chunks/raymarcher.glsl) and
  [the far-side march](../lib/shaders/chunks/wormhole.glsl).
- **Wormhole emission:** synthetic photon-ring remapping obeys the existing
  cinematic intensity gate, matching the main black-hole path.
- **Reference geometry:** the critical angular radius uses the obtuse branch
  inside the photon sphere, where the shadow covers more than half the sky.

## Numerical evidence

The CPU port of the shader march is compared against an independent fine-step
RK4 force reference in [geodesic-integrator.test.ts](../tests/geodesic-integrator.test.ts).
At launch distance 500, the near-ring ray with transverse offset `2.7 rs` had
11.876% deflection error before the change and 0.234% afterward. Across offsets
`2.7, 3, 4, 6, 10, 20 rs`, the corrected errors range from 0.029% to 0.234%.

The unmasked numerical capture boundary is within 0.073% of `3 sqrt(3) rs / 2`
for static cameras at `3, 5, 10, 20 rs`. These measure numerical integration,
independently of the shader's final analytic capture mask. Regression tolerances
are 1% for deflection and 0.5% for the capture boundary.

[The GPU checks](../bench/physics.ts) render the actual compiled fragment shader
against a white sky with disk/corona/jet emission disabled. All 40 capture/escape
checks pass: five observer radii including `1.2 rs`, inward and outward rays on
both sides of the critical impact parameter, and the default/minimum step budgets.
These tests verify capture, not every escaped ray's asymptotic direction.

The complete Bun suite passes 97 tests and 11,010 assertions. Production build,
TypeScript, formatting, and lint pass; lint retains two unrelated warnings.
The local production build renders in Chrome, including switching between the
single black hole, binary, and wormhole modes, with no browser errors or warnings.
The tracked diff passes a redacted Gitleaks scan. Dependency installation
synchronized stale root dependency constraints in `bun.lock` with `package.json`;
the resolved package entries did not change and frozen installation passes.

## GPU measurements

The old benchmark bypassed `LensingPass.render`, leaving the disk turbulence
texture unbaked. The harness now runs the real pass, including the bake, and
includes wormhole mode. Both baseline and candidate below use that corrected
harness. Baseline library sources came from this worktree's original `HEAD` in
an isolated temporary directory.

Chrome, Apple M4 Max, 1280x720; 40 timed frames per repetition, three repetitions,
GPU synchronization by pixel readback. Values are the harness's minimum of
three repetition medians, not a cross-device performance guarantee.

| Scenario                    | Baseline | Corrected, cached force |
| --------------------------- | -------: | ----------------------: |
| Wide                        |  4.90 ms |                 5.15 ms |
| Close-up                    |  8.60 ms |                 8.50 ms |
| Edge-on                     |  5.00 ms |                 4.90 ms |
| Binary                      |  5.50 ms |                 5.10 ms |
| Wormhole                    |  2.40 ms |                 2.30 ms |
| 2x2 supersampling           |  8.00 ms |                 8.40 ms |
| Sum of all eleven scenarios | 56.45 ms |                55.40 ms |

Overall cost is approximately unchanged within run-to-run variation; individual
views have both gains and regressions. The measured accuracy improvement is the
stronger result. Captures intentionally change because trajectories, frequency
shifts, opacity, and mini-disk bounds changed. Raw local measurements and images
are in `bench/results/physics-full-baseline-2/` and
`bench/results/physics-full-cached/` (ignored generated artifacts).

## Remaining physical limits

- Binary mode still superposes approximate deflection fields. After merger it
  retains two fractional horizons as the separation collapses, rather than a
  common remnant horizon. See [binary radii](../lib/shaders/chunks/binary.glsl)
  and [inspiral/ringdown state](../lib/passes/LensingPass.ts). This remains a
  visible model limitation requiring a remnant-spacetime choice.
- The temperature profile is the Newtonian zero-torque approximation, not the
  full Page-Thorne relativistic flux. Comments and README now identify it
  accurately. Eccentric flow, turbulence, jets, and binary emission remain
  illustrative rather than a GRMHD evolution.
- Wormhole mode joins an ultrastatic throat to a separate far-black-hole march;
  this is not a single exact solution of Einstein's equations. Its redshift is
  referenced to the local static frame at entry to that black-hole leg.
- Finite step budgets still limit high-order image resolution and escaped-ray
  deflection convergence. The analytic capture mask does not recover emission
  missed after the budget ends.

## Physical references

- [Belbruno and Pretorius, Schwarzschild null geodesics](https://arxiv.org/abs/1103.0585):
  conserved-angular-momentum central-force formulation.
- [Perlick and Tsupko, analytical black-hole shadows](https://arxiv.org/abs/2105.07101):
  finite static observer geometry and the critical curve.
- [Riaz et al., backward ray-traced frequency shifts](https://academic.oup.com/mnras/article/491/1/417/5610236):
  photon/emitter direction convention. The finite observer factor follows from
  the invariant frequency ratio `(k.u_observer)/(k.u_emitter)`.
- [Bowen et al., mini-disks approaching merger](https://arxiv.org/abs/1712.05451):
  tidal truncation approaching the ISCO.
- [Page and Thorne, relativistic disk flux](https://articles.adsabs.harvard.edu/pdf/1974ApJ...191..507T):
  the fuller thermal model that this renderer does not implement.
