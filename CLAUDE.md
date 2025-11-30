# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # Start Next.js dev server (port 3000)
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

This is a Next.js 16 + React 19 app with a real-time WebGL2 gravitational lensing simulation of a Schwarzschild black hole.

### App Routes

- `/` - Landing page
- `/app` - Main simulation with toggle controls and info panel
- `/dev` - Development view with lil-gui controls and FPS stats
- `/render` - Offline high-quality video frame export (admin protected)

### Key Libraries

- `lib/config.ts` - Centralized configuration (physics, rendering, disk, MHD effects) with helper functions (`buildLensingParams`, `buildParticleParams`)
- `lib/passes/LensingPass.ts` - Custom Three.js post-processing pass for ray marching
- `lib/camera/CameraController.ts` - GSAP-powered camera animation with orbit mode, presets, and sequences
- `lib/render/RenderController.ts` - Offline rendering system for video frame export
- `lib/shaders/` - GLSL vertex and fragment shaders (imported via raw-loader)
- `lib/utils/` - Blackbody LUT, noise textures, texture blur utilities

### Component Architecture

- `BlackHoleSimulation.tsx` - Core Three.js simulation, post-processing setup, dev GUI
- `AppView.tsx` - Main app wrapper with simulation, toggle controls, and info panel
- `RenderView.tsx` - Offline rendering interface with quality presets and progress tracking
- `ToggleControlBar.tsx` - UI toggles for overlays (ISCO, event horizon, Doppler, jets)
- `CameraPresetBar.tsx` - Camera preset buttons and sequence triggers
- Auth components (`Auth0ProviderWrapper`, `ProtectedRoute`, `UserMenu`) - Role-based access
- Voice components (`VoiceAgentPopup`, `VoiceLoginPrompt`, `AudioVisualizer`) - ElevenLabs integration

### Rendering Pipeline

1. **LensingPass** - Fullscreen fragment shader ray-marching through curved spacetime
2. **FXAA Pass** - Anti-aliasing (optional)
3. **UnrealBloomPass** - HDR bloom for accretion disk glow
4. **EHT Blur Passes** - Multiple blur iterations to simulate telescope diffraction (optional)

### Key Patterns

- All simulation parameters centralized in `lib/config.ts`
- Three.js components use dynamic imports with `ssr: false` to avoid SSR issues
- GLSL shaders imported as strings via raw-loader configured in `next.config.ts`
- Camera sequences defined declaratively (`CAMERA_SEQUENCES` in BlackHoleSimulation)
- Toggle state synced to shader uniforms via `updateParams()`
- Starfield backgrounds support crossfade transitions with GSAP animation

### Physics Model

The simulation uses Schwarzschild geodesic equations for light bending:

- Deflection: `a = -1.5 * rs * v_perp² / r²`
- Event horizon at r < rs renders black
- Photon sphere at r = 1.5rs creates bright ring
- Accretion disk with Keplerian rotation, Doppler shift, and relativistic beaming
- Corona and relativistic jets (configurable)
- MHD turbulence patterns with spiral arms and hotspots

### Starfield Assets

Multiple HDR/SDR backgrounds in `public/textures/` (EXR/WebP). Auto-detects HDR display support and adjusts tone mapping. Falls back to procedural starfield if textures missing.
