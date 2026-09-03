# AGENTS.md

Guidance for coding agents working in this repository. This is the single source
of truth; `CLAUDE.md` and `.cursor/rules` point here.

Prefer reading the code over trusting any description of it. This file covers
the things the code does not say out loud: conventions, invariants, and the
reasons behind choices that look arbitrary.

## Commands

```bash
bun dev          # Next.js dev server (port 3000)
bun run build    # Production build (`bun build` invokes Bun's own bundler instead)
bun start        # Serve the production build
bun lint         # ESLint
bun lint:fix     # ESLint with auto-fix
bun format       # Prettier write
bun format:check # Prettier check
bun typecheck    # tsc --noEmit
bun test         # Bun test runner
```

CI (`.github/workflows/ci.yml`) runs a gitleaks secret scan plus format:check,
lint, typecheck, test, and build. Husky and lint-staged run ESLint and Prettier
on staged files. Never bypass either.

## What this is

A real-time WebGL2 gravitational lensing renderer built on Next.js and Three.js.
Everything visible is produced by a single fullscreen fragment shader that ray
marches through curved spacetime. There is no scene geometry.

The default subject is a Schwarzschild (non-rotating, uncharged) black hole.
Wormhole and binary modes are alternate spacetimes selected by config, not
separate applications.

## Where things live

Directory-level only, because individual files move.

| Path              | Contents                                                                   |
| ----------------- | -------------------------------------------------------------------------- |
| `app/`            | Next.js App Router routes                                                  |
| `components/`     | React components, one per file                                             |
| `lib/config.ts`   | Every tunable simulation parameter, and the `build*Params` helpers         |
| `lib/shaders/`    | GLSL entry points and `chunks/` included via Three's shader chunk registry |
| `lib/passes/`     | `LensingPass`, the Three.js post-processing pass that owns the shader      |
| `lib/simulation/` | Renderer, camera, animation loop, post-processing composition, starfield   |
| `lib/physics/`    | CPU reference implementations used to validate the shader                  |
| `lib/camera/`     | Orbit and fly camera controllers, GSAP-driven                              |
| `lib/presets/`    | Camera presets, camera sequences, starfield backgrounds                    |
| `lib/render/`     | Offline frame export for video                                             |
| `lib/gui/`        | lil-gui dev controls, one module per folder                                |
| `lib/audio/`      | Web Audio layers for binary mode                                           |
| `lib/utils/`      | Blackbody LUT, noise LUT, blur, Halton sequence                            |
| `tests/`          | Bun tests, mostly physics assertions                                       |
| `bench/`          | Standalone performance harness                                             |

Routes: `/` landing, `/app` main simulation, `/dev` simulation plus lil-gui and
FPS stats, `/render` offline export, and `/[view]` for direct camera-preset URLs
such as `/photon-sphere`. Valid slugs come from `VIEW_SLUGS` in `lib/presets/`;
anything else is a 404.

## Conventions

**Parameters live in `lib/config.ts`.** A new tunable is added to `CONFIG`,
threaded through the relevant `build*Params` helper, and consumed as a shader
uniform. Do not default a value at the read site. If data is missing, throw.

**Shaders are strings.** `.glsl` files are imported via raw-loader, configured
for both Turbopack and webpack in `next.config.ts`. Fragments in
`lib/shaders/chunks/` are registered as Three.js shader chunks and `#include`d
by the entry point; adding a chunk means registering it.

**Uniform names are a contract** between the GLSL and the `uniforms` object in
`LensingPass`. There is no compiler check across that boundary. A rename in one
place and not the other fails silently at runtime, usually as a black screen.

**Three.js components load client-side only,** via dynamic import with
`ssr: false`. Anything touching WebGL, `window`, or `document` must not run
during SSR.

**GPU resources are owned by whoever creates them.** Geometries, materials,
textures, and render targets get disposed on unmount. Listeners and
`requestAnimationFrame` loops get torn down.

**Fail fast and loud.** No silent fallbacks, no empty catch blocks. A plausible
wrong value in a physics renderer looks like a real result, which is worse than
a crash.

**No emojis in UI.** No internal ids, slugs, or plumbing vocabulary in
user-facing copy.

## Physics invariants

Hold these constant unless you are deliberately changing the model, and update
`tests/` when you do.

- Geometric units, `rs = 1.0` by default. `rs` is the Schwarzschild radius.
- Event horizon at `r = rs`; rays that cross it are absorbed and render black.
- Photon sphere at `r = 1.5 rs`. ISCO, the accretion disk inner edge, at `3 rs`.
- Shader deflection: `a = -1.5 * rs * v_perp² / r²`, integrated along the march.
- Finite-camera impact parameters include the Schwarzschild lapse correction.
- Disk kinematics are Keplerian, with Doppler shift and relativistic beaming.
- Photon rings are physical, produced by traced disk-plane crossings. The
  synthetic photon-ring remap and glow are cinematic controls, default off.

`lib/physics/` holds high-accuracy CPU implementations, including an RK4 null
geodesic tracer. Tests assert the real-time approximation against them, which is
the mechanism that catches shader regressions. A change to the march that shifts
ring position or shadow diameter should show up there first.

Binary mode superposes deflection fields. It is illustrative, not an exact
binary spacetime, and the code says so where it matters.

## Performance notes

These exist for a reason; check before undoing one.

- Ray march step size is adaptive, finer near the horizon.
- Step count scales down as pixel count rises, so 4K stays interactive.
- MHD turbulence is baked once per frame into a log-polar LUT rather than
  evaluated per ray step.
- Blackbody and noise lookups come from precomputed textures.
- The composer's render targets drop depth and stencil attachments; the
  fullscreen passes never use them.

## Rendering pipeline

Composed in `lib/simulation/PostProcessingPipeline.ts`: lensing pass, then FXAA
(optional), then bloom, then EHT blur pass pairs (optional, off by default).

Output handling is display-dependent. On an HDR display the renderer uses no
tone mapping and a linear sRGB output space; otherwise ACES Filmic with an
exposure from config. HDR support is detected at runtime.

Starfields are equirectangular EXR or WebP textures in `public/textures/`,
sampled by the ray direction after deflection, with a procedural fallback if a
texture is missing. Background changes crossfade via GSAP.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
