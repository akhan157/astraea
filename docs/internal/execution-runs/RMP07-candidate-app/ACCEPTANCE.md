# Candidate application — independent acceptance of integrated work

Reviewer: OpenAI coordinator, author-family independent of the DeepSeek author.
Integrated source: merge `6043a15` (`rmp07-candidate-app` head
`9aa3584920e455b4d764b99ea20bb22472413430` + coordinator test-policy cleanup and
CHANGELOG in the following coordinator commit). Branch `continue-task`.

Verdict: **ACCEPT for the candidate-application scope below.** Not a claim of
physical/numerical qualification, default activation, profile/local-axial-source
support, or release readiness.

## What was re-verified in the integration tree (not the author worktree)

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| Focused candidate/import/schema | `vitest run` 6 files | 145 tests passed |
| Full suite | `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | 134 files / 1739 tests passed |
| Production build | `PATH="$HOME/.cargo/bin:$PATH" pnpm build` | exit 0 |
| Legacy journeys | `node scripts/browser-smoke.mjs` | exit 0: 299/533/5130 m presets, imports, exports, 1000-run ensemble, calibration save/reopen, share bundle, cross-tab stale-save refusal |
| Candidate journey under production CSP | `integration-2026-10-29/candidate-integration.mjs` | exit 0, no page/runtime/CSP errors |
| Export round trip | `integration-2026-10-29/candidate-export-roundtrip.mjs` | exit 0 |
| Archive strictness | `coordinator-parser-after-3ed.json` (10 probes) | original accepted; 9 contradictions refused |
| Identity sensitivity | `integration-2026-10-29/identity-sensitivity.{log,test.ts}` | 13/13 effective-input variants change the canonical or are refused before a key exists; equivalent copy identical |

Artifact identities for THIS build (root-dependent bytes; not transferable):

- `src/engine/astraea_engine.wasm` = `dist/assets/astraea_engine-hYBby-qG.wasm`
  = **13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328**,
  1,827,128 bytes (the previously recorded production identity).
- Site asset `dist/assets/app-WWM5omPx.js` =
  `ba7be64f49f1212b6d7dc48ffbef8140ebb74a611a0fb808aebd7d285f55acee`.
- The app recorded exactly the served WASM SHA on the real candidate run
  (`Executed WASM: 13da44d5…`), so `RMP07-C08` holds for these bytes.

The author's worktree built a *different* root and therefore a different byte
identity (`da38461e…`, 1,827,192 bytes). That receipt is retained as that
worktree's history; it is not reused for this build. A case imported from it
correctly keeps `da38461e…` as its own recorded engine (asserted in the export
round trip): historical results are never relabelled with the current engine.

## Counterexamples found by the coordinator, then fixed and re-exercised

1. Contradictory archives were accepted (future apogee, negative event time,
   out-of-domain curve Mach, foreign environment identity, wrong last-state
   query time, enlarged support bound, `CompletedRequestedHorizon` short of its
   horizon, retained-final-sample state mismatch, retained-count mismatch).
   Now refused; the legitimate original is still accepted.
2. Two rapid Run activations during asynchronous preparation dispatched two real
   engine calls. Now one admission; later attempts no-op.
3. The command-palette "Run Monte Carlo" refusal under a candidate selection
   cleared the active admission (Run re-enabled, Cancel removed) and allowed a
   second mass/candidate dispatch. Now the refusal preserves busy/Cancel/token
   and dispatches nothing; `run_ensemble` was never dispatched.
4. A prior legacy run was presented as current on Mission/Verify/Aero/preview/
   Build/sidebar/Model status under candidate selection. Now suppressed with an
   explicit note; archived results stay in Saved Runs.
5. Capture aliased and froze caller state. Now a detached frozen snapshot.
6. Freshness relied on a 32-bit FNV key. Now one exact canonical invocation
   comparison at the shared boundary, with the FNV key kept only as a display
   key; a forced-collision test still marks the result stale.
7. An ungated empty schema `1.13.0` step was introduced and rejected compatible
   1.12 candidate files. Reverted to the approved `1.12.0` with identity-only
   `1.11.0 -> 1.12.0`; 1.13 receipts remain historical evidence only.

## Test-quality corrections made during acceptance

Removed, per the standing evidence policy: a broad DTO field-echo test, a bare
`not.toThrow()` "validator accepts" test, a `/^cand-/` key-format assertion, and a
wording pin. Retention of the mount flag is now asserted only as the invariant
that makes the adapter's refusal meaningful (dropping it would silently change
engine geometry), and the observed nested-sample regression is kept because it
was the first real production failure.

## Residuals (not hidden, not qualification)

- `curveMatchesReferenceSample = false` at the observed reference Mach is shown
  honestly; the engine-side diagnosis is queued for the engine lane
  (`RMP06-runtime-profile` assignment already carries the concrete probe).
- Long-horizon/tiny-step engine sample collection and reply size stay unbounded;
  the engine lane must propose a bounded retention policy. No app-side cap added.
- Candidate ensembles, arbitrary user-state queries, E1 profile dispatch and the
  local all-stage axial source remain unsupported by contract (refused, never
  legacy-substituted).
- No empirical, numerical or mission qualification; no default/primary switch.

## Register dispositions

`RMP07-C01`, `C03`, `C05`, `C06`, `C07`, `C08` now PASS for this scope;
`C04` and `RMP15-C01` stay in_progress because the E1 profile provider and its
environment are not yet offered through the app (queued `RMP06`).
