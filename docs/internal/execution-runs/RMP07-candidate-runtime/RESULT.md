# RMP07 candidate runtime boundary — result

Base `06952252ce937bdaabddbcc528ede8f3c6c427fd`. Source
`066960f5fa7a5614f47fa035986016be6ecc3cce` on branch
`rmp07-candidate-runtime`. Gate 1 was approved with amendments; the original
assignment and the approval/lease append are in [ASSIGNMENT](ASSIGNMENT.md).
This is an author result, not acceptance.

Coordinator subsequently **ACCEPTED the bounded engine API increment** after
merged-tree native/WASM and production-bundled browser-worker verification.
See [independent review](REVIEW.md) and
[coordinator evidence](COORDINATOR-EVIDENCE.json). The remaining sections retain
the author's original execution scope; later browser proof is coordinator-owned.
RMP06-C07/RMP07-C04/C07 remain in progress; no full-check promotion.

## Completed bounded increment

`simulate_candidate` now exists in the real engine dispatch and the wasm32
build. Its `{request: NativeCandidateRequest}` payload runs the existing shared
prepared-provider bounded trajectory, direct query and static curves, returning
the existing candidate report with versioned command metadata. It uses the
caller's explicit prescribed CA0 only; no local axial/friction source is wired.

The runtime command refuses profile envelopes and both explicit-null and
non-null `diagnosticNumerics`. The native helper entry points retain the
experiment-only controls seam and the E1 profile helper. The report schemas are
now `astraea-native-candidate-report/2.0.0` and
`astraea-native-profile-candidate-report/2.0.0`.

The input/model content identity is unchanged: the identity envelope covers
typed inputs, prepared models, active policies and numerical policy, not the
report's `schemaId`, `commands` or `scopeNote`. The same fixture therefore keeps
digest `80c447b8426ef64fa93509dbc07e75bba1859c01bbdfa586f0e7da8b9ffdb1b4`
(native) and `5e07b4b7cbfbee2e56a17d34e4c2707543a34f41b38cddc7d5534e3518524769`
(profile) while the report representation version changes.

Legacy commands, legacy result schemas, the default flight model, project schema,
GUI, ensembles and the build script are untouched. No source-wide reformat was
performed.

## What remains unfinished

- No GUI/project/default/ensemble selection or persistence. This is an engine
  API only.
- The E1 profile envelope remains helper-only and is not dispatched.
- RMP06 local axial source/startup and source/physical qualification remain open.
- No app-bundle/browser worker was run (`node_modules`/`dist` are absent). The
  runtime proof uses the actual rebuilt WASM in a Node `worker_threads` worker,
  which exercises the same raw engine ABI but not the app's bundled worker.
- No response-size cap was introduced. A fixture report is 591,180 bytes native
  and 777,511 bytes profile-shaped; long horizons or tiny steps can grow the
  committed sample list and curve output. The shared driver's iteration/trial
  guards remain, but that is not a response budget.
- `contentIdentity` is an input/model/policy identity, not an executable,
  artifact-origin or physical qualification.

## Source / ownership / routing

- Worktree: `rmp07-candidate-runtime`; base and source SHAs above.
- Routing: OMP direct `deepseek/deepseek-flash`, thinking `max`; session metadata
  recorded `resolvedModelIsFallback=false`. Catalog name per assignment:
  DeepSeek V4.1 Flash 1017. No subagents, proxy fallback or provider switch.
- The Rust language server was unavailable for the requested reference action
  (`No language server found for this action`). `REPORT_SCHEMA_ID` and the
  schema literals were traced by exact string/symbol search: engine source,
  profile branch, two Rust tests, `check-candidate-identity.py`, and
  `check-profile-candidate.py`.
- Host checks: at least 8.2 GiB available before builds; compiler/test
  concurrency `-j 2` and `--test-threads=2`; dedicated external targets; the
  Node worker was terminated after each smoke.
- Raw reports, logs, harnesses and build artifacts are external at
  `../evidence-rmp07-candidate-runtime/`; committed records contain hashes and
  repo-relative references only.

## Fresh checks

| Check | Result |
| --- | --- |
| Engine test suite | **102 passed**, 12 suites, 0 failed (`cargo test --offline --locked -j 2 -- --test-threads=2`) |
| Examples | Built (`cargo build --offline --locked --examples -j 2`) |
| Native dispatch determinism | Two runs byte-identical; envelope SHA `b95e3b04f867e8de8802c6ebf6ebed4fd73f326b0dae38682773ab52e7a70625` |
| Native helper report | SHA `54aeb530e2cecb0355684d12f69497b36c60ed0b6705c23972efda1b3154063b`; digest `80c447…` |
| Profile helper report | SHA `9e0f9a111013b00fc3053f60c4ae91295bfc146c7725d6112a2ccde742f53fda`; digest `5e07b4…` |
| Legacy serialized output | SHA `1c1e0f4129db92948613b303592a9a91ca8f86a758705461b98f2cfd9c352353`; byte-identical to the accepted-parent build |
| Updated identity checker | pass; schema and complete command metadata verified; content equal to parent except named representation deltas |
| Updated profile checker | pass; 9 independent checks |
| Release WASM build | 1,827,256 bytes; SHA `307f585c9e1523bf441f5b5f3a9a1e11eee70a9683d3f2fb823c9a3984f40a1f` |
| Real WASM worker success | report schema `astraea-native-candidate-report/2.0.0`; digest `80c447…`; worker terminated |
| Real WASM refusals | null/non-null controls, unsupported Mach, calibration, fin cant, profile envelope, missing request, unknown command; request-level text matched native exactly |
| Native/WASM parity | identity and canonical preimage exact; 14,958 numeric leaves, 0 differences; worst relative `1.0547e-15` at `curves.points[5].staticMomentCgBodyNm[0]`; 5 event-time leaves, worst absolute `0` s |
| Parent preservation | native and profile reports equal to the accepted-parent build except `schemaId`, `commands`, `scopeNote`; legacy output byte-identical |
| `git diff --check` | clean |

The parent build used base `0695225` and the identical frozen synthetic requests;
no old pre-knot legacy oracle was repinned or claimed as current.

## Failed attempts retained

The first release wasm build failed:

```text
error[E0425]: cannot find function `parse_profile_with_input` in module `environment_diagnostic`
note: found an item that was configured out (`#[cfg(not(target_arch = "wasm32"))]`)
```

The correction keeps profile evaluation and replay native-helper-only and leaves
`environment_diagnostic.rs` untouched; only the shared observation serializer is
compiled for wasm. The native and wasm builds then passed. No other failure was
observed.

## Acceptance mapping (bounded, not promoted)

- **RMP06-C07:** partial. The explicit command exposes one prepared provider and
  the same trajectory/query/curve static data with retained axial/source
  identities, and native/WASM parity is measured. Local inherited axial startup
  and broader consumer coverage remain open.
- **RMP07-C04:** partial. The engine command/read/curve path is now real in
  native and WASM; plots, ensembles, GUI selection and an app-bundle invocation
  remain open.
- **RMP07-C07:** partial. Computational/domain/quantity statuses remain in the
  report; no app status surface was added.
- No acceptance-register, manifest, TASKS or handoff entry was changed. No PASS
  is claimed.

## Limits / risks

- Cross-target parity is a measured software comparison, not a physical or
  global numerical qualification. The approved bound was applied without
  widening; the measured worst error is far below it.
- `diagnosticNumerics` is deliberately unavailable at runtime; experiment
  callers must use the native helper.
- Report metadata is a versioned contract. Existing external consumers of the
  1.0.0 report shape must migrate to 2.0.0; no compatibility alias is provided.
- The Node worker is not the app's bundled worker, and no browser/CSP/UI run was
  performed.
- Output resources are disclosed, not solved.

## Next action

Coordinator review and integration. Any GUI/app exposure, profile-envelope
dispatch, output budget or local-axial-source integration needs a separately
reviewed production-scope decision.
