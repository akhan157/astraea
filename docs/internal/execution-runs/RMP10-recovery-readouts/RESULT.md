# RMP10b — recorded recovery interval / landing comparison correction

Source add2c706ba8a09f0db613f38dd79d26069ea5af2, base59700ee85c4c832784b37f6e8ddca4a351390584.
first supplied-source review REQUEST_CHANGES, focused rework rereview ACCEPT.
Coordinator applied its nonblocking tooltip/test suggestions afterward; final
checks pass, records-only package checkpoint. Parent RMP10 remains partial.

## Delivered bounded correction

- Recovery now labels “Apogee → touchdown”, uses retained summary apogeeTime and
  unique non-derived touchdown event time, not delayed drogue activation.
- Requires affirmative nominal flag, no explicit timeout, finite nonnegative
  chronological clocks, exact agreement of touchdown event time with recorded
  flightTime. Missing/duplicate/derived touchdown or inconsistent clocks return
  explicit unavailable reason (including missing apogee/end carrier objects).
  Actual zero interval preserved, no fallback0. Shared landingAvailability returns
  the same reason in Recovery landing values/interval and Flight Results values.
- Flight Results suppress landing-speed/energy deltas unless both runs report
  nominal touchdown, showing N/A with reason rather than a misleading green
  improvement. Explicit timeout also withholds landing values/interval despite
  a contradictory nominal flag. Other rows/deltas unchanged.
- Pure retained-data helper; does not mutate, persist, reconstruct, query, rerun
  or promote a record. Old absent termination metadata allowed only alongside
  affirmative nominal flag and (for interval) matching actual recorded clocks.

## Source-backed definitions, not new event physics

Core six_dof.rs ApogeeDrogue branch records physical peak separately from recovery
activation (served_peak/stashed_peak_time vs ev_time). Touchdown branch calls
push_touchdown_event at serve_at, assigns touchdown_tau; after loop t=tau;
SimulationResult.flight_time=t. Engine models.rs copies r.flight_time to
flightDuration and each native event.time without rounding. Adapter preserves
those into run.summary.apogeeTime / flightTime / run.events. Exact clock equality
is a same-record consistency condition, NOT a new numerical/physical tolerance.

No engine/core/bridge/schema/archive/input/key/options/default/model/WASM edits.
Source/claim limits from RMP10a preserved. Model landingNominal is not parachute
success, safety, rule compliance, per-section energy, or approval. Main native
speed's vertical basis and other event/output dictionary issues remain outside
this correction; no reinterpretation of those historical values.

## Regression-first and verification

- before-fix.log:6 tests,5FAIL/1PASS. Actual old Recovery rendered17.0s when
  retained peak10/deployment13/touchdown30 require20; missing touchdown rendered
  -13.0s; missing deployment marker rendered30.0s instead20. Both current/previous
  non-nominal cases incorrectly rendered green -4.9m/s deltas. Landing-energy
  assertions followed speed and were not independently reached pre-fix. Positive
  both-nominal landing comparison already passed (nonvacuous control).
- focused-1.log:23pass/3files at that earlier snapshot =13pure helper +6UI
  regressions +4existing read-only src/console/stages/siteAndTelemetry.test.tsx.
  This run predates the seventh UI test (explicit timeout/conflicting nominal
  flag), added after the first fix; not claimed independently red pre-first-fix.
  Assignment step1 required the initial interval/absent-event/non-nominal-delta
  regressions, not every later defensive test. No retrospective old execution
  asserted. tsc-1 failed ONLY test DOM Element/HTMLElement typing; corrected
  .closest<HTMLElement> before the later affected run. Exact first-focused test
  file hashes were not recorded then; chronology/count split author-attested
  from actual commands/logs, not reconstructed historical source.
- affected-1.log:76pass/10files, including13pure clock/availability cases,
  7rendered recovery/comparison tests, site/output boundaries, stage rendering,
  job/preview/store, Build export, SavedRuns and RMP10a history panel.
- First-rework negatives before-rework.log:3fail/19pass over22cases. Two missing
  clock-carrier tests throw before optional guards; timeout value reason differs
  before shared availability. Exact-label post-fix guard strengthened (initial
  pre-fix test used legacy-tolerant regex solely to reach the old numeric bug).
- affected-2.log:77pass/1fail, ONLY new Recovery test's unscoped Landing speed
  text query hit both stat and gate. tsc-3 test-only errors from optional clock
  fixture typing. Scoped query to summary grid; fixture now declares populated
  clock carriers, missing-carrier tests deliberately widen to accepted input.
  One exact-edit uniqueness rejection changed no test file; corrected context
  before execution, no partial-point test success claimed.
- focused-2.log:26pass/3 named files at the rereview checkpoint =15pure +7UI +4existing
  siteAndTelemetry; current source hashes recorded. No reliance on old23 as proof
  of current source. Rework affected-3.log:78pass/10files =15pure helper +7rendered new regressions
  plus existing affected files. tsc-4 clean. Author-recorded build-1 and build-2
  Vite passes, FULL logs supplied to rereviewer. Build1 is first-fix production;
  build2 is reworked production before final tooltip copy tweak. Subsequent
  selector/fixture fixes before rereview were TEST ONLY. Known jsdom canvas
  diagnostics are not native WebGL/browser proof.
- Author-recorded local WASM SHA (not reviewer-verified):
  b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b.
  Vite-only build, no Cargo/WASM rebuild, no engine/browser/numerical study calls.
  No RMP12 reruns, held-out outcomes, broad scripts or asset replacement.

## Review / availability / remaining scope

Author current Sol/high; first independent opencode-go/mimo-v2.6-pro / medium /
no-tools review PID549514 REQUEST_CHANGES. It confirmed production arithmetic/
availability correct but requested missing build-log evidence and test-snapshot
reconciliation. It also identified inconsistent unavailable reasons, a weak label
assertion, missing-carrier robustness and unclosed other-consumer audit. Full
first verdict/error retained; scope was supplied source/logs only, no fresh
filesystem/hash/test execution. Current rework resolves code/tests and record
issues; focused rereview PID554632 returned ACCEPT, all six findings addressed,
no material remaining findings. No independent reviewer filesystem/hashing/test
execution claimed; no physical/team/parent/release acceptance.

After ACCEPT the coordinator implemented two NONBLOCKING recommendations:
tooltip now explicitly includes no timeout; additional UI test isolates missing
recorded touchdown with nominal flag true. Third recommendation (build1 vs2
chronology wording) clarified above. Only production delta after rereview is
that tooltip text; main helper/guards unchanged. Final affected-4.log79pass/
10files =15pure +8UI +56existing, tsc5clean, Vite build3pass. No new independent
review/execution claimed for those routine literal/test-only follow-ups.
SOURCE-INVENTORY-3 records final five files; earlier snapshots/verdicts retained.

Build logs1/2 and read-only third focused test source now supplied. Explicit
post-fix-only timeout test chronology above; no attempt retrofitted as pre-fix.
RecoveryCard/Build/SavedRuns/RMP10a history-panel duplicate-interval/dictionary
audit is OUTSIDE this lease and OPEN: affected tests do not prove its absence.
This increment claims consistency only in the two touched readout paths. No
material new physical composition, no broader consumer/parent closure.
Raw external-local logs/review in
/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-recovery-readouts/.
Portable current/prior source/check hashes and actual review dispositions retained.

RMP10-C04 progress ONLY interval definition/availability; guide/button/contact,
section energy, broader recovery triggers/qualification remain open. C06/C07
regressions strengthened, no new PASS. No physical/accuracy/numerical reserve/
mission/team/platform/release acceptance, new threshold, or published claim.
No push/deploy/outreach/paid provision/automation restart. Source/compute lease released; records-only package checkpoint. No task-owned
reviewer/build/browser/server remains. package-validation.json is integrity only,
not scientific/engineering/release acceptance.
