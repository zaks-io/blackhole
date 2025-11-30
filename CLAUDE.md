# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # Start Next.js dev server (port 3000 by default)
bun build        # Production build
bun start        # Start production server
bun lint         # Run ESLint
bun lint:fix     # Run ESLint with auto-fix
bun format       # Format all files with Prettier
bun format:check # Check formatting without changes
bun typecheck    # Run TypeScript type checking
```

## Code Quality

- **ESLint** - Configured via `eslint.config.mjs` with Next.js, TypeScript, and Prettier rules
- **Prettier** - Code formatting configured in `.prettierrc`
- **Husky** - Git hooks in `.husky/` directory
- **lint-staged** - Runs ESLint + Prettier on staged files before commit
- **CI** - GitHub Actions workflow in `.github/workflows/ci.yml` runs format:check, lint, typecheck, and build on PRs

## Architecture

This is a Next.js 16 app with a real-time WebGL2 gravitational lensing simulation of a Schwarzschild black hole.

### Directory Structure

- `app/` - Next.js app router pages
  - `page.tsx` - Landing page
  - `simulation/page.tsx` - Main simulation (production view)
  - `dev/page.tsx` - Development view with lil-gui controls and FPS stats
- `components/` - React components
  - `BlackHoleSimulation.tsx` - Core Three.js simulation component
  - `SimulationWithControls.tsx` - Simulation with camera preset bar
  - `CameraPresetBar.tsx` - UI for camera presets
- `lib/` - Shared libraries
  - `config.ts` - Centralized configuration (physics, rendering, disk, MHD effects)
  - `passes/LensingPass.ts` - Custom Three.js post-processing pass for ray marching
  - `camera/CameraController.ts` - GSAP-powered camera animation system
  - `utils/blackbodyLUT.ts` - Blackbody color lookup table generation
  - `particles/` - Particle system for disk effects
- `src/shaders/` - GLSL shader files (imported via raw-loader)

### Rendering Pipeline

1. **LensingPass** - Fullscreen fragment shader that ray-marches through curved spacetime
2. **FXAA Pass** - Anti-aliasing (optional)
3. **UnrealBloomPass** - HDR bloom for accretion disk glow

### Key Patterns

- All simulation parameters are centralized in `lib/config.ts` with helper functions (`buildLensingParams`, `buildParticleParams`) to create flat param objects
- Three.js components use dynamic imports with `ssr: false` to avoid server-side rendering issues
- GLSL shaders are imported as strings via raw-loader configured in `next.config.ts`
- Camera uses GSAP for smooth cinematic movements with orbit mode and presets

### Physics Model

The simulation uses Schwarzschild geodesic equations for light bending:

- Deflection: `a = -1.5 * rs * v_perp² / r²`
- Event horizon at r < rs renders black
- Photon sphere at r = 1.5rs creates bright ring
- Accretion disk with Keplerian rotation, Doppler shift, and relativistic beaming

### Starfield Asset

Requires `public/textures/starmap_2020_4k.exr` - a 4K HDR equirectangular star map. Falls back to procedurally generated stars if missing.
