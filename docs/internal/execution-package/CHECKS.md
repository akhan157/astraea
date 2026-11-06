# Check execution policy and portable command menu

Commands here are for future resumed engineering after its packet is dispatched.
The current package task runs only the read-only package validator/diff checks.
Never claim a historical log or a retained hash is a fresh execution.

## New-machine preflight (read only)

From a Git checkout: `git status --short`, `git log -8 --oneline`,
`git worktree list`, `git branch --show-current`; inspect current agents/runs.
Discover `rustc --version`, `cargo --version`, `node --version`, `pnpm --version`
when installed. Do not print environment/credential contents. Read package.json,
Cargo manifests/committed locks and relevant environment/AGENTS instructions.

package.json declares Node>=20 and pnpm12.14.0. Engine/Tauri lockfiles are tracked;
standalone core Cargo.lock is ignored and may be absent. There is no tracked
rust-toolchain.toml at the migration base. Old Rust stable1.99.1/caches are
historical, not installed dependencies on the new machine. Acquire/configure
ordinary required tools only within available environment/authorization; no
paid provisioning or hidden system-global changes. Respect managed proxy/CA/network
policy and use its runtime skill when applicable. Offline-cache absence is an
honest setup blocker; do not repeatedly run known impossible commands.

## Rust native work

Use a lane-specific `CARGO_TARGET_DIR` when parallel work could contend; never
repurpose HOME or another global system variable. Limit jobs to allocated resources.
Repository-root command templates once dependencies/tools exist:

```sh
CARGO_BUILD_JOBS=1 cargo test --offline --manifest-path crates/astraea-core/Cargo.toml
CARGO_BUILD_JOBS=1 cargo test --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --all-targets
```

Run meaningful new filters first, then affected integrated suites. On a fresh
core standalone checkout, `--locked` can fail because no core lock is tracked;
normal offline cached resolution was used historically. Do not change manifests/
engine locks just to hide that setup distinction. If offline dependencies are
absent, record setup and use the authorized package/network route if available.

New native examples do not exist until their packet implements them. Record actual
`cargo build/run --example NAME -- FIXTURE` commands afterward; do not copy invented
names as if they were implemented. Existing safe synthetic example/checker pairs:

- `sb1_diagnostic` + `tests/fixtures/sb1-diagnostic-request.json` +
  `scripts/diagnostics/check-sb1-diagnostic.py`.
- `environment_diagnostic` + `tests/fixtures/environment-synthetic-request.json`.
- `supplied_aero_diagnostic` + its synthetic request and the environment/table checker.
- `friction_diagnostic` + `tests/fixtures/friction-synthetic-request.json` +
  `scripts/diagnostics/check-local-friction-boundary.py`.
- `legacy_flight_snapshot` accepts a full engine request; use only an explicitly
  identified longstanding synthetic fixture for before/after preservation.

Paths for examples/fixtures above are under crates/astraea-engine except scripts.
Do not repeat all examples/N1/legacy snapshots merely to prove a session resumed.
They are available when changed behavior makes that verification relevant.

## Frontend and production-WASM work

pnpm `test`/`build` run build:engine first, which compiles and replaces generated
`src/engine/astraea_engine.wasm`. This is intentional only when verifying/offering
a changed actual engine; it is not a harmless documentation test command.
The build script uses Cargo's actual target directory and should not be replaced
with a guessed cached artifact. Keep TLS/proxy trust and declared dependencies.

For focused TS behavior with installed dependencies and an appropriately identified
engine artifact, direct commands avoid the old machine's pnpm verification hang:

```sh
node node_modules/vitest/vitest.mjs run PATH_TO_CHANGED_TEST --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```

PATH_TO_CHANGED_TEST is a dispatch-time existing test, not a literal runnable path.
For example, new migration work touches existing application/runInputs/runCases/
caseResolver/dragCalibration and formats/projectJson/projectStorage tests. Use
existing paths from the actual checkout and add meaningful changed-behavior cases.

For an intentionally rebuilt artifact/site, use declared build:engine/build then
actual browser suite (`node scripts/browser-smoke.mjs`) with an installed browser
and explicit capability inventory. Record source/tool/config/site/WASM identities
and actual invoked buffer. Vite-only build with old WASM is not proof of new Rust
behavior. WebKit/Linux is not native Safari/macOS; browser mocks are not native IPC.

Asset binding rule (RMP07-C08): every browser/runtime receipt records the SHA-256
(and byte count) of the dist WASM it served and of the bytes the app actually
fetched, and the engine identity the app recorded on results. Evidence observed
against one WASM hash is never cited for a different hash; when the asset
changes, earlier receipts stay historical and new behavior needs a new receipt.

## Data-access boundary: exclude scoring from routine checks

Do not run `validate:round2`, `validate:mini-dx3`, `benchmark:flight`, empirical
benchmark/scoring scripts, broad dataset readers or telemetry-generation scripts
as a default continuation/package check. Some cases are already examined development,
others may expose protected outputs; command names do not establish permission.
A packet must identify exact synthetic/authorized development inputs and preserve
freeze/exposure rules before any such command. RMP14 real scoring needs separate
authorized outcome release. No blind "run everything" shell command is prescribed.
The package validator never opens datasets outside this package.

## Required test/evidence layers

| Changed area | Required independent question / failure path |
| --- | --- |
| Candidate provider |One physical evaluator; signed/ref/datums/pure couples; undefined quantities; no missing-data fill; all speculative stages support-check; partial result truth |
| Driver/events/horizon |Legacy preservation; stage/root/rejected-trial/abnormal-contact errors; flags/time consistency; exact off-grid final state; no post-stop planned evaluation |
| Axial/environment |Local Re dependency; total-force no double count; source/power/profile boundary; no silent atmosphere/floor/fallback; caches keyed by actual dependencies |
| Identity/migration |Old/no-provider legacy, cache/fit staleness, actual invoked bytes; save/reopen/undo/async/two-tab and failed-import preservation |
| Statistical/data |Input/measurement/discrepancy/numerical separation; no leakage; dependent vehicles; width+coverage; all failures/exclusions/custody chronology |
| Desktop |Guarded exact target; default/release fixture absence; verified bytes versus transport; actual apply/old-exit/new-version/newPID and interruption limits |

An author test, coordinator integration check, independent scientific review and
measurement-based qualification answer different questions. Test counts are recorded,
not optimized as an accuracy score. No universal floating-point/physical tolerance is
invented; justify analytic numerical tolerance and derive decision budgets before scoring.

## Check records and completion

For every acceptance ID save command/mechanism, source/input/runtime hash, observed
result, expected rule, pass/fail/blocked reason, log/artifact location and availability.
If not applicable, document why the claim/scope does not require it and obtain review.
Do not mark unknown as pass or all gates complete from one software suite.
Format/build/lint tooling is used when available; old rustfmt absence is historical,
not permission to claim it passed. No new setup/broad regression is needed for
this documentation-only package; structural validation is sufficient here.
