# Astraea: remaining roadmap to a scientifically qualified collegiate 1.0

Prepared 2026-10-26 against engineering source **5ea3141**, on local
`delivery/integration-20261024`. This consolidates known remaining work and its
checks; it does not reopen completed investigations, certify accuracy, authorize
publication, or promise that no further defects will be discovered. New findings
enter the same assignment/evidence process. Earlier dated plans remain evidence;
this roadmap reconciles their remaining scope with the latest checkpoints.

For actual continuation use the [detailed execution package](execution-package/START-HERE.md):
packet briefs, source contracts, acceptance register, WIP recovery and safe
check/dispatch procedures. This document remains the overall scope/dependency plan.

## 1. Target and release decisions

### Version 1 goal

**Deliver a customer-ready Astraea 1.0 for the general public, focused first on
Binghamton University's rocketry team, that enables the team to independently
design, revise and compare its rockets, obtain trustworthy flight-planning
predictions for the supported design space, understand the limits, and save,
share and reproduce its engineering work in a dependable application.**

This consolidates the existing roadmap and the [owner's quality clarification](execution-package/OWNER-1.0-RELEASE-BAR.md),
not a restart, new architecture or required two-mode implementation. The team is
an intended customer, not responsible for making an unfinished simulator reliable.
Support meaningful variations across its intended designs, not only one fitted
vehicle or the convenient subsonic cases currently covered by diagnostics. Actual
configurations/regimes must be established before claiming coverage; "whatever
rocket" is not a promise to simulate every conceivable category.

**Done means the existing primary-use G0–G8 gates are satisfied:** complete usable
design/compare/simulate/review/save-and-reproduce journeys; reviewed coherent
physics with qualified inputs and output-specific numerical/physical accuracy;
grounded, useful uncertainty; independent team/second-member reproduction; and
accepted installed artifacts/platform/update behavior for everything offered.
Core intended decisions cannot rely on an unfinished trajectory prefix, hidden
fallback or unqualified number disguised by a warning. Optional capabilities may
remain explicitly unsupported only without undermining that primary-use promise.

Use the existing18 packets/117 checks, accepted work and retained failures to
reach this goal. Accuracy budgets must be justified and frozen before scoring,
not invented here; no deadline or universal error percentage is set. Evidence
collection and product/reliability engineering proceed through their existing
parallel/dependent lanes. Missing data blocks only the affected claims, not all
independent development. Owner authorization still controls publication/deployment.

### Mission and release decisions

The target is a simulator collegiate teams can use as their **primary flight-
planning tool for explicitly demonstrated missions and outputs**. The initial
mission hypothesis is single-stage commercial-solid, passively stable collegiate
vehicles with dual-event recovery. Exact geometry, motor, Mach/Re/incidence,
weather, mass/CG and recovery coverage must come from qualified missions. We do
not redefine that target as subsonic merely because the first SB1 implementation
is restricted to Mach<0.8 and incidence<=5 degrees.

A validated operating envelope is an evidence-backed statement of the vehicles,
conditions and outputs for which error/uncertainty meet the intended decision
budgets. It is not merely the range where code returns finite numbers. Accuracy
can be qualified for one output and unknown for another. A primary trajectory
claim does not automatically qualify structural/flutter or opening-shock claims.

Three outcomes remain possible, decided from evidence:

| Outcome | Required disposition |
| --- | --- |
| Primary-use 1.0 in a demonstrated envelope | All applicable engineering, physical, team and platform gates below pass; claims identify supported outputs and limits. |
| Initially useful alongside established simulators | Reviewed imports/comparisons and useful qualified outputs, with explicit limits. This requires an explicit product-promise/version decision; it does not silently substitute for primary-use 1.0. |
| Continued 0.9 research preview | Software remains useful and honest, but critical accuracy/coverage or platform evidence is insufficient. Failed validation is preserved; numbers/gates are not weakened to obtain 1.0. |

A useful 0.9 can precede accuracy qualification. It still needs dependable data
preservation, truthful statuses, reproducible results, applicable product checks
and platform acceptance for whichever packages are offered. Publication, signing,
feed operation and deployment remain separately authorized final actions.

## 2. Verified starting point: preserve, do not redispatch

Latest engineering verification is 154 core and61 engine tests,10 independent
native friction cases and an exact serialized synthetic legacy before/after
flight comparison at5ea3141. These establish bounded implementation behavior,
not physical accuracy. Detailed [latest review](accuracy-program/diagnostics/E1b-A1d1-integration-review-2026-10-26.md)
links the evidence. Counts from older frontend/platform runs apply only to their
recorded source/artifact; they are not claimed as new checks of today's package.

Completed packets include:

- Project/motor/history and asynchronous IO preservation fixes; supported import
  handling and explicit refusal of unsupported geometry/overrides.
- Signed normal-force/first-moment assembly, calibration eligibility/provenance,
  guide-travel and geometry-only stability labels, and retained sampled-Q timing.
- Saved complete dispatch inputs and actual executed-WASM provenance. Historical
  summary-only runs remain explicitly unreconstructable. Earlier roadmap items
  asking for this archive/provenance work are superseded.
- P0 force/moment/frame contract; A1a static SB1 implementation; A1b real DTO/profile
  adapter; A1c static diagnostics; E1a environment; T1a supplied complete-static
  tables; E1b local friction; A1d-1 shared private flight driver.
- N1's bounded20-call numerical study and earlier development replays. They do
  not justify universal tolerance changes or count as unseen validation.
- Linux embedded/extracted-payload smoke and isolated AppImage packaging;
  updater check transport, lifecycle protections and signature/version-verified
  download. Actual installation/relaunch and installed-platform acceptance remain.

**Current product boundary:** the bundled production WASM still uses the legacy
model. Its recorded SHA256 is
`c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
The new model/environment/friction/table diagnostics and private driver seam
have not become the active candidate flight model. Compilation/test success
must not be presented as a shipped accuracy improvement.

## 3. Execution order and dependencies

The principal dependency chain is:

```
Mission/output budgets + input eligibility [parallel from the start]
                         |
Prepared native provider -> common flight/load/plot evaluator
                         |
Complete axial + environment + source/import support
                         |
Native/production-WASM numerical and physical development qualification
                         |
Grounded uncertainty + frozen output-specific protocol/predictions
                         |
Separately authorized unseen scoring + independent team reproduction
                         |
Claim/envelope review + exact installed release candidate -> owner release decision
```

Product migration/reliability and platform/updater work proceed in parallel.
Higher-regime/rate/recovery work is scheduled according to the actual mission
and claimed outputs; it cannot be skipped by silently weakening the envelope.
A source/table path can qualify particular regimes before a native law does,
but imported agreement never validates native coefficient generation.

### Wave A: next unblocked assignments

| Packet | Assignment | Dependencies | Owner / efficient routing |
| --- | --- | --- | --- |
| RMP01 / A1d-2 | Prepared native candidate, actual driver consumption and shared plot/load queries | Reviewed A1d design and completed seam | Engine Sol/high; independent scientific review for physical composition |
| RMP02 / D1 | Close eligibility of retained coefficient sources and select exact supported geometry | Existing source ledger; no new source-search restart | Source/data Sol/high; independent extraction/convention review |
| RMP03 / T1b | Canonical source/vendor adapters and sparse-quantity capability handling | P0/T1a | Import Sol/high; source-specific review |
| RMP04 / UP1d | Disposable real apply/relaunch fixture and channel policy | UP1a/b/c | Desktop Sol/high, isolated compute |
| RMP05 / Q0 | Complete input-only acquisition/qualification packets and mission-budget records | Existing protocol/inventory | Coordinator/data reviewer; external participation/access required for closure |

RMP01 owns shared driver/provider interfaces. RMP03 works in separate parser
modules until integration; RMP04 owns desktop/fixture files. RMP02 must not turn
uncertain drawings into exact geometry through declarations. RMP05 can prepare
requests and checklists locally; no outreach or outcome opening is authorized.

### Wave B: after the native candidate exists

RMP06 complete axial/environment consumption; RMP07 model identity/migration;
RMP08 Mach/incidence/geometry/rate coverage; RMP09 mass/guide/recovery;
RMP10 output contracts/peak resolution; RMP11 comparator normalization.
These are separate bounded packets, with shared-file integration sequential.

### Wave C: qualification and user delivery

RMP12 numerical candidate verification; RMP13 grounded uncertainty/calibration;
RMP14 frozen prospective validation; RMP15 product journeys/interoperability;
RMP16 installed-platform acceptance; RMP17 independent team reproduction;
RMP18 release reconciliation. External access/data lead times run alongside all
waves. These waves are dependency order, not calendar promises.

## 4. Detailed engineering assignments and exit checks

### RMP01 — prepare and run the candidate through the actual driver

Deliver the native experimental path specified in the
[A1d design](accuracy-program/diagnostics/A1d-provider-integration-design-2026-10-26.md):
real adapter geometry, explicit mechanical carrier and axial source, independently
assembled static wrench and an explicitly identified rate/recovery composition.
Keep old projects/default `simulate_flight` on the legacy path. A named inherited
rate model may support diagnostic trajectories with UNKNOWN dynamic qualification;
it is not equivalent to measured damping support.

**Exit checks:** one prepared evaluator supplies coefficient curves, load queries
and every flight-stage/event read; same-state results agree. C=0/nonzero moment
works without CP. Datum/CG translation and force normalization preserve physical
loads. Legacy stability and drag-table CP guards are not prerequisites. Zero-speed
flow coefficients stay nullable; nonzero-rate/zero-speed support is explicit.
Cant/unsupported geometry/domain and stale inherited drag scales are refused.
A deployed canopy deactivates the static airframe branch, uses the separately
identified canopy/rate composition and reports airframe coefficients not applicable;
recovery is not fallback for an unsupported free-flight stage.
Rail constraints and negligible force never waive SB1's domain. Unsupported
speculative stages abort with model/phase/time/reason rather than fallback.
Bounded-horizon output is incomplete/UNKNOWN, with no invented landing/apogee
completion. Legacy fixture/parity remains preserved. Separate reviewer accepts
scientific composition before candidate activation.

### RMP02 — qualify actual aerodynamic development references

Finish the existing D1 geometry/axes/reference/base-correction and digitization
ledger, including remaining axial-force/supersonic material where retained and
eligible. Resolve near-zero markers with absolute uncertainty; review source
scan resolution and independent readings. Select a genuinely matched geometry
from the existing inventory or document required model/geometry extensions.

Bounded RMP02a [eligibility checkpoint](execution-runs/RMP02-source-eligibility/RESULT.md)
now records independently reviewed explicit exclusions and a custody/paired-evidence
guard:64 retained entries,25 Python tests,zero qualified cases. C01/C05 pass for
those exclusions only; signs/datum/base worksheet and native-density source/audit,
geometry/aerodynamic and physical closure remain open.

**Exit checks:** coefficients have source/page/configuration, references, units,
axes/signs, moment datum, Mach/Re/incidence/roll/power/trip/base conventions,
geometry fidelity and extraction uncertainty. Excluded/unresolvable points stay
in the ledger. Current ARCAS lip/anchors/ordinate-ogive mismatch is resolved or
explicitly nonmatching; a tangent-ogive/plain-body substitution cannot earn a
native-model pass. Compare force and independent moment together; CP-only agreement
is insufficient. Source-dependent measurement floors govern near-zero treatment.

### RMP03 — make real imports/comparisons usable

Add reviewed source-specific normalization into the canonical table model, with
explicit quantity availability. Start with a verifiable export/source rather
than a guessed vendor schema. Add Re/roll/beta/power axes only when data supports
them. Preserve source files/rights, content identities, geometry linkage, datum
and interpolation policies. Offer drag-only or partial comparison capability
without pretending it supplies a complete load model.

**Exit checks:** header/quantity names are source-specific, units and full basis/
moment conversions verified, dimensional loads invariant under references/datum.
Missing Cm/rates remain unavailable; no moment from Cd/CP or ambiguous zero fill.
Malformed files, duplicate/unsorted coordinates, holes, mismatched geometry/power/
Re and out-of-domain requests fail clearly without replacing a valid project.
Canonical/native round trips preserve meaning. RASAero documentation establishes
CA/CN/CL/Cd plotting/export capability, but an actual full moment export remains
unverified. RocketPy `cn` is a yaw moment, not RASAero normal force CN. Rectangular
software coverage is not measured transonic qualification.

### RMP04 — complete update application and channel behavior

Use disposable known-version executable/package fixtures to exercise actual
consent, verification, apply, executable replacement, process exit and independently
observed relaunched version. Implement/review stable/preview eligibility, downgrade
and incompatible-version behavior. Keep test keys/endpoints isolated from production.

**Exit checks:** defer performs no install; valid update reaches the new executable;
wrong signature/tampering/version mismatch is rejected before apply. Interrupted
transfer/apply, permission failure, double action, restart failure and restart-only
retry preserve a usable installation and correct UI state. Recovery after interruption
is demonstrated according to supported platform guarantees; do not promise atomic
rollback where unsupported. Independent version/process evidence establishes relaunch.
A transport Finished event does not establish signature verification or installation.
No cross-channel leakage, silent downgrade or unauthorized production feed/key change.

### RMP06 — compose complete axial forces and consume the environment

Combine friction with separately identified pressure/base/wave/protuberance terms
or a qualified supplied source. Review inherited empirical constants, powered/coast
and nozzle assumptions separately. Feed the same explicit environment to trajectory,
aero/plots, calibration and saved-run reproduction; make any standard/profile fallback
an explicit identified choice. Record local surface lengths/roughness and weather
assumptions rather than inferring them from Mach alone.

**Exit checks:** friction-only Cd is never total CA. Total body components are not
augmented again with wind drag. Same Mach/different atmosphere changes intended
local-Re terms while isolated pressure terms remain controlled. Powered/coast and
base conventions match data. Wind-from converts once to toward-ENU; geometric/
MSL/AGL/geopotential units/datum/time are explicit, and unsupported coverage stops
or requires an explicit declared scenario. Direct versus cached evaluation and
interpolation errors satisfy allocated budgets; caches include environmental inputs
for all terms that depend on them. Humidity, wall temperature, transition and missing
weather physics stay identified until evidence supports their treatment.

### RMP07 — model identity, migration, calibration and app exposure

Create versioned content identities for the effective model/composition, geometry,
source tables, environment, numerical policies and actual executable. Wire reviewed
provider selection consistently across commands, plots, ensembles, saved projects,
comparison and results. Migrate explicitly while retaining original runs/inputs.

**Exit checks:** missing provider in old documents means legacy; open/save never
activates a candidate. Changed effective geometry/data/environment/policy invalidates
relevant caches/results. Existing saved-input/WASM provenance is extended, not
reimplemented. Old calibration remains historical/inactive/stale for another provider;
no automatic multiplier transfer. Save/reopen, undo/redo, two-tab conflicts, pending
workers and failed migration preserve the document. Displayed status distinguishes
computational support, source applicability and empirical qualification by quantity.
Rebuild exact WASM/native assets and verify the invoked buffer/model identities before
claiming new behavior is in the app. Experimental opt-in selection may precede
empirical qualification, retaining UNKNOWN/unqualified status. Making a candidate
the default requires applicable RMP08–14 qualification plus release review; RMP07
implementation alone authorizes no default switch or primary-use claim.

### RMP08 — extend the physical regime and geometry actually needed

Use qualified development CN/CA/Cm data to select small/finite-incidence and
transonic/supersonic laws, or a configuration-specific supplied-data route. Resolve
fin/body interference, pressure station changes, roll dependence, multiple fin sets,
actual profiles and rate derivatives where mission coverage needs them. Targeted
CFD is an option for disputed coefficients after geometry/mesh/boundary/convergence
review; it is not automatic flight truth or a replacement for missing input records.

**Exit checks:** full force/moment trends and uncertainty agree within predeclared
development budgets over supported conditions. Blends cannot hide discontinuities
or bridge unsupported empirical gaps. Finite CP is never required for valid moments;
missing rate information never becomes zero damping. Unsupported geometry remains
refused with preserved project data. New physical equations have source/transcription,
unit/sign, limiting-case, numerical and independent scientific review evidence.
No shrinking to convenient missions, tuning solely to apogee or undocumented special
cases. A later default switch is separately reviewed after applicable qualification.

### RMP09 — mass, propulsion, guide release and recovery

Audit measured dry/all-up/burn-state mass/CG/inertia, motor mounting/depletion and
thrust/time/pressure conditions. Implement or qualify effective rotational guide
release using actual button/guide travel, thrust-rise and launch-angle contracts.
For recovery, represent actual events/delays, CdA, suspended masses, independent
sections and terrain/datum where claimed. Review changing inertia/attitude dynamics
as required, rather than fitting ballast to compensate for aerodynamic errors.

**Exit checks:** units, frame/inertia order, mass/CG bounds and conservation/limiting
cases pass. Ignition/liftoff/burnout clocks and motor uncertainty are traceable. A
motor mount or internal component cannot silently become outer airframe geometry.
Guide event matches the applicable decision and measured observation, not only final
button departure. Recovery event ordering, delayed/failed deployment and section
mass/CdA/energy are explicit. Separate steady descent from inflation/opening shock;
unsupported opening loads remain unavailable. Through-burnout and recovery comparisons
use eligible measurements and budgets. No competition threshold is relaxed for a demo.

### RMP10 — finish decision-relevant output contracts

Produce authoritative powered-flight CG/CP/margin history with definitions and
qualification. Resolve peak dynamic-pressure/aero-load/structural-output timing,
bandwidth and numerical resolution. Align event/readout/rule logic with the declared
mission. Structural/flutter approximations need material/joint/geometry evidence
before they support structural decisions; optional engineering estimates can remain
explicitly unqualified outside the primary trajectory claim.

**Exit checks:** geometry-only stability is not relabeled powered/dynamic stability.
Derivative CP, finite-force equivalent station and restoring derivative are distinct.
Sampled max-Q remains labeled sampled until a qualified peak method is implemented.
Independent numerical peak/event checks meet their own budgets. Per-section recovery
energy and guide speed use the correct event/mass. Rules are versioned and source-
linked; pass/fail vehicle constraints are separate from prediction accuracy. UI/export
precision does not imply measurement precision or universal compliance.

### RMP11 — matched-input established-simulator comparisons

Build reproducible adapters against pinned, lawfully available simulator versions.
Use RocketPy as a controlled dynamics/comparison route and OpenRocket/RASAero as
supported coefficient/design references where their actual APIs/exports permit.
Record equivalent mechanics, motor/thrust, wind, atmosphere, references and recovery.
Start from a common supplied-aero case to separate dynamics from native-aero differences.

**Exit checks:** explicit frame/quantity conversions, exact settings/version/source
identities and output/event definitions. Compare time histories/events/loads as well
as apogee. Explain unresolved differences and unsupported outputs; another simulator's
agreement does not validate either one against reality. No undocumented feature is
assumed present in a pinned release; external executable/OS/license access is a real
dependency. No paid services/installations are authorized by listing this assignment.

### RMP12 — verify the new numerical implementation

Retain N1 and legacy parity results. Run new studies only for changed models,
regimes or unresolved numerical questions: adaptive state tolerances, outer macro
steps, event roots, geometry/table interpolation and peak extraction. Test the
production WASM that users actually execute, alongside native verification.

**Exit checks:** demonstrated numerical errors fit allocated output budgets and are
smaller than decision-relevant physical/input uncertainty. Default/refined results
and failed/unsupported runs are retained. Native/WASM agree under declared precision
and runtime identities; deterministic seeds/chunk partition/cancellation preserve
semantics. Rejected speculative stages are checked rather than bypassed. A finer
macro step is not called adaptive convergence, sampled peaks are not continuous
bounds, and agreement with an oracle is not empirical accuracy.

### RMP13 — grounded uncertainty and scoped calibration

Closure requires qualified RMP05 input ranges, relevant RMP02/RMP08–09 physical
development evidence and RMP12 numerical evidence. Development of the machinery
can begin earlier; final uncertainty cannot be declared qualified before these inputs.

Represent measurement-supported mass/CG/motor/surface/environment/recovery input
uncertainties and correlations. Estimate model discrepancy on development data only,
by output/regime, and retain numerical uncertainty separately. Implement only
identifiable, regime-scoped corrections with physically eligible observations.

**Exit checks:** uncertainty distributions have sources, not arbitrary +/-1% probes.
Parameter confounding is diagnosed; a coast Cd fit does not repair powered-flight
bias by declaration. Calibration is bound to model/geometry/environment/selection/
filter/event support and becomes stale appropriately. Posterior/in-sample fit is
not validation. Prediction interval/footprint width and coverage are jointly useful;
failed runs and unsupported domains stay visible. Ensemble tails/containment are not
claimed from an input-only covariance ellipse or too few dependent examples.

## 5. External evidence, product and release assignments

### RMP05 / Q0 — establish eligible missions and decision budgets

Prepare an input-only package for each pilot: as-flown dimensions/profiles/features,
masses/CG/inertia with methods/errors, propulsion records, guide/button geometry,
weather metadata/quality, actual recovery configuration/section masses, sensor
calibration/clock/datum/bandwidth, rights and configuration linkage. Classify source
facts versus reconstructions. Keep protected outcomes with an independent custodian.
Existing public inventory can be screened; do not reopen completed broad searches.
Team outreach, platform access, spending and new outcome exposure require their
existing separate authorization, not an autonomous assumption.

For each decision record output, units/event/datum, applicable rule/constraint,
usable reserve, smallest useful design difference, input and observation uncertainty,
maximum useful interval width and tolerable decision error. Agree required vehicle/
source/regime breadth and statistical confidence before outcomes are inspected.
The [mission matrix](accuracy-program/collegiate-mission-and-decision-matrix.md)
and [proposed accuracy specification](accuracy-program/collegiate-accuracy-spec-proposed.md)
are inputs to this decision, not already approved percentage targets.

**Exit checks:** eligibility/source rights independently reviewed; missing/contradictory
inputs prevent promotion; budget and scoring decisions are recorded with responsible
team/owner agreement. A public repository is not proof of as-flown fidelity or rights.
Sensor-derived velocity and altitude do not count as independent evidence when they
share reconstruction errors. Developer-examined flights stay development data.

### RMP14 / Q1 — freeze, predict, then independently score

Closure depends on RMP05 eligibility/budgets and final, frozen applicable RMP07–13
model/input/numerical/uncertainty artifacts. Scoring cannot finish concurrently
with changing the model or selecting its final uncertainty from scored outcomes.

Freeze final model/source/WASM, inputs, settings, supported domain, uncertainty,
cohort/splits/dependencies, metrics/budgets, exclusions and failed/unscorable rules.
Commit prediction identities before separately authorized outcome release. Score
all preregistered cases through a controlled process; do not retune against scored
outcomes and reuse them as blind evidence for the changed model.

**Exit checks:** per-flight signed/absolute residuals, timing and unit-specific errors;
vehicle/source/regime aggregation and dependency-aware statistical uncertainty;
interval/region coverage plus useful width/area and decision consequences. Failures,
unsupported and unscorable cases stay in the ledger. Event clocks are not shifted
to align apogee. No model/input selection based on holdout performance. Failed prior
Mini DX3 evidence remains failed; exposed four-flight work does not count as new
independent validation. The historical six-vehicle/10%/5%/80% proposal is not a
comprehensive accepted collegiate gate. Final targets come from RMP05 before scoring.

### RMP15 — product journeys, preservation and interoperability

Extend already working archives/provenance and preservation to new model/import/
environment paths. Run actual user journeys: build/import, edit/undo, select model,
run/ensemble/cancel, compare variants, save/reopen/share/export and inspect limits.
Use intended desktop sizes, accessibility/keyboard/error recovery and representative
supported vendor/telemetry files. Review dependency/licensing and untrusted file/native
permission boundaries as release checks; these are audit assignments, not assertions
of newly found vulnerabilities.

**Exit checks:** no data loss/stale results across malformed imports, unavailable
services, failed saves, concurrent tabs, pending workers and migration failures.
Explicit geometry/material/override limitations prevent lossy import/export. Real
telemetry units/time/datum handling is tested with permitted files; simulated
telemetry remains distinct. Offline workflows and application errors are actionable.
Saved/exported results expose effective model/environment/inputs and qualification.
Default examples with failing landing-energy/low-TWR gates are visibly explained or
replaced by defensible examples, never made green by relaxing rules. Browser suites
run against the exact new built site; engine coverage does not equal native Safari,
Windows Edge or intended mobile/workstation acceptance.

### RMP16 — real installed-platform acceptance

Use preserved startup records/instrumentation to diagnose the actual Windows failure.
Build and test exact supported Windows/macOS/Linux installation artifacts on those
systems, including architectures promised by the release. Linux headless/extracted
smoke already exists and is not repeated without a changed source/artifact concern.

**Exit checks:** fresh install/upgrade, offline launch, native open/save dialogs,
project permission failures/migration/recovery, real updater/relaunch, logs/error
handling, uninstall/data behavior, GPU/context loss and renderer fallback. Actual
Mac/Safari and Windows/Edge/native workflows have their own evidence; WebKit/Linux
is not a substitute. Signing/notarization/package metadata and private fixtures are
verified at applicable stages. Missing OS/hardware/credentials is a recorded external
blocker, not a stronger-model reasoning task or a successful build claim.

### RMP17 — independent team-led reproduction

A collegiate team member reconstructs a qualified case from the supplied input
package, checks sources, runs/imports comparisons, interprets uncertainty, saves/
reopens and exports a useful planning record. A second member reproduces the result
without the original developer repairing the session in the background.

**Exit checks:** reproducible inputs/artifacts/identities, understandable domain/error
messages, correct decision interpretation and useful workflow. Numerical matching
without usable interpretation is insufficient. Findings become ordinary engineering
packets; team/platform/data access must be actually available and authorized.

### RMP18 — release candidate, supported claims and final decision

Reconcile source and built assets after engineering/scientific/platform reviews.
Prepare version/channel policy, support/compatibility matrix, known limits, evidence
record, reproducible examples, migration/recovery instructions and release notes.
Inventory dependency/data redistribution rights, artifact hashes and applicable
signing/notarization/feed requirements. Production secrets stay outside artifacts/logs.

**Exit checks:** exact candidate WASM/site/native packages match verified source;
all mandatory selected-output/mission/product/platform gates are passing or the
product promise explicitly limits the unsupported capability. No unresolved critical
correctness/data-loss/install/update defect is hidden. Separate computational and
empirical statuses; no broad validated badge from one passing output. Owner reviews
primary-versus-companion feasibility and precise supported envelope. Push/main merge,
public publication/deployment/production signing/feed changes are separately
approved final actions; drafting this roadmap grants none of them.

## 6. Release gate checklist

| Gate | 0.9 preview | Primary collegiate 1.0 |
| --- | --- | --- |
| G0 reproducibility/preservation | Required for offered workflows | Required including final providers/imports/migrations |
| G1 coherent implementation | Supported paths and honest experimental labels | Reviewed common flight/plot/load model and actual invoked artifacts |
| G2 numerical evidence | Regression/targeted verification | Output/regime-specific candidate numerical budgets demonstrated |
| G3 physical development evidence | Disclosed as provisional | Matched geometry/conditions/forces/moments and dynamics as claims require |
| G4 prospective flight qualification | No independent-accuracy promise | Eligible frozen predictions and independently scored evidence meeting preregistered budgets |
| G5 uncertainty/useful decisions | Scenario labels do not imply probability calibration | Grounded uncertainty, useful interval widths, dependencies and decision reliability |
| G6 team usability | Preview workflow checks | Independent team/second-member reproduction for the intended tasks |
| G7 supported platforms/update | Acceptance for platforms actually offered | Exact installed release-candidate acceptance and update/recovery behavior |
| G8 release authorization | Required for publication/deployment | Required after engineering/evidence/claim reconciliation |

The companion [remaining-work tracker](roadmap-to-collegiate-1.0-tracker-2026-10-26.json)
records packet dependencies and readiness. It is a planning/evidence tracker;
creating it does not configure new CI jobs or automatically approve a release.

An output gate may be UNKNOWN, but a primary claim relying on it cannot pass.
Unrelated optional features may remain experimental if that does not contradict
the agreed product promise. No aggregate percentage-complete substitutes for gates.

## 7. Checks built into every assignment

1. **Before dispatch:** pin base; inspect active runs/dirty state; name one owner and
   exact files, dependencies, scientific question, deliverable, limits and resource
   budget. Preserve user work. Use separate worktrees for concurrent edits.
2. **Author evidence:** source/assumption ledger, meaningful unit/boundary/integration
   checks, failed-attempt records and exact source/input/binary hashes. Select tests
   for changed behavior; do not rerun entire completed studies out of habit.
3. **Review:** coordinator reviews implementation and consequence; an independent
   scientific reviewer checks material physical model choices/signs/references/
   applicability. A reviewer cannot replace missing observations with confidence.
4. **Integrate:** sequential shared evaluator/DTO/schema changes; relevant native,
   frontend/WASM and platform checks against the exact resulting artifact. Preserve
   old input/result identities and note any behavior change.
5. **Decide:** accept the bounded packet, request a focused correction, escalate a
   precise reasoning issue, or park an external blocker. A packet marked COMPLETE
   is not a release/scientific gate marked PASS.
6. **Checkpoint:** update TASKS/latest RUN, source/evidence/next actions, active-run
   status and any exact usage-limit failure/reset actually supplied. Never infer
   quota/reset from time. Resume unfinished work; do not duplicate agents or create
   repeated no-progress updates for unchanged external blockers.

Task completion record: ID, owner/model/effort, pinned base, code/artifact hashes,
changed behavior, command/results, review disposition, limitations, successor and
released resources. Evidence artifacts stay durable and discoverable.

### Required check triggers

This is the check policy for subsequent packets, not a claim that new CI jobs
were configured by writing the roadmap. Each packet records how its checks run
locally and which are required in CI before that change can reach a release.

| Changed area | Required verification | What it blocks |
| --- | --- | --- |
| Physical equations/provider composition | Units/signs/limiting cases, support/failure cases, independent scientific review, numerical/source comparisons and measured development evidence appropriate to the claim | New model acceptance; unsupported or unqualified physics cannot earn a primary-use claim |
| Driver/integrator/events/peak extraction | Relevant analytic/reference fixtures, all stage/root/rejected-step error paths, old default preservation, changed-model numerical budgets and native/production-WASM parity | Runtime integration and final numerical gate |
| Inputs/model identity/project migration/calibration | Exact effective-input/engine identity, stale-cache/calibration invalidation, old-document and save/reopen/undo/concurrency/malformed-file preservation | App exposure and final reproducibility gate |
| UI/worker/import/export workflows | Type/build checks, focused behavioral tests and actual built-browser journeys with worker/cancellation/error paths; exact new WASM consumption | Offering the changed workflow |
| Desktop/update/package changes | Default build boundaries, actual native fixture, signature/version/channel rejection, interrupted apply/relaunch and supported installed-OS acceptance | Offering the changed installer/update path |
| Scientific datasets/protocols | Rights/configuration/input/observation eligibility, independent convention/uncertainty review, custody/split/prediction hashes and explicit authorization before unseen outcomes | Promotion to qualification evidence and prospective scoring |
| Final release candidate | Exact source/assets/packages/signatures, selected G0–G8 evidence, public claim/limitations review and owner authorization | Push/merge/publication/deployment/production operations |

A passing check of unchanged code is retained with its source identity. A changed
artifact gets the affected checks; whole suites/studies are repeated only when
changed behavior, failures or unresolved concerns justify them. Failed checks
remain visible; numerical assertions and vehicle constraints are not weakened.

## 8. Delegation, quota and schedule control

Use the current [model routing](session-handoff/coordination/MODELS.md): Luna/medium for
bounded inventories where available, Sol/medium for ordinary isolated changes,
Sol/high for numerical/cross-file integration, Astra/high selectively for difficult
scientific decisions or independent material-model review. Reuse suitable agents;
transfer evidence on escalation. Do not fill every slot simply because it exists.
Current host has2CPU/8GiB: at most two compute-heavy jobs within the measured memory
budget, with lighter independent review/design work alongside. Re-measure on a new
host. Paid capacity, external service access and production operations are not
assumed or provisioned.

Recommended start: RMP01+A1d-2 engineering, RMP02 source qualification and RMP04 updater
fixture as bounded lanes; RMP03 parsers can proceed in separate files as capacity
permits. Prepare RMP05 input/budget records concurrently, but park its external
closure honestly. Integrate shared interfaces sequentially. Expand only when a
finished packet releases capacity and a dependent decision is concrete.

No defensible final1.0 date is established yet. Eligibility and source coverage,
measured data/platform/team access and prospective scoring can dominate elapsed
time; more agents cannot remove them. Estimate each newly scoped packet after its
input/access check, record actual duration/rework, and update forecast ranges after
Wave A. Keep separate forecasts for locally achievable engineering, external evidence
availability and release authorization. Do not add the elapsed durations of parallel
lanes or promise accuracy by a coding deadline.

## 9. Reference and review record

Source-of-truth coordination: [TASKS](session-handoff/coordination/TASKS.md),
[latest engineering checkpoint](session-handoff/coordination/RUN-20261026-FRICTION-PROVIDER.md),
[concrete six-route accuracy plan](accuracy-program/accuracy-execution-plan-2026-10-25.md),
[A1d implementation sequence](accuracy-program/diagnostics/A1d-provider-integration-design-2026-10-26.md),
[reference eligibility decision](accuracy-program/diagnostics/A1b-reference-eligibility-2026-10-26.md),
[updater verification boundary](delivery-review-2026-10-26-updater-download-verification.md).

A separate Sol/medium read-only reviewer reconciled known remaining product/platform/
release gaps, then reviewed the full draft. No blocking contradiction or broken link
was found. The final draft applies three review refinements: explicit recovery-branch
semantics, experimental-selection versus default-switch dependencies, and the numerical/
physical/input evidence required before uncertainty closure and frozen scoring.
No new source search, physical simulation, protected outcome, platform build,
production operation or release action was performed to prepare this document.
