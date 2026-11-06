# Contributing to Astraea

Thanks for helping. Astraea is an engineering tool, so correctness and honesty
about what the models can and cannot do come before features.

## Getting set up

```sh
git clone https://github.com/akhan157/astraea.git
cd astraea
rustup target add wasm32-unknown-unknown   # the engine is built as WebAssembly
pnpm install --frozen-lockfile
pnpm dev                                    # landing page at :5173, app at :5173/app/
```

Use Node.js 24 (the CI version), the pnpm version in `package.json`, and stable
Rust. For the desktop shell, install the
[Tauri prerequisites for your OS](https://v2.tauri.app/start/prerequisites/).
The repository is currently private; cloning requires access.

## Before you open a pull request

```sh
pnpm exec tsc --noEmit
pnpm test                                    # builds the engine, runs Vitest
cargo test --manifest-path crates/astraea-core/Cargo.toml
cargo test --manifest-path crates/astraea-engine/Cargo.toml --locked
pnpm exec playwright install chromium        # once; --with-deps on Linux if needed
pnpm build && pnpm test:browser              # built app and real WASM flight
```

CI also exercises Firefox and WebKit and checks the locked desktop build.
Run checks sequentially on memory-constrained machines; cap Rust builds with
`CARGO_BUILD_JOBS=2` and Vitest with `pnpm test --maxWorkers=2`.
macOS smoke and release packaging are manual/tag-only workflows, not PR checks.
The standalone core library has no committed lockfile; the engine and desktop
commands use their committed lockfiles.

For opt-in development-flight diagnostics, build the production WASM and keep
raw inputs outside git. Source URLs, required relative paths and SHA-256s are in
the [case declarations](src/validation/development/benchmark.ts) and
[additional airframes](src/validation/development/dofproCases.ts).

```sh
pnpm build:engine
pnpm benchmark:flight -- --data-root /path/to/flight-data --case cosmic-cargo-2986
```

Omit `--case` to run all four development cases. Top Shot and Adventurer also
require their declared ORK and motor files. Missing or changed sources fail
explicitly. Reports default to `<data-root>/benchmark-reports/`; these conditional
reconstructions are development diagnostics, not independent validation.

## Ground rules

- **One engine.** The Rust engine (`crates/astraea-core`, served by
  `crates/astraea-engine` as WebAssembly) is the only runtime compute path, on
  the website and the desktop alike. The TypeScript engines under `src/` are
  test oracles; do not route the app through them.
- **Physics changes need evidence.** A change that moves any prediction (drag,
  stability, flight, dispersion) needs a cited method or a comparison against
  independent data, and must say how existing results move. Update the parity
  fixtures deliberately, never to make a failing test pass.
- **Fail closed.** Missing or invalid inputs produce a clear error or an
  "unknown" result, never a silent default or a fabricated number.
- **Claims match evidence.** Do not describe a result as validated or certified
  unless the evidence in `docs/` supports it.
- Keep pull requests focused and explain the why in the description.
- Preserve blind validation: freeze the protocol and predictions before
  inspecting holdout outcomes; do not tune the model to make a holdout pass.

## Reporting bugs

Use the bug or simulation-comparison issue form. Include reproducible steps,
version/commit, OS and browser where relevant. Only attach a project or log you
intend to share: projects and flight bundles can include launch coordinates.
For security problems, follow [SECURITY.md](SECURITY.md) instead.

By contributing you agree that your contributions are licensed under the
[Apache-2.0 license](LICENSE).
