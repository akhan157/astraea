# RMP13-C05 / RMP13-C06 result — classified ensemble outcome ledger

- Packet and exact completed versus unfinished scope: completed the bounded
  engine/core/consumer ledger cutover. Every requested absolute run index now
  carries an explicit outcome class and the native termination/validity/envelope
  fields; the chunk/whole reducers enforce exactly-once absolute coverage;
  dispersion and footprint visualization use only supported nominal terminals;
  zero eligible samples yield `statisticsAvailable=false` with null/absent
  statistics; all five counts are always emitted. Unfinished: coordinator
  independent review/integration, real-browser UI/archive round-trip, and the
  RMP13-C05 probability/coverage assessment itself. No acceptance promotion.
- Owner/model/effort; rework/escalation and observed usage only if available:
  single worktree owner; OMP / OpenRouter DeepSeek V4.1 Flash 1017, high
  reasoning; no subdelegation or reviewer. No usage-limit message supplied.
- Base and resulting source commit(s); branch/worktree clean/dirty:
  base `a68c03e95540fd6a3fb0e1a0384ec732accc75624`; source commit
  `4d7e377a396e6593154b63e000c96b0c8265c547` on
  `rmp13-ensemble-outcome-ledger`. The generated WASM and `dist/` are ignored;
  the coordinator dispatch note remains untracked. No unrelated user work was
  present or modified.
- Concrete behavior/physics change and user consequence: no physics, sigma,
  tolerance, seed, default or sampling-stream change. Previously
  `EnsembleParts::fly` discarded every native result field except landing x/y,
  so a timeout endpoint or an UNKNOWN/off-envelope touchdown appeared as an
  ordinary finite "landing" with zero failures. Now:
  - Every index is classified as `supported-nominal-terminal`,
    `unsupported-nominal-touchdown`, `non-nominal-impact`,
    `time-limit-endpoint` or `computational-failure`.
  - `Supported` means native validity `PASS` + declared Mach/alpha envelope +
    touchdown-nominal only; it is scenario-only and never physical
    qualification or probability.
  - `landings` keeps its legacy meaning (every finite endpoint in absolute
    index order). `eligibleEndpoints` is the strict supported-nominal
    footprint. Timeout positions are retained but never called landings for
    statistics.
  - A complete result requires exactly-once coverage of `[0, nRuns)`. Missing,
    duplicate, overlapping or mismatched indices throw; cancellation still
    records no result.
  - All-failure/all-timeout/all-unsupported classified ensembles return the
    complete ledger with `statisticsAvailable=false` and absent statistics,
    not an error that discards the per-index record. The legacy whole
    `run_ensemble` command and its all-failed error are unchanged.
  - `run_ensemble_chunk` keeps its command name, range partitioning and legacy
    fields, and additively carries `runs`, `counts` and `outcomePolicy`.
    `run_ensemble_classified` is the separate classified whole entry point.
- Source/equation/input/runtime/artifact identities:
  - New shipped WASM SHA-256
    `08394e5299f1cb8f8dae9f4e726a332300abd962efa27d367c49c131d6fa7ea6`
    (old before-probe WASM `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`
    is preserved in the supplied evidence, not reused).
  - Rust target directory reported by Cargo:
    `/home/ak/.paseo/worktrees/3s8t98rp/rmp13-ensemble-outcome-ledger/crates/astraea-engine/target`.
  - Source hashes and per-check evidence are in `EVIDENCE.json`.
  - Project schema stays `1.11.0`; new archive fields are optional summary
    scalars (`outcomePolicy`, requested/eligible/class counts,
    `statisticsAvailable`). Absence keeps the exact legacy finite-endpoint
    meaning. No migration and no retroactive rewrite.
- Acceptance ID -> command/mechanism -> result -> evidence location:
  - RMP13-C05: classified actions on the actual supplied NASA preset and
    shipped WASM. At winds 3/15/30 m/s (zero sigmas, seed 123):
    wind 3 = 1 supported nominal terminal with statistics; winds 15/30 = 1
    unsupported nominal touchdown each, `statisticsAvailable=false`, finite
    endpoint retained. A 100 m-canopy artificial timeout is classified
    `time-limit-endpoint` with `terminationReason=timeout` and no statistics.
    A per-run domain rejection yields two `computational-failure` entries with
    both indices retained. Evidence:
    `../evidence-rmp13-ensemble-outcome-ledger/after-classified.json` (produced
    by the retained `replay-classified.mjs` against the shipped WASM).
  - RMP13-C06: real-WASM partition replay (6 runs, seed 4242, 5/1/3 sigmas)
    split `[2,6)` then `[0,2)` and reordered: same classified runs, same
    landings, same eligible set. TS/Rust reducers reject missing, duplicate,
    overlapping and mismatched absolute indices before producing a complete
    result. Cancellation remains a failed attempt with no archive
    (`src/engine/ensembleDeterminism.test.ts`, `src/console/store.test.tsx`).
    Consumer-visible counts and no-fabricated-snapshot behavior are covered by
    `src/console/stages/SavedRuns.test.tsx` and
    `src/application/runCases.test.ts`.
- Failed attempts and unresolved blocked/not-applicable reasons:
  - First Rust check failed on an invalid `Copy` derive for DTOs containing
    non-`Copy` landing/statistics fields; removed `Copy` and rechecked.
  - `pnpm exec tsc --noEmit` refused to run over a temporary `node_modules`
    symlink ("workspace hoist directory is not a real directory"). Ran
    `node node_modules/typescript/bin/tsc --noEmit` directly; clean.
  - First real replay compared legacy finite endpoints with the supplied
    before probe while using the vehicle site altitude (100 m) instead of the
    probe's declared pad 0 m; the comparison was false. Re-ran the declared
    pad-0 conditions and the legacy finite endpoints/failure count matched
    exactly.
  - The artificial-timeout numeric endpoint did not match `more-before.json`
    because that probe's vehicle/options are not fully identified in the
    retained file. The result therefore claims only the timeout class and
    `terminationReason`, not numeric equality.
  - Not run: full cargo test suites, full TS suite, real-browser archive/trace
    round-trip, statistical coverage/interval study, protected outcomes.
- Synthetic/development/qualified-source/empirical evidence classifications:
  the before/after probe is actual shipped-WASM output on the actual
  browser-exported NASA preset under declared synthetic conditions. It is not
  a measurement, holdout, physical-accuracy or coverage result. The 100 m
  canopy and domain-rejection scenarios are explicitly artificial.
- Before/after prediction/output/default consequences and limits: before, the
  same 15/30 m/s UNKNOWN flights and the 300 s timeout produced
  `failedRuns=0`, finite `landings`, and no classification. After, they retain
  the same finite endpoints in `landings` but are counted as unsupported or
  time-limit, and the strict footprint has zero eligible samples. No default,
  sigma, seed, geometry or physics value changed.
- Independent review disposition/findings/corrections: none in-lane by design;
  coordinator review pending. The coordinator must independently check the
  policy, the real browser archive/UI and the rebuilt engine identity.
- What was not run/available and why; no implied old-machine artifacts: no
  browser session, no full test suite, no research benchmark, no protected
  flight data, no accuracy/coverage closure. The old production-SHA-bound
  calibration artifact is now different from the rebuilt engine and must be
  shown inactive/refused by the existing applicability guard; its fit SHA was
  not rewritten. The old research engine pin in
  `scripts/diagnostics/accuracy-execution.mjs` was left untouched as instructed
  and is recorded as invalidated by this rebuild.
- Current active processes/agents/resources and release of file leases: no
  servers, watchers, subagents or browsers left running. All file leases for
  this lane are released after the coordinator integrates or reworks the local
  commits.
- Exact next task and files/decisions/dependencies: coordinator independent
  review of `4d7e377`, real production-CSP browser proof of the Monte Carlo
  counts/no-footprint state and saved/archive round-trip, and a decision on
  whether RMP13-C05/C06 stay evidence-bounded until real uncertainty/coverage
  inputs exist. Candidate follow-up: render the full classified ledger as a
  trace table rather than only counts.
- Usage-limit failure/reset exact message/time if actually supplied: none.

## Rework after independent review (appended to the history above)

- Review gap: the support rule admitted a terminated, touchdown-nominal,
  validity-PASS, enveloped sample even when the native off-nominal excursion
  flag was true. That could produce a false qualified footprint.
- Consumer-visible fix: an off-nominal excursion now classifies as
  `unsupported-nominal-touchdown`, never `supported-nominal-terminal`, in both
  the Rust engine classification and the TypeScript mirror. A timeout with the
  same native flags remains `time-limit-endpoint`. All other classes,
  denominators, counts, legacy `landings`, and null-statistics behavior are
  unchanged.
- Regression coverage: a manufactured PASS/enveloped/nominal-touchdown/
  excursion-true finite endpoint asserts the Unsupported class, paired with a
  valid-timeout sanity assertion; the TypeScript mirror has the equivalent
  mocked-result assertion. No real-WASM hash or browser claim is changed by
  this rework.
- WASM handling: no rebuild was performed for this Rust-only classification
  and test rework. The shipped-WASM identity recorded above remains
  `08394e52...`; the classification source change must be rebuilt during
  coordinator integration before that artifact is used as final runtime
  evidence.
- Scope: classification/test/assignment wording only; no physics, sigma, seed,
  default, schema, archive, UI layout or acceptance-scope change.
