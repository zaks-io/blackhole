# Contributing

Thanks for your interest. This is a small project maintained by one person, so
the process is deliberately light.

## Before you start

Open an issue first for anything beyond a small fix. That includes new
physics, new visual layers, new camera presets, or changes to the render
pipeline. It avoids duplicated effort and lets us agree on the approach before
you invest time in it.

Bug reports are welcome without discussion. Include your browser, GPU if you
know it, and what you saw versus what you expected. A screenshot or short
recording helps a lot for rendering issues.

## Development setup

The project uses [Bun](https://bun.sh) as the package manager, script runner,
and test runner.

```bash
bun install
bun dev
```

The dev server runs at `http://localhost:3000`. The `/dev` route exposes a
lil-gui panel with every simulation parameter and an FPS counter, which is the
fastest way to iterate on rendering changes.

[gitleaks](https://github.com/gitleaks/gitleaks) is optional but recommended.
The pre-commit hook runs it when installed to keep secrets out of the history.

## Checks

Every pull request runs the same gate as CI. Run it locally before pushing:

```bash
bun format:check
bun lint
bun typecheck
bun test
bun run build
```

`bun format` and `bun lint:fix` apply fixes. The pre-commit hook formats and
lints staged files automatically.

## Code conventions

- Simulation parameters live in `lib/config.ts`. Do not scatter magic numbers
  through shaders or controllers.
- Lensing shader uniforms are updated through `LensingPass.updateParams()`,
  never by reaching into its `uniforms` directly from React components.
- Comments explain why, not what. If a workaround needs a paragraph to justify
  it, fix the underlying problem instead.
- Keep files focused. One component per file, and prefer splitting a controller
  over letting it grow past a few hundred lines.
- Anything that tracks the camera every frame should write to the DOM directly
  rather than through React state. See `TargetIndicator.tsx` for the pattern.

## Physics changes

The real-time shader is an approximation of Schwarzschild null geodesics. Tests
in `tests/` compare it against the high-accuracy RK4 reference in
`lib/physics/schwarzschild.ts`. If you change the deflection model, step
scheduling, or impact-parameter handling, update or extend those tests so the
approximation stays validated. Cite the paper or textbook you are working from
in the pull request.

## Pull requests

- Keep each pull request to one change.
- Write the description for someone who has not read the diff. Say what
  changed and why, and include before and after screenshots for anything
  visual.
- Rendering changes should note the frame rate impact at 1080p on whatever
  hardware you tested.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE) that covers the project.
