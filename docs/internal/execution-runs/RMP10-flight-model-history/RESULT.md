# RMP10a — sampled, result-bound legacy flight-model normal moment arm

**ACCEPTED bounded software implementation/runtime increment; parent RMP10 partial.**
Local source commit `6117ea161fc5c906ce7b57ebf4bbe0ff4789fd1a`.
Contract checkpoint `feb3c1aa5e18263a3b7592e9186bc29a65eed791`. The accepted
observable contract is implemented across core → DTO → invocation-bound host →
Aero/SavedRuns → project1.8/trace. This is sampled reporting of the existing
legacy flight law, not a new law or a collegiate accuracy/stability qualification.
Parent RMP10 remains partial. No push, deployment, release or candidate activation.

## Delivered local slice

- Optional `reportMomentArmHistory:boolean` sibling on `simulate_flight` only.
  Off/absent preserves old native output; malformed/null/unsupported presence
  refuses. Existing public3arg native entry remains off. Console explicitly
  captures and requests true; preview/ensemble/direct ordinary callers stay off.
- Exact existing committed MacroSample time/mass/diagnostic copied through
  declared motor burn time plus initial, before telemetry rounding. No extra RHS,
  interpolation, rejected/probe/root samples or changed trajectory clock.5000
  pre-push cap errors, never silent truncation/partial success.
- Actual motor-depleted CG, normal C/J/CP, CP-CG, calibers/%length and neutral
  J-C*CG, air-relative flow, original domain/flags and body force/static/rate/total
  moments, reference/frame/source/sampling declarations. Live-canopy normal terms
  are null/N/A only after original source evaluator succeeds. Original positive/
  conditioned-C, cancellation and positive-propellant entry refusals stay intact.
- Read-only Aero plots and selectable retained-point readout; explicit gaps,
  sample count/range/max gap and last-to-DECLARED-burn-time distance. A genuine
  exact timestamp is disclosed only if present. No continuous minimum, stable-
  through-burnout, dynamic-stability or competition verdict.
- Actual per-invocation `engineIdentity`, not a nested self-hash/current query;
  same request captured before dispatch in archive2. Existing physics options,
  physical freshness keys, model/environment/mechanics/calibration IDs unchanged.
- Project1.8 preserving1.7 migrations; old absence remains absent/unavailable.
  Strict history/schema/clock/burn/model/identity/request bindings and known
  misplaced metadata refuse before project replacement. SavedRuns does not
  relabel historical samples as live; Build trace retains history/identity/key.
- Actual browser found JSON.stringify losing -0. The corrected project and both
  trace writers emit JSON -0.0 using a collision-checked serializer for stable
  plain DTOs. No sentinel is persisted; ordinary strings/keys/order/other number
  values are unchanged. Read/parse/freezing do not normalize retained values.

## Verification (software, not physical accuracy)

External raw evidence root:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-flight-model-history/`.

- Core191 tests pass (`core-full-1.log`); production core unchanged afterward.
- Engine98 tests pass (`engine-full-4.log`).6 focused history tests include
  serialized old-output byte equality, raw diagnostic/algebra/disclosures, actual
  evaluator CP=J/C bits/C>=1e-4, direct actual evaluator exclusive powered flag at
  declared burn time, manufactured boundary/canopy DTO mapping and error/cap/no
  partial success. Direct boundary evaluation is NOT evidence that the flight
  trajectory contains an exact burnout sample/root.
- Final affected frontend348 tests/27files pass (`ts-expanded-4.log`) after
  the TEST-only Node shim-compatible path/decode correction. Earlier348-file-set
  run and focused WASM rerun retained too. TypeScript clean (`tsc-7.log`).
- Real offered-WASM off/on preservation test invokes existing production ABI on
  the same synthetic input and checks all old result values, including signed
  zero, plus actual strict history parsing. Two calls per execution, not a new
  numerical reserve experiment or broad native/WASM physical/parity proof.
- Intentional release WASM build after source review, new target-rmp10, offline,
  two compiler jobs. `wasm-build-1.log`; generated asset SHA-256:
  `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`.
  Old generated b971b222… retained externally as wasm-before.wasm. Old sealed
  target-rmp01 binaries rehashed unchanged; never rebuilt/replaced.
- Vite build passes (`build-2.log`) with signed-zero fix. Generated WASM is
  ignored/rebuilt from source, not committed as a historical binary replacement.
- Actual Chromium156/CSP synthetic journey passes (`browser-8/metrics.json`,
  portable BROWSER-CHECKS.json). Both fetched asset buffers and each saved case's
  invocation identity match b32e7b7c…; actual worker history equals saved history
  including negative zero; selected points/plots, stale motor alternative, raw
  trace and downloaded project+trace ZIP retain the same data; save/reload/open
  historical plots, corrupt import refusal and manufactured1.7 absent-history
  migration preserve cases; explicit saved-input rerun reproduces raw history.
- Final browser invocation observes3 explicit UI simulate_flight calls and2
  PRE-EXISTING Workstation startup simulate_flight calls,5 total of that command.
  These are not all engine/solver calls: initial/reloaded pages also make3/2
  ordinary uncommitted flight_summary preview calls, respectively; other command
  counts are recorded. History views do not add committed simulate_flight calls
  or use preview/geometry data to replace retained history. No claim of zero
  background computation in the existing app.
- Final synthetic preset/variant each186 samples; initial modeled CG changes
  0.3387755306208039m →0.34808890019054595m with invented18mm imported software
  motor. These illustrate software binding/alternative handling, NOT measured
  motor/mechanical accuracy, stable margins or approved decision thresholds.
- No runtime errors, CSP violations or external requests in final journey.
  Browser/server close in finally, engine workers capped2, compiler/test jobs2.
  Download fallback deliberately exercised; native OS picker/install not tested.

## Retained failures/corrections — not erased by later passes

See IMPLEMENTATION-WIP.md for original regression/core/compile/archive fixture
failures. Particularly, initial19-green TS log had2 VACUOUS negative assertions
(duplicate motor ID); corrected valid control produced the intended18pass/2fail
before the archive fix. No claim that the original green tested history refusal.

New browser attempts each use a fresh directory; no overwritten outputs:

| Attempt | Result / corrective scope | Observed simulate_flight calls |
|---|---|---:|
|1|Failed assumption of zero initial calls: existing Workstation mount starts one default flight. Observe/account separately; no app change.|1|
|2|REAL signed-zero loss on save: worker -0 became archived0. Added2 failing project/trace regressions, fixed serializer; did not relax raw contract.|2|
|3|Observer used missing wire field flightTime for stop clock; harness error, not engine failure.|2|
|4|Incorrect guessed totalFlightTime also absent; corrected after source inspection to actual flightDuration.|2|
|5|Harness waited for Use button after Add to catalog already selects imported motor; assert actual selected record instead.|2|
|6|Pass initial full bounded journey.|5|
|7|Pass extended actual ZIP download checks.|5|
|8|Pass final same journey with explicit command-count boundaries and2 WASM compilation tasks.|5|

Total observed simulate_flight commands across these browser invocations24,
including startup calls. Ordinary preview/other commands in earlier attempts
were not counted; final attempt records each command count. No numerical-study
budget or physical reserve question was pursued or changed between attempts.
Full run inputs/requests/replies where captured, errors and screenshots retained.
First2 attempts' JSON diagnostic artifacts used default stringify (and therefore
normalize negative zero); their assertion/error logs explicitly retain the lost-
sign finding. Later artifacts use signed-zero-preserving JSON. These are software
checks, not new RMP12a/b/c attempts, and do not replace any retained RMP12 failure.

Expanded affected tests first failed2 deferred project-job success mocks without
requested reports (`ts-expanded-1.log`); a first correction inadvertently let an
old full mock result override the captured burn clock (`ts-expanded-2.log`).
Fixed mocks now use each actual dispatch's reporting-aware fixture before resolving;
no production provenance/clock guard relaxed. Final348 affected tests pass.
Tsc6 caught only new test's use of Node overloads absent from repository's minimal
Node shim; explicit fileURLToPath/TextDecoder preserves identical fixture data.

## Review / remaining gates

MiMo/medium supplied-source review ACCEPT on SOURCE-INVENTORY-1, no material
findings, before intentional WASM build. It did not hash/execute/fresh-inspect the
filesystem and did not approve changed-runtime evidence. Three nonblocking risks
closed with test-only assertions described above (real C/J/CP/floor, real exclusive
boundary flag, failed/running/cancelled-as-failed requested jobs not archived).
Final focused source-fix/software-runtime evidence review PID535810 completed
ACCEPT, no material correctness/claim/evidence findings; same explicit MiMo/
medium/no-tools supplied-source/data boundary. It grants no scientific/physical/
mission/team/platform/release or parent acceptance. Raw final-review.md/.err kept.

Optional residuals: space is already inferred numeric in the TypeScript helper,
all actual callers use default numeric2, no generic untyped string-indent support
claimed. Added saved-output-only analyze-signed-zero.py / BROWSER-SIGNED-ZERO-
WITNESS.json after review: exact field points[0].dampingMomentBodyNm.x is IEEE
8000000000000000 in matching actual worker/saved variant/inspector trace/downloaded
ZIP project/ZIP trace. Input hashes included, no new browser/engine/solve. Final
348/27 full rerun closes the path/decode test-only timing residual. Production
source/driver remain exactly SOURCE-INVENTORY-3; no model or contract relaxation.

RMP10-C01/C02/C06/C07 may advance only as partial evidence, not PASS. Cancellation/
free-couple/undefined-CP alternatives, unified provider/source coverage, refined
peak/event/structural outputs and empirical/decision budgets remain open. Missing
team measurements and approved accuracy/decision budgets still block scientific
qualification. Legacy default numerical failure and all earlier accepted/failing
studies remain untouched. No release/team/installation/update acceptance claimed.
