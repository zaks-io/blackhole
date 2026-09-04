# Shader benchmark harness

Measures real GPU frame time of `LensingPass`, including its turbulence bake,
across camera/feature scenarios and compares deterministic captures (fixed `time=10.0`).
Before timing, 40 one-pixel checks validate the compiled shader's capture/escape
classification against the analytic Schwarzschild boundary at five camera radii,
in both radial directions, with default and minimum step budgets.

## Run

```bash
bun build bench/main.ts --outdir bench/dist --loader .glsl:text --target browser
bun bench/server.mjs   # serves on http://localhost:8123, collects results
```

Open `http://localhost:8123/?label=<name>` in a real browser (needs a real GPU,
not headless swiftshader). Results land in `bench/results/<name>/`.

## Compare

```bash
bun bench/compare.mjs <baselineLabel> <candidateLabel>
```

Reports per-scenario median frame time, speedup, and pixel parity (count of
pixels with max RGB channel delta > 2, max delta, MAE).

## Scenarios

wide / closeup / edge-on / far (camera angles), allfx (jets + all overlays),
binary (binary BH mode), wormhole, ss2 (supersampleLevel 2), plus `p-*` probes that
disable individual features to isolate their cost.

Timing method: median of 40 frames x 3 reps, forced GPU sync per frame via a
1x1 readback. Captures use a deterministic LCG starfield.
