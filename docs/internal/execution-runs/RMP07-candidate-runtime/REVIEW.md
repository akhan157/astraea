# RMP07 candidate runtime — independent integration review

## Disposition

**ACCEPT the bounded engine API increment.** Coordinating OpenAI review,
independent of the direct-DeepSeek author family. Production source
`066960f5fa7a5614f47fa035986016be6ecc3cce`, author records
`1b4e9b174373fab6dd66c5e2596b6e0288f7de68`, merge
`61367757eb54cb4b86c1ad6de4499bb596e81568`. The author did not self-accept.

RMP06-C07 and RMP07-C04/C07 remain **in_progress**. Real engine dispatch and
bundled-worker invocation are now evidenced; this does not implement candidate
GUI selection, persistence, plots/ensembles or the local axial source.
RMP07-C08's current exact-built-runtime evidence is refreshed to the verified
merged artifact, without rewriting earlier build receipts.

## Contract and code review

- Explicit `simulate_candidate` consumes `{request: NativeCandidateRequest}`
  through the existing prepared-provider trajectory/query/curve implementation.
  Legacy commands, default selection, project schema and core executable
  physics are unchanged. The only core edit is the approved module header.
- Prescribed total CA0 remains explicit; no friction-only source promotion,
  new support waiver, CP-derived static moment or implicit historical
  calibration transfer. Null and non-null diagnostic controls are refused by
  runtime dispatch; native experimental helpers retain their existing seam.
- Profile observations are shared across targets, while native profile parsing,
  evaluation and replay remain gated. This resolves the recorded first WASM
  build failure without exposing an unimplemented profile command.
- Both affected report representations move to 2.0.0. Request/core-result and
  input/model identity schemes stay unchanged. The identity deliberately does
  not authenticate the executable or report metadata; caller-bound artifact
  hashes remain necessary. Profile dispatch is still explicitly unavailable.
- The preservation checker validates complete new command metadata separately,
  then compares all remaining content against the same-input **post-knot parent**,
  excluding only reviewed `schemaId`, `commands`, `scopeNote` representation
  deltas. No trajectory fields, support rules or physical quantities are dropped.
- Removed one newly added redundant bare helper `is_ok` assertion during
  integration. Existing controls/identity/policy regressions retain the actual
  helper contract. No production behavior was changed by this cleanup.

## Independent merged-tree verification

Exact commands and raw artifact hashes are in `COORDINATOR-EVIDENCE.json`;
external files are under `../evidence-rmp07-candidate-runtime/coordinator/`.

- Engine suite: **102 passed in 12 suites** after the test cleanup, with two
  compile jobs and two test threads. Examples built from the same merged tree.
- Native command: real successful bounded run, exact requested horizon, absent
  landing and query/curve same-state invariants; six request-level refusals.
  Legacy serialized output is byte-identical to the accepted parent:
  `1c1e0f4129db92948613b303592a9a91ca8f86a758705461b98f2cfd9c352353`.
- Ordinary production WASM build: **1,827,128 bytes**, SHA-256
  `13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`.
  The author's artifact `307f585c…` is separately recorded; cross-worktree
  binary reproducibility is not established or asserted here.
- Real Node WASM worker: success plus eight refusals. Six request-level errors
  matched native exactly; missing-request and unknown-command behavior is also
  exercised. Worker terminated. Native/WASM content identity and canonical
  preimage match exactly. **14,958 numeric leaves** satisfy the approved bound;
  worst scaled difference **1.055e-15** at
  `curves.points[5].staticMomentCgBodyNm[0]`; five event-time leaves differ by
  **0 s**. This is not bit equality of every numeric field.
- Standing WASM consumers: **19 TS tests in four files passed**, including
  engine/oracle, ensemble determinism, unavailable geometry CP and moment-arm
  history; typecheck exit 0; Vite production build 3116 modules.
- Production-CSP Chromium: actual legacy GUI flight reports **533 m modeled**
  apogee and retains the exact current artifact hash in saved output. A manually
  created instance of the **real production-bundled worker** receives the
  compiled served WASM and explicit candidate request: success and all eight
  refusals agree with Node. Browser/native candidate payloads satisfy the same
  full structural/numeric comparison and exact content-identity contract.
  This demonstrates bundled-worker execution, **not candidate GUI selection**.
  Screenshot inspected; no page runtime errors. Worker, browser and preview
  closed in `finally`.
- Current identity checker passes on the accepted-parent baseline; current
  profile checker passes all nine independent checks.

## Evidence correction

Author EVIDENCE.json pinned checker scripts as `dd4e5994…` and `02f94e79…`.
Neither matches the committed source. Both lane and merged copies hash to
`0ac0800dc815a2bd8e92ffa8c5091ea4a99a4bd8a6a75902f669da4fa190bb58`
(identity checker) and
`8eb0913a13f831cd2a9c1bf3d3b2d971171029b050222ae9b464dd1b22848869`
(profile checker). Portable pins are corrected with original values retained in
`coordinatorCorrections`. The independent reruns cover the actual final scripts;
no claim that the original pins establish that execution. Other historical
artifacts and reported build failure are retained unchanged.

## Remaining limits

Engine API only. No candidate project/default/GUI/ensemble rollout; profile
requests remain helper-only; no local axial-startup source integration, empirical
or broader numerical qualification. Full committed-sample reports have no new
response-size cap; long horizons/tiny steps remain a request-resource risk, not
solved by the worker. The artifact-reproducibility lane must diagnose actual
build inputs without silently changing identities or old fit provenance.

No release, push, main merge, data acquisition or protected-outcome access.
