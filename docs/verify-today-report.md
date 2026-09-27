# Independent verification report — shipped work, 2026-09-26 (astraea)

Lane: independent verification, READ-ONLY on source (no edits, no commits, no pushes).
Commits verified on main: 6495378 (docs reconciliation), 928f706 (versioned project
envelope wired into Header/App import-export), 58ee09e (.rse export trigger),
b0510d6 (wind-profile CSV import into Trajectory), 50c4546 (chunked Monte Carlo host
with progress/cancel + native run_ensemble_chunk), ab2eb0c (durable revisioned save/open slot).

Job: falsify, not agree. Adversarial edges (a)–(f) probed. Findings ranked by severity
with file:line evidence. Exact commands and results recorded. Unverifiable claims listed.

## Verdict

No correctness failure found. Five overstated/under-pinned claims, all low severity (F1–F5).
All six commit claims hold in the main path; the gaps are a motor-switch filename window
(F1), a failed-attempt record on cancel (F2), host-scale numeric equality argued from
shared code path rather than executed (F3), no bare-vehicle drop UI test (F4), and stale
doc anchors/counts (F5).

## Exact commands run and results

- `pnpm test` → 817 passed / 1 failed (818 total, 64 files: 63 pass, 1 fail).
  Sole failure: `scripts/emit-benchmark-metadata.test.cjs > dynamic inventory: source AND
  executed include the adaptive and descent suites` — 5 s vitest timeout, not an assertion failure.
- `pnpm vitest run scripts/emit-benchmark-metadata.test.cjs` (isolated rerun) → 48/48 pass.
  Flaky/slow, not broken.
- `pnpm vitest run src/sim/monteCarlo.test.ts src/sim/windProfile.test.ts
  src/formats/projectJson.test.ts src/formats/projectStorage.test.ts
  src/formats/exportPreview.test.ts src/components/InteropExportPanel.test.tsx`
  → 94/94 pass.
- `cargo test --manifest-path src-tauri/Cargo.toml`
  (plain shell; no vcvars needed — test build linked fine) → 9/9 pass, including
  `commands::ensemble_chunk_tests::chunked_ranges_reproduce_the_whole_ensemble_landings` and
  `commands::ensemble_chunk_tests::chunk_command_refuses_the_order_dependent_legacy_version`.
- `node scripts/e2e-depth/validate-evidence.cjs`
  → `OK: 9 dumps validated, 10 behavioral markers asserted.`
- Transient probe `src/zz-verify-today.test.ts` (created, run, deleted; worktree otherwise
  untouched except cargo-regenerated `src-tauri/gen/schemas/*.json` build output) → 4/5 pass.
  The chunk-equality case timed out (see F3). Whole-ensemble means computed before timeout:
  n=1: (477.771, 7.726); n=7: (482.547, 41.476); n=53: (478.152, 57.376);
  n=120: (477.261, 56.468). Chunked-side equality at host scale not executed.

Docs-count check: `docs/project-status.md:11` claims "818/818 frontend tests across 64 files,
72/72 Rust core tests, 9/9 Tauri shell tests". Observed: 817/818 in one shot (flaky timeout
above, green on rerun), 9/9 Tauri shell confirmed, file count 64 confirmed. The 72/72
core-crate figure was not re-run here (only the `src-tauri` manifest was).

## Findings (severity-ranked, with file:line evidence)

### F1 — Low: `.rse` confirm can export the wrong motor under the preview's filename

`openPreview` stores only `{ kind, preview }` (src/components/InteropExportPanel.tsx:127-129);
`handleConfirm` re-reads the live `activeMotor` but reuses `staged.preview.filename`
(src/components/InteropExportPanel.tsx:157-159). Switching motors between preview-open and
confirm downloads the new motor under the old `${motor.id}.rse` name.

Non-switch path verified: preview gate and writer share `validateMotorSpec` on the same
object (src/formats/exportPreview.ts:203-208, src/formats/engParser.ts:254-255); invalid
record gives `canExport:false` + `refused[0]` (src/formats/exportPreview.test.ts:176-181)
and the panel blocks with "resolve the refusals" (src/components/InteropExportPanel.tsx:144-147)
while the writer throws (src/formats/engParser.test.ts:297-308). So edge (e) holds except
for the motor-switch window.

### F2 — Low: cancel "records no result" is overstated — it records a failed attempt

The host discards the partial cloud and nulls the result (src/components/TrajectoryStudio.tsx:374-385,
395-396), and the cancel test pins `seen==[0]`, `/cancelled after 50 of 100 runs/`, no
`succeeded` text, progress cleared (src/components/TrajectoryStudio.test.tsx:485-518).
But the catch path still calls `recordAttempt({ ...recordBase, lifecycle: 'failed' })`
(src/components/TrajectoryStudio.tsx:398) with `valid:true, freshness:'current'` in the base
(src/components/TrajectoryStudio.tsx:353-362). No stale success and no stale result card —
but a failed-run record exists, contrary to the code comment's "records no result".
Also minor: the "stopping after the current chunk…" suffix reads a ref
(src/components/TrajectoryStudio.tsx:812) that mutates without re-render, so it only appears
when the next chunk resolution re-renders.

### F3 — Low/medium: "bit-identical under any partition" numerically pinned only at small N

Equivalence mechanism is sound on both sides: TS `per-run-v2` whole-run delegates to one chunk
(src/sim/monteCarlo.ts:361-363), per-run stream `mulberry32(subSeedOf(seed,i))`
(src/sim/monteCarlo.ts:454-455), order-normalized merge (src/sim/monteCarlo.ts:470-483);
Rust identical shape (crates/astraea-core/src/monte_carlo.rs:393-395, 459-461, 479-492).
Tests pin N=9 partitions including ragged `[[0,4],[4,9]]` (src/sim/monteCarlo.test.ts:298-312)
and Rust n=6 `[(0,4),(4,6)]` (src-tauri/src/commands.rs chunk test). The UI host emits the
50-boundary tail (`[100,120]` for n=120) but the test asserts only the ranges, not numeric
equality (src/components/TrajectoryStudio.test.tsx:460-482). A direct n∈{1,7,53,120} equality
probe computed the whole-ensemble means above but the 6-DOF cost blew the 5 s test timeout
before the chunked side finished — equality at host scale is argued from the shared
`run_chunk` path, not executed. nRuns=1 specifically: valid single-sample path with
zero-spread stats (src/sim/monteCarlo.ts:222-231; Rust `run_chunk` accepts `0..1`), no crash
path found.

### F4 — Low: legacy bare-vehicle drop on App is engine-tested, not UI-tested

Drop path uses the envelope reader with fail-closed disclosure (src/App.tsx:56-76); engine pins
bare→v1 migration, certified binding, unresolvable-id-no-fabrication, unknown-version and
malformed refusal (src/formats/projectJson.test.ts:100-167). App tests pin only
versioned-envelope load and unknown-version rejection (src/App.test.tsx:93-113) — no
bare-vehicle drop case. Behavior on a legacy file with a custom-motor `assignedMotorId`:
reference preserved, no record/binding created (src/formats/projectJson.ts:220-232), so the
bound motor dangles with no drop-time warning (Header's own comment admits the equivalent
store path leaves it "visible as unresolvable").

### F5 — Doc nits

`docs/project-status.md:3` anchors "main at `6105f0e`" while HEAD is `ab2eb0c`;
`docs/project-status.md:11` "818/818" reads as a standing total but a full run here yields
817/818 with the flaky benchmark timeout. No code impact.

## Edge probes (a)–(f), condensed

- (a) Non-multiple-of-50 / nRuns=1: code-equivalent on both stacks; numerically executed only
  at N≤9 / n=6 in-repo; large-N execution timed out (evidence above). No divergence found.
- (b) Cancel between chunks: no stale result (`setMcResult(null)`, progress cleared in
  `finally`), no success record; one `failed`-lifecycle record is written (F2).
- (c) Wind CSV: every rejection throws before `setWindRows` (`parseWindProfileCsv` builds a
  local array, `toManualWindTable` throws on dup altitude; UI mutates only on success —
  src/components/TrajectoryStudio.tsx:167-187); unit tests cover bad header, dup role, bad
  numbers, wrong count, negative speed, non-SI units, dup altitude, empty
  (src/sim/windProfile.test.ts:64-113); UI pins one rejection path + table survival
  (src/components/TrajectoryStudio.test.tsx:219-232). Table-untouched holds on all paths
  by construction.
- (d) Durable save: `save` re-reads backend first, `StaleRevisionError` on mismatch,
  `InvalidProjectError` on corrupt bytes before any write (src/formats/projectJson.ts:369-384);
  corrupt-bytes-preserved and stale-refused pinned at engine and Header level
  (src/formats/projectStorage.test.ts:79-99, src/components/Header.test.tsx:86-113). Holds.
- (e) `.rse`: filename `${motor.id}.rse` pinned (src/formats/exportPreview.test.ts:147-152);
  writer round-trips every certified + a derived motor (src/formats/engParser.test.ts:265-296);
  refusal gate matches writer (F1 exception only).
- (f) Envelope on App drop: holds per engine + App versioned-path tests; bare-vehicle drop
  itself has no UI test (F4).

## Claims NOT verified

- `cargo test` for the core crate behind the "72/72 Rust core" claim (only `src-tauri`
  manifest run: 9/9); `pnpm build`; `cargo check`.
- Real Tauri-window IPC for `run_ensemble_chunk` (this env is browser/jsdom-only; bridge fails
  closed without Tauri by design).
- Large-N chunked==whole numeric equality by execution (probe timed out on 6-DOF cost).
- Cancel racing a real in-flight native chunk (jsdom mock only).
- Fresh packaged-app desktop journeys, flight-data residuals, installer/release checks
  (status doc itself flags these as open).
