# RMP01 / A1d-2 result and review handoff

## Completed versus unfinished scope

**Complete for this bounded native increment:** a prepared SB1 candidate
composition with an explicit prescribed axial source and mechanical carrier; one
evaluator shared by a bounded trajectory, a direct load query and a static curve
sampler; a candidate-only exact-horizon bridge over the shared A1d-1 driver; a
separate bounded result/error schema; the explicit inherited rate couple and
declared canopy branch; support/identity/validation refusals; a DTO-native
example and synthetic fixture; unit/integration/parity evidence; and an
independent review with resolved findings.

**Not complete (and not claimed):** any empirical/physical qualification, a
qualified axial or atmosphere source, measured mechanics, recovery or transonic
physics, a candidate touchdown flight, a project field/migration, a dispatch
command, a GUI option, a default activation, a WASM rebuild, or any push.

## Owner/model/routing and observed usage

Author/coordinator: Sol-class reasoning session, high effort, single owner on
`execute-rmp01-package-c80e7d3`. Independent reviewer: Codex CLI (GPT-6),
read-only sandbox, three passes (one full review, two focused re-reviews); the
reviewer ran no builds or tests. No subagents were run concurrently. No usage
limit message was supplied, so no quota/reset is inferred.

## Base, source commits and branch state

- Base: `c80e7d356fe0a777bd793c56815388960ea597c7` (dispatch head, equal to the
  remote `delivery/integration-20261024` head).
- Source commits: `0ae1d8e` (shared mechanical/flow/rate/canopy extraction),
  `f5ea5c5` (candidate horizon bridge), `7f37a1f` (core provider/query/curves/
  result), `aa4d9fd` (engine DTO helper/example/fixture/tests), `940bb93`
  (review-driven negligibility/attitude/altitude/motor/parachute fixes),
  `f69a311` (canopy support/order/floor fixes), plus the run-record and
  method-note documentation on top.
- Source SHA for the evidence: `f69a3111afb6d556d318554bb316dcd20ea64117`.
  Worktree clean at handoff; no other worktree or branch was reset/cleaned.

## Concrete behavior change and user consequence

None in the app. No command, project schema, default, calibration, telemetry,
WASM asset or desktop behavior changed. The legacy `simulate_flight` path and
its result are byte-identical on the retained synthetic fixture. The new code is
a native-only diagnostic/experiment that can run a bounded SB1+rate ascent,
answer load queries and produce static curves from a real engine DTO.

## Identities and evidence

- Fixture: `crates/astraea-engine/tests/fixtures/native-candidate-request.json`
  sha256 `ea853d96…` (synthetic declared vehicle; certified Estes C6 thrust
  record; prescribed constant CA0; still air).
- Native report: sha256 `a8b08ccb…`, 533 KB, external evidence directory.
- Legacy before/after: 1,969,393 bytes, sha256 `f37d195f…` both sides.
- Source/equation identities: `static-body-total-SB1/1.0.0`,
  `legacy-dimensional-rate-couple/1.0.0`,
  `candidate-static-rate-composition/1.0.0`,
  `near-unit-quaternion/1.0.0`, `candidate-aero-negligibility/1.0.0`,
  `no-historical-calibration/1.0.0`, `astraea-bounded-candidate-result/1.0.0`.
- Full per-check command/mechanism/evidence is in `EVIDENCE.json`.

## Acceptance status

| ID | Status | Evidence summary |
| --- | --- | --- |
| C01 | pass | engine-native test + example; 2.0 s ascent, 201 committed samples, query and curves from the real DTO path |
| C02 | pass | bit-identical static coefficient wrenches across trajectory/query/curve; one core evaluator |
| C03 | pass | NaN-poisoned legacy carriers; absurd-vs-NaN carrier trajectories identical; explicit mechanical bounds still checked |
| C04 | pass | shifted datum preserves the CG wrench; force-free rate pure couple; accepted core C0/null-CP analytic fixture |
| C05 | pass | independent recomputation of signed rate moments; static fields unchanged by omega; curves exclude rates |
| C06 | pass | zero-speed/zero-rate zero loads with null flow; zero-speed/nonzero-rate refusal; nonfinite/attitude/motor/impulse refusals |
| C07 | pass | Mach/incidence/forward-flow/geometry/cant/scale refusals at every applicable stage; real run injections; no rail waiver above the declared force bound |
| C08 | pass | canopy bypass with N/A reasons, declared drag + rate retained, canopy Mach support before negligibility, no fallback |
| C09 | pass | exact off-grid/short/exact-stop final time and committed state; no probe past the stop |
| C10 | pass | time-limit result has no landing/apogee/PASS; separate touchdown schema test with actual final-state landing evidence |
| C11 | pass | structured speculative/committed error records; no fallback; retained A1d-1 driver coverage |
| C12 | pass | calibration scale refused unless omitted/1.0; explicit axial/geometry/adapter identities; no content-hash claim |
| C13 | pass | 170 core + 65 engine tests; byte-identical legacy snapshot; no candidate dispatch command |
| C14 | pass | independent three-pass read-only review: ACCEPT after resolving 5 + 3 findings; limitations retained |

No acceptance ID is marked `not_applicable`. The limitation for C10 is explicit:
a candidate touchdown is unreachable under SB1 forward-flow support, so the
touchdown branch is evidenced by a labeled result-schema test, not a flown run.

## Failed attempts and honest limitations

- The interrupted WIP patch was not used (broken horizon semantics, legacy PASS
  fields); its branch/patch remain untouched provenance.
- The first fixture was too heavy for its motor and hovered on the rail; the
  synthetic design was made lighter. No physical law was changed.
- The first review rejected a fixed 1e-2 m/s flow-direction floor as an
  undeclared support exception. It was replaced by the bounded
  `candidate-aero-negligibility/1.0.0` approximation (zero dimensional aero
  loads only when the maximum possible static force is ≤1e-6 of weight, with no
  flow observation and full checks above the bound), documented in INTERFACES.
- A second review rejected three canopy details (inherited 1e-6 m/s force floor,
  Mach support bypassed by the negligible branch, wrong zero-speed status
  precedence); all three were fixed and re-reviewed to ACCEPT.
- SB1 remains static and unqualified; dynamics UNKNOWN; the mechanical carrier
  is the legacy primitive model; atmosphere/wind are retained assumptions; CA0
  is prescribed; a flagged-motor-mount DTO is refused by the existing adapter.

## Not run / not available

No scoring/holdout dataset, telemetry generator, browser/WASM rebuild, desktop
packaging, push, merge, tag, release or deployment was run. No Docker or browser
capability was needed. No paid capacity or external contact was used.

## Active processes and leases

No dev server, watcher, headless browser or background build remains. One Cargo
job at a time used the external target directory; file leases are released at
handoff. The old hourly automation remains disabled and was not run.

## Exact next task

Update the package tracker and `STATE.md` to record the accepted bounded RMP01
increment, then expand RMP06 (complete axial/environment) and RMP07
(identity/app exposure) from these actual interfaces. A concrete adapter
extension for flagged motor mounts is the next DTO-path blocker to design if a
real vehicle requires it. No push or release is authorized by this packet.
