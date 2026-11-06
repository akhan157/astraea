# RMP15-C01 — saved display telemetry (project 1.10.0)

Base `d278d49421cdd6ecd3e390c8ce3fdd4524e4f692`; bounded author increment complete and **accepted on independent review** (5 minor findings, none blocking). Parent RMP15-C01 remains in progress.

## Delivered

- `src/formats/projectJson.ts`: MINOR schema `1.9.0` → `1.10.0`; identity-only `1.9.0` migration leaves `telemetry` absent. Older-schema telemetry injection refuses. A current flight case carrying telemetry must also carry matching archived inputs/input key and recorded engine identity; ensembles refuse it.
- `src/application/savedTelemetry.ts`: strict copy/parser for the actual `FlightRun.telemetry` point shape. Exact point and nested key sets, finite scalars, nonnegative non-decreasing time, optional stage/stageTime/motorTime fields, and a 0–5000 sample bound. Nothing is interpolated, repaired, reordered or truncated.
- `src/application/runCases.ts`: prospective source-bound runs retain an exact parser-produced copy of their bounded display samples. Missing legacy source bindings stay absent; malformed bound samples fail the save; mismatched run/archive input keys refuse.
- `src/console/stages/SavedRuns.tsx`: read-only historical altitude/time SVG plot generated only from retained samples, including sample count and historical/not-fresh disclosures. Old cases say `Historical telemetry unavailable — not retained`; empty retained series remain distinguishable from absence. No re-simulation or current-result promotion.
- Tests and a manufactured parser fixture cover malformed/nested/hostile input, cap refusal, exact source-bound retention, signed zero, byte-identical save → open → save, identity-only migration, older-schema injection, and historical/unavailable UI states. Existing old-format fixtures and the schema-version assertion were updated without weakening guards.

No engine, WASM, physics, defaults, thresholds, adapter, contract, Build/export trace, provider or import implementation changed.

## Red/green chronology and counts

Raw logs: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp15-saved-telemetry/`.

1. `red-focused.log` (exit 1): initial tests before implementation; missing parser, schema `1.9.0` versus required `1.10.0`, missing migration/injection guard. Four files failed; six tests failed/53 passed; parser and UI suites did not execute (missing module and missing WASM import respectively).
2. Sealed WASM copied and SHA-256 verified; no rebuild. A run-case fixture motor-reference error was corrected before implementation.
3. `focused-attempt-1-failed.log` (exit 1): two failed/82 passed. One JSON `-0` fixture targeted the wrong `time` field; one manufactured ensemble incorrectly retained flight-only telemetry. Fixtures corrected, assertions/guards unchanged.
4. `focused-attempt-2-failed.log` (exit 1): one failed/83 passed; the signed-zero replacement still needed telemetry-specific context. Corrected without weakening the assertion.
5. `focused.log` (exit 0): **4 files, 84 tests passed**.
6. `affected-attempt-1-failed.log` (exit 1): two failed/149 passed. Updated one schema-version assertion and removed telemetry from a genuine 1.6 fixture. `affected.log` (exit 0): **5 files, 151 tests passed**.
7. `tsc-attempt-1.log` (exit 0): `tsc --noEmit` clean. `vite-build.log` (exit 0): Vite production build passed; no engine build.
8. The initial UI red suite had been import-blocked, so an explicitly later base-UI control temporarily removed only the new SavedRuns implementation. `ui-base-control-red.log` (exit 1): the regression failed because no historical plot existed; automatic restore followed. `ui-restored-green.log` (exit 0): the same focused UI test passed. This control is not mislabeled as an earlier execution or included in the 235-test final count.

Final focused + adjacent total: **9 files, 235 tests passed**. Every failed attempt is retained.

## Evidence and limits

- Sealed source and built WASM SHA-256: `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b` (`wasm-sha256.txt`).
- Tests use manufactured/stubbed run data; no real-WASM flight, browser journey, numerical study, measurement or physical qualification is claimed.
- Remaining RMP15-C01 scope: changed-provider/import/environment retention and export-trace/telemetry interoperability journeys; native/browser usability and other RMP15 checks remain with their lanes. No acceptance-register status was changed.
- `REVIEW.md` records the independent verdict (ACCEPT) and the five minor findings. No push, merge, release or external contact.
