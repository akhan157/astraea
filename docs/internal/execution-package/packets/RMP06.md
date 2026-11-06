# RMP06 — E1c complete axial and shared environmental consumption

## Purpose/status and prerequisites

**Delivered through the reviewed profile-runtime lane (merge `0910a31`); C07/C08
PASS, C05 not applicable (no cache exists).** RMP06a was accepted at `15be61b`
and the RMP06b native E1 bridge at `cfdded2` (checker `2997a35`). The lane adds
native+wasm32 dispatch of the explicit E1 profile envelope, a versioned curve
applicability contract (`points: null` with a reason plus `curveComparison`), the
reference-Mach identity point that removes the self-introduced 1-ULP coefficient
mismatch, and bounded sample collection/report retention (50 000 collected,
5 000 reported, 1 024 curve Machs; research capture unreachable through the
command). Report 3.0.0, new app archives 2.0.0, legacy output non-Euler values
bit-identical. Remaining external item: an all-stage axial source for nonzero
Re < 1000 startup (owner/source custodian plus scientific reviewer). RMP01 is the
accepted native base. RMP06a implements the direct total subsonic zero-incidence
axial diagnostic using actual E1 state, not shared flight integration. Physical
closure also depends on source qualification in RMP02/RMP08. Parent RMP06 is not
complete. See [result](../../execution-runs/RMP06-local-axial/RESULT.md) and
[component/source ledger](../../accuracy-program/diagnostics/RMP06-local-axial.md).

## Current dispatch boundary after RMP06b

The prescribed-axial native E1 bridge is now implemented and independently
accepted: [bridge result](../../execution-runs/RMP06-profile-bridge/RESULT.md).
Actual profile drives trajectory/query/curve states, profile-only burnout and
landing reads. Fractional UTC validity and launch geometric-MSL/AGL/vertical
datum semantics are frozen in INTERFACES. Native C04 passes; C07 advances to
in_progress for the prescribed-source bridge, not completion of local inherited
axial integration. C05/C08 and local-source startup/physical qualification stay
open. No product/default/cache activation.

The next native bridge described below is retained dispatch history, now done;
its remaining local-source startup composition must not be bypassed with a floor
or an automatic blend. Park that source support dependency and continue useful
RMP02 retained-source qualification /RMP03 source-schema work. No owner decision
is needed merely to begin their already-authorized bounded steps.


- Base for RMP06a was `3d9ca93`; implementation commits `a286e9d`, `36d637c`,
  correction `15be61b`; independent final high-effort read-only audit ACCEPT.
- Actual API: `axial::PreparedAxial::prepare(Geometry, Source, PowerPolicy)` and
  `.evaluate(&environment::Evaluation, PowerState)`. Every component and local
  friction surface is exposed, with one sum and no total-CD floor. Mandatory
  clean-configuration and coverage declarations; source labels are not hashes.
- Native-only strict helper/example `axial_diagnostic` uses the existing E1
  typed parser/evaluator once; no dispatch/product/project/WASM activation.
- Direct software C01/C02/C03/C06 are evidenced for this explicit inherited,
  unqualified subsonic composition. Profile flight semantics and product/default
  closure C04/C08 remain partial; C05 cache work unrun; C07 shared-consumer
  integration blocked by the missing bridge/source-support decision. Do not
  infer full parent completion from direct tests.
- Low-Re startup is a concrete source limit: zero speed is supported, nonzero
  effective Re<1000 refuses. No hidden floor, speed waiver or automatic blend.
  Lost-positive fin LE/TE arithmetic also refuses; structural zeros retained.
- RMP06b assignment (completed; retained history): repin current accepted head and lease `flight_provider.rs`, shared
  mechanical/flow boundary in `six_dof.rs`, engine native helper, focused tests
  and docs sequentially. First consume an immutable E1 profile in the existing
  candidate with its explicit prescribed source. Freeze fractional stage-time
  validity and launch geometric-MSL/AGL conversion before edits. Every stage,
  query, and curve must use that same typed state; errors retain context.
  Integrating the local inherited total source needs a separately reviewed
  all-stage startup source/support composition. No arbitrary low-Re physics.
- RMP07 exposure/migration and RMP02/RMP08 physical qualification remain separate;
  no owner input blocks useful native E1 bridge work.

## Required reading

INTERFACES and RMP01/RMP02; core environment.rs, skin_friction.rs, aero.rs drag
terms, axial.rs and flight_provider.rs; engine environment_diagnostic.rs,
friction_diagnostic.rs, axial_diagnostic.rs and native_candidate.rs; the RMP06a
ledger/result above; E1a/E1b method notes and P0.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

Lease new axial/environment-provider modules, reviewed core aero.rs/provider integration, and focused native fixtures. Existing six_dof/lib/models boundaries require coordinator ownership; no parallel edits with RMP01/RMP07. Frontend/profile application follows a separate small reviewed subcommit.

Friction-only Cd is never total CA. Total body force is assembled once. Local rho/T/mu/Mach/wind/roughness enter dependent terms; only truly Mach-only terms may use a Mach-only cache. Retaining inherited pressure/base/wave formulas is allowed only with honest source/component identities and unqualified status.

## Ordered subcommits / input-output contract

1. Inventory each current drag term: equation/units, geometry symbols, environmental/power dependencies, unvalidated constants/floors and source applicability. Deliver a component table before changing math.
2. Choose explicit total axial composition or complete supplied source at a declared condition. Record why each pressure/base/wave/protuberance term is included/absent; obtain material-model review.
3. Implement direct local-state evaluation and per-component outputs. Consume the actual E1 typed state; do not construct a second altitude atmosphere or assume a forecast profile was applied.
4. Add cache only after direct evaluation works; key every effective environmental/geometry/power dependency and record interpolation resolution/policy.
5. Wire reviewed provider into native shared flight/query/plot paths, then explicit product profile consumption only after identity handling is ready. Save effective profile/selection with run inputs.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP06-C01 — Total axial composition:** Component sum/dimensional normalization matches independent calculation; no duplicate normal/axial/wind force. Save component-source ledger and analytic fixture.
- **RMP06-C02 — Local Reynolds dependence:** At equal Mach, change pressure/viscosity/length/roughness one at a time; only intended terms respond. Save direct outputs and tests, not a claimed flight improvement.
- **RMP06-C03 — Power/nozzle separation:** Powered/coast/base/sting/nozzle convention matches the source. Missing power coverage refuses rather than reuse a coast table.
- **RMP06-C04 — Profile semantics:** Wind-from converts once; source toward-ENU stays toward; time/altitude/geometric/MSL/AGL conventions checked. Missing coverage rejects or requires an explicit identified scenario.
- **RMP06-C05 — Caching:** Direct/cache outputs and event/trajectory consequences fit declared numerical budgets; key changes for environmental/geometry/policy inputs. No stale result on source edit.
- **RMP06-C06 — Zero/invalid flow:** Zero-V coefficient/load semantics remain explicit; invalid P/T/mu/refs/roughness, low model Re or asin domain fail with source/model reason.
- **RMP06-C07 — Consumer equality:** Same prepared provider+state returns matching flight/query/curve axial data, with retained source/profile/input identities.
- **RMP06-C08 — Legacy preservation:** Old default source/output behavior and project reopening preserved; new atmosphere is never silently enabled for saved legacy runs.

## Negative/failure cases

Missing wall/transition/humidity model; unsupported roughness/temperature; abrupt power transition; source mismatch; profile gaps; malicious/misspelled units; empty arrays; valid Re but nonrepresentable scale; finite query outside source coverage.

## Commands and portable evidence

Use core/engine focused tests and integrated native checks from CHECKS. New cache/trajectory experiments must use explicitly synthetic or qualified development inputs. No blanket benchmark/validation/scoring script. App profile activation additionally needs focused TS/browser checks and intentional rebuilt-WASM identity.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

A missing physical component/data source cannot be compensated by fitting overall Cd to apogee. Park physical qualification, retain diagnostic capability and choose a justified source/composition through review.

Successor: RMP07 identity/product exposure and RMP08 relevant physical coverage; final numerical qualification RMP12.

## Ready-to-send assignment prompt

> Execute RMP06 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
