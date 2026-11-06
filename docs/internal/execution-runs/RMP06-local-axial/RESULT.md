# RMP06a result — accepted direct local total axial diagnostic

## Completed versus unfinished

**Accepted bounded increment:** source/component inventory before math; reviewed
subsonic inherited total zero-incidence axial composition; direct actual E1
local-state consumption; per-component CA0/force and friction intermediates;
explicit powered/coast policy, clean configuration and friction-coverage
conventions; strict native JSON helper/example; portable synthetic fixture,
independent analytic/boundary checker, regression suites and independent review.

**Parent RMP06 remains partial:** no integration into flight/query/curve provider,
no stage-clock/MSL/AGL mapping, no axial cache, no product profile or project
activation. Source/physical qualification remains open. The local friction law
cannot support an uninterrupted launch from rest: exactly zero is supported,
small positive effective Re<1000 is refused. This is not hidden with a floor,
force waiver or fallback. Useful E1 bridge work remains possible with RMP01's
already-explicit prescribed axial source.

## Source / ownership / resources

- Dispatch base `3d9ca93b3a8bbf9283535a71ac502499b5e86dc5`; worktree and branch
  unchanged (`execute-rmp01-package-c80e7d3`); no other worktree touched.
- `bafc39d`: lease and component contract after independent contract findings.
- `a286e9d`: core direct composition and tests.
- `36d637c`: native boundary/example/fixture/tests/independent Python checker.
- **`15be61bbd7598f6a6b485bd3f9ebe9b217071312`**: numerical review fix, final
  source used by all final checks. Later commits record docs/evidence only.
- Author: installed OpenAI `gpt-6.1-sol`, high effort. Independent reviewers:
  separate read-only Codex sessions, serial, same installed model. First three
  runtime headers reported effort `none`; final independent full audit explicitly
  used `high`, confirmed in its runtime header. Not a different-model consensus.
- Current host measured ~10 GiB RAM available before builds/reviews; one Cargo
  command at a time, two compiler/test threads maximum; no concurrent subagents.
  No usage-limit/reset message or cost telemetry supplied/inferred.

## User consequence and actual behavior

No app-visible behavior changes. New native developer tool evaluates total axial
resistance from a supplied environment profile and declared clean geometry. One
E1 evaluation feeds local friction and inherited subsonic pressure/edge/base
terms. Nose/base frontal-area coefficients are converted to Sref exactly once;
fin/friction terms already use Sref. One component sum produces negative-body-Y
force. No CP, normal force, moment, wind-drag addition, thrust or canopy force.

Powered flow requires an explicit inherited .38 plume-factor policy; coast-only
never silently accepts powered. Invalid/unsupported geometry, profile/units/time,
local state, low Re, Mach>=.8 or lost-positive arithmetic refuses. At zero speed
all axial coefficients are unavailable with a reason and static force is zero.
Raw parsed inputs/profile/source labels are retained but not called content
hashes or source qualification.

## Fresh checks at final source

- **177 core tests**, **70 engine all-target tests**, examples build.
- **22 independent native Python checks:** component/closure/force arithmetic,
  four fin cross-sections, powered base policy, reference-area force invariance,
  every fin set included, zero versus low-Re, profile/time/MSL/units boundaries,
  strict fields/Mach support, sweep underflow and cancellation versus legitimate
  structural zeros. Portable result: `native-boundary-result.json`.
- Fixture gives CA0 `0.24950090926721638`, axial force
  `(0,-4.345905150978223,0)` N, seven explicit components. Synthetic arbitrary
  geometry/environment, not measured drag or an as-flown rocket.
- Native result SHA256 `379be5e8…`, fixture `590faac6…`.
- RMP01 native report remains byte-identical: `a8b08ccb…`.
- Legacy response remains byte-identical: `f37d195f…` (1,969,393 bytes).
- `git diff --check` passes. Rustfmt component unavailable; not run successfully.
- Full source/runtime/log hashes and exact commands: `EVIDENCE.json`.

## Parent acceptance ledger

| Check | Recorded status | Actual evidence / limitation |
| --- | --- | --- |
| RMP06-C01 | pass | direct complete declared composition, independent analytic sum/reference conversion/no duplicate force; not physical qualification |
| RMP06-C02 | pass | equal-Mach isolated local pressure/rho, viscosity, length, roughness dependencies; no cached sea-level Re |
| RMP06-C03 | pass | explicit inherited power/base convention and no coast fallback; no measured nozzle/plume qualification |
| RMP06-C04 | in_progress | actual E1 time/MSL/units/wind/coverage exercised, but no shared flight stage-time/AGL mapping |
| RMP06-C05 | not_run | direct-only, no cache; cache-specific scope N/A for subpacket, parent numerical policy/budgets still undecided |
| RMP06-C06 | pass | invalid state/geometry, zero/low-Re/domain and overflow/underflow semantics evidenced; structural zeros retained |
| RMP06-C07 | blocked | shared candidate consumers not wired; startup source support remains explicit, native E1 bridge is useful next work |
| RMP06-C08 | in_progress | native outputs/default path preserved; no activation, project reopening/browser/WASM checks not newly run |

Passing check IDs cover the stated direct inherited software source only, not
all-source or product qualification. Parent RMP06 is not marked complete.

## Independent review / failed attempts

Verbatim disposition record: `REVIEW.md` (portable); raw transcripts external.

1. Contract review required nose as well as base reference conversion, whole
   nose+cylinder/all-fin-face friction coverage with no pressure in form factors,
   and LE-only sweep scaling in metres. Incorporated before code.
2. Implementation review: ACCEPT WITH REQUIRED FIXES — positive fin LE could
   disappear by sweep quotient underflow or rounded/airfoil low-Mach subtraction
   cancellation. Fixed in `15be61b`: require a positive representable sweep
   quotient, expected-positive LE and TE; preserve structural zeros. Tests and
   Python checker now assert positivity/refusal instead of tolerating erased
   tiny contributions.
3. Focused re-review ACCEPT; then independent high-effort full audit ACCEPT.
   Reviewers ran no builds/tests; author re-ran final suites and probes after fix.

## Availability / authority / lease release

Raw local evidence is external at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp06-local-axial/`. Portable fixture,
source/checker, native boundary summary, reviewer final messages and evidence
manifest are committed. No protected data, new source acquisition, browser,
frontend build, WASM rebuild, project mutation, paid capacity, external contact,
push, tag, merge, release or deployment occurred. Old automation remains disabled.

All reviewers/commands finished; no task server, watcher, headless browser or
background build remains. File leases released at this checkpoint. Existing
source files other than the two module registrations were read-only; nested
`crates/astraea-core/src/axial/tests.rs` is the test companion within the leased
new axial module. No locks/manifests/defaults changed.

## Exact next bounded task

**RMP06b:** repin accepted local head; lease `flight_provider.rs`, the shared
mechanical/flow boundary in `six_dof.rs`, native engine helper and focused tests.
Freeze launch geometric-MSL/AGL and fractional stage-time/UTC profile-validity
semantics before editing. First wire immutable actual E1 state through the
existing candidate's explicit prescribed axial provider so trajectory/query/
curves share environment and source records. Preserve RMP01 and legacy behavior.
Integrating `PreparedAxial` afterward requires an independently reviewed all-stage
startup source/support composition; do not invent low-Re physics or automatic
blending. RMP07 identity/migration/product exposure remains separately dependent.
