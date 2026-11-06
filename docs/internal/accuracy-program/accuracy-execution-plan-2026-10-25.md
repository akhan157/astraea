# Execution path to a qualified collegiate simulator

Execution follow-up: [first bounded batch](first-batch-2026-10-26/README.md).
The plan below remains the dated method/dependency proposal; completed packet
results and outstanding limitations are recorded in that follow-up.

2026-10-25. Research baseline `761d6c3`; production engine SHA-256
`c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
This is an implementation and evidence plan, not an accuracy qualification.
Existing engineering fixes remain complete. No new protected flight outcomes
were inspected, and no new physical model was shipped in preparing this plan.

## Recommended direction and what success means

Retain the Rust/WASM trajectory engine and make its aerodynamic evaluator
coherent, versioned and shared by flight and plots. Support both independently
implemented published engineering methods and configuration-specific supplied
coefficients. Use established simulators as controlled comparators. Obtain
measured as-flown inputs and independently held-out full-scale flights to decide
which outputs and mission families can support primary planning.

The intended first family remains single-stage commercial-solid collegiate
vehicles with passive stability and dual-event recovery. Include the actual
transonic/supersonic regimes of the selected missions; do not redefine collegiate
use as subsonic to get a passing result. Staging, active control and SRAD
propulsion are separate expansions. A qualified operating envelope is the
intersection of supported geometry, Mach/Re/incidence/rate/environment/mass and
recovery conditions **and the particular outputs and decisions tested**. It is
not merely a maximum altitude, Mach number or green runtime-validity flag.

Primary use is feasible as an engineering objective, but is not established by
the current evidence. An interim alongside-simulator workflow can ship useful
comparison/import functionality while unresolved outputs remain identified.
That changes the interim product scope; it does not lower the primary-use gate.

## Alternatives investigated and the decision

The [full six-route comparison](execution-2026-10-25/alternative-paths.md)
checks actual release APIs, licenses, dependencies and export behavior, rather
than assuming another engine is a drop-in accuracy upgrade.

| Route | Decision now | Discriminating next experiment |
|---|---|---|
| Native engineering repair | Preferred general design path; best fit with current shared browser/desktop/offline runtime | Reviewed total-force/datum-moment boundary and one measured coefficient slice |
| Native + supplied aero | Preferred complementary path for configuration-specific regimes | Synthetic pure couple plus NASA CN/Cm fixture; one actual source export with conventions/domain checks |
| Replace with RocketPy | Strongest replacement candidate, retain as comparator first | Pinned 1.13.0 common-input adapter; measure output/event parity and runtime burden before committing to replacement |
| Replace with OpenRocket | Prefer separate coefficient/comparator tool; production adoption requires explicit GPL distribution choice | Stable 24.12 Java grid extractor and coordinate/reference checks; do not assume live lookup-table docs describe that release |
| Targeted CFD | Conditional source of coefficient tables, after an unresolved decision-sensitive gap is identified | Matched public geometry, three meshes and declared sentinel conditions/model sensitivities; experimental comparison before new geometry claims |
| Empirical/greybox correction | Per-vehicle supplement after physical/input defects are addressed | Parameter identifiability and independent repeat-flight prediction; apogee-only fitting cannot identify thrust/mass/drag |

RASAero's documented AeroPlots export includes visible CN/CA/CL and powered/off
drag columns; an independent Cm export remains unverified. OpenRocket's stable
API exposes moments, but its component static moments derive from CN/CP; that
does not make them independent measurements. RocketPy accepts supplied drag and
generic force/moment functions, with a z-forward frame and coefficient names
that differ from ours. Adapters must transform actual definitions, prevent
double counting and reject uncovered domains. No actual vendor CSV or alternate
engine runtime was executed in this investigation.

The engineering estimates in the comparison put a first native/table experiment
around 1–2 focused engineer-weeks, versus several days for a narrow comparator
adapter spike and multiple weeks for production integration. A bounded native
provider plus input/qualification harness is estimated at 6–12+ engineer-weeks;
that is **not elapsed release time**, does not include unknown acquisition/review
latency and is not measured agent throughput. Do not add overlapping estimates.
Re-estimate after the first accepted packet. Broader claims and specialized
instrumentation may require substantially more work.

Native plus tables wins on current integration evidence, not on a demonstrated
accuracy percentage. Reconsider RocketPy production adoption if its bounded
adapter proves materially lower total implementation/qualification burden while
preserving required offline/browser workflows and output contracts. No engine
choice removes the independent-flight evidence requirement.

## What the completed investigation actually establishes

1. Current loads combine wind-axis drag with an added transverse normal term.
   In the inspected pitch-plane small-angle limit, total body-normal slope is
   `CNa_input + CD_table`. The CP arm is then used for that transverse load.
   Published body-normal coefficients and independent moments cannot be compared
   directly to that input. Fix definitions before selecting a Mach correction.
2. Flight and plot Mach-dependent normal-force/CP paths disagree. Replace a
   consistent force-and-moment pair, not a displayed CP scalar. Zero resultant
   normal force may coexist with a finite couple; CP need not exist.
3. The drag tables contain 25 Mach samples evaluated at fixed sea-level Reynolds
   assumptions and 5 micrometre roughness. Updating flight density does not
   update skin friction. Powered base drag, omitted protrusions, mass/inertia,
   atmosphere and recovery assumptions are separate sources of discrepancy.
4. Exactly 20 frozen-production development calls reproduced four baselines,
   refined the outer step and perturbed four inputs on two vehicles. The largest
   apogee change from outer-step refinement was about 0.021 m. This is **not**
   adaptive-tolerance convergence. One-percent impulse/Cd perturbations caused
   metre-scale responses; they are sensitivity probes, not measured uncertainty.
5. Cosmic's altitude error is already +32.548 m at the metadata-identified
   observed burnout under the existing source-clock convention; this is not
   independently synchronized ignition truth. Fitting coast drag alone cannot explain the entire launch
   prediction error. No single cause was identified by those probes.
6. Public NASA coefficients are usable development data. An actual collegiate
   archive with design objects and flight-file metadata exists, but as-flown
   linkage, rights, weather and observation quality remain unqualified. No blind
   collegiate cohort is ready merely because the files are public.

Exact derivations, code locations and alternatives are in [model analysis](execution-2026-10-25/model-path.md),
[data acquisition](execution-2026-10-25/data-path.md) and
[the measured diagnostic report](diagnostics/2026-10-25-accuracy-execution.md).

## How we turn “accurate enough” into a frozen test

Use the existing [mission/decision matrix](collegiate-mission-and-decision-matrix.md)
and [proposed specification](collegiate-accuracy-spec-proposed.md). Neither the
competition vehicle limits nor another simulator's published mean error defines
our error allowance. For each real pilot mission, freeze the following before
new outcomes are released:

- Decision and constraint, units/datum/event definition, intended alternatives,
  applicable rule revision, usable reserve and minimum useful design difference.
- Maximum useful predictive interval width, permitted decision error/risk,
  observation uncertainty, input uncertainty/dependencies and model domain.
- Bias, absolute residual, timing, coverage and failed/unscorable-run rules;
  vehicle/source weighting, cohort strata and statistical acceptance procedure.
- Family of output/regime claims, multiple-comparison and interim-look policy,
  and cohort reuse rules. One output pass cannot qualify all outputs.

For a conservative deterministic budget, subtract bounded input contributions
and observation error from the usable reserve, and allocate the remainder to
model discrepancy and numerics. If the remainder is nonpositive, improve inputs
or leave the decision unresolved. With justified distributions, propagate the
joint model, including correlations and bias, instead of automatically adding
standard deviations in quadrature. For design ranking, evaluate the uncertainty
of the **difference**, including common-input correlation, separately from the
absolute-altitude error. A wide interval that trivially covers observations is
not useful qualification. Input contributions must be propagated output bounds
over the stated joint input set, not extrapolations of the one-sided +1% probes.
Observation uncertainty limits score resolution; it is not physical trajectory
variability and must not be counted twice in the predictive distribution.

Example only: a hypothetical 150 m usable altitude reserve, with conservative
input and observation allocations of 60 m and 10 m, leaves 80 m for model plus
numerical error. Choosing a 5 m numerical allocation leaves 75 m for discrepancy.
These numbers are not a proposed universal tolerance, actual team requirements
or a permission to substitute budgets after seeing outcomes. The packet must
fail to enter scoring until the actual values and their rationale are supplied.

The [pilot freeze template](execution-2026-10-25/pilot-freeze-template.json)
lists the exact records and hashes to fill. It is deliberately incomplete and
cannot authorize scoring or outcome access.

The historical six-vehicle/two-source, ±10% median/±5% bias/80% interval proposal
is preserved as history, not promoted to a comprehensive primary-use gate.
Even six independent successes give only a 0.607 one-sided 95% exact lower bound
on a common success probability. Repeated flights of one vehicle are not six
independent vehicle families. [Reproducible illustrative sample design](execution-2026-10-25/sample-design.py)
shows the assumptions and why a small pilot cannot prove a fleet-wide guarantee.
It is not a requirement for 82 flights. Choose the actual sample design after
decision risk, strata and clustering are defined; combine mechanistic evidence,
component measurements and a scoped flight cohort to use data efficiently.

## Executable work packets

Each packet starts at the current reconciled integration head in an isolated
worktree, owns named files, records source/input hashes and returns a bounded
reviewable commit. The coordinator reviews and redispatches routine follow-ups.
Material physics changes need independent mechanics/method and implementation
review. No packet passes because it improves the four exposed apogees.

Preserve the original engine/model identity for old projects and saved inputs.
No old drag multiplier automatically migrates into a new physical model. A
coast-derived correction must carry vehicle, model, regime, estimator and data
provenance, and apply only to its qualified regime; it does not identify powered
base drag. The completed event-qualified fit is retained, not treated as a new
global calibration authorization.

| ID / owner | Concrete work and entry conditions | Exit evidence / stop condition |
|---|---|---|
| P0 / coordinator + aero reviewer | Freeze total body force, independent datum moment, +Y-forward frames, angle/rate/reference definitions, migration and domain-status contracts | Signed derivation; exact force rotations and datum/CG translation; zero-normal finite-couple case. No code selection before review |
| N1 / numerical engineer | Diagnostic-only tolerance seam; first reproduce frozen WASM loads/states, then four exposed flights at tolerance scales 1,.1,.01 with fixed .01 macro step (12 calls); separate event-tolerance refinement (8 calls). Add ballistic, constrained rail, rigid rotation and damped analytic cases | Report ordinary/event contributions, nonmonotonicity, state/event/peak changes and computational cost against allocated numerical budgets. Missing baseline parity stops the experiment; no shipped tolerance change by implication |
| D1 / data engineer + independent extractor | Acquire hashed D-4013/D-4014 PDFs; reconstruct exact short/long geometry; independently extract a predeclared CN/Cm/CA subset with conditions, base corrections, datum and digitization bounds | Machine-readable coefficient packet, two extraction records, differences resolved from source. Existing CP-only digitization is insufficient; do not label estimated components measured |
| A1 / aero engineer | After P0 and provisional published equation/domain baseline review, implement complete small-incidence component force/moment sums and one evaluator used by plots, diagnostics and flight; keep legacy model identity | Equation-to-function traceability; matched-state Rust/WASM results, signed cancellation and CG identities; frozen-input before/after development report; independent review |
| E1 / environment engineer | Immutable pad P/T + profile provider, explicit station/geopotential/AGL/MSL and wind-from conversion; local Re/viscosity/roughness in friction; cache only genuinely Mach-only terms | Hydrostatic/layer/wind cardinal tests, source units/QC and profile provenance; direct-versus-cached interpolation error. No claim that nearby sounding equals launch wind |
| A2 / aero engineer | D1+A1: select/review subsonic and supersonic methods, paired CN and moment, finite-incidence assumptions; expose component drag and remove implicit ARCAS geometry special handling | Matched force/moment residuals with extraction uncertainty and decision propagation; documented failures/domain limits. Transonic interpolation alone cannot pass |
| T1 / table/import engineer | P0: explicit coefficient schema with S/L/datum, signs, Mach/Re/incidence/roll/rates/power axes, source/geometry hashes and interpolation limits. Import only quantities actually exported | Reference transforms/dimensional consistency, coverage checks and no silent extrapolation; sparse CD(M) remains drag-only. Cannot invent moment/damping from an altitude trace |
| M1 / dynamics engineer | Measured/component dry mass, CG, inertia and motor depletion provenance; review variable-mass angular momentum and damping. Audit first rotational freedom vs final guide departure | Parallel-axis/known-torque/torque-free checks plus qualified measurements for each claimed flight quantity. Unknown tip-off, friction or damping stays unknown |
| R1 / recovery engineer | Explicit main/drogue roles, separately descending sections/masses, trigger delays, measured steady CdA and terrain assumptions | Independent descent intervals/flights and uncertainty; trigger/landing semantics. Inflation/opening loads require their own measured model and remain excluded until qualified |
| C1 / comparator engineer | Pin stable RocketPy/OpenRocket versions and source/license; synthetic cases first, then sanitized development inputs; same supplied aero/environment/mass/event settings before native-aero comparisons | Input-normalization ledger and explainable trajectory/event residuals. Cross-code agreement is numerical evidence, not aero truth; no vendor runtime access assumed |
| U1 / uncertainty engineer | Qualified input ranges and correlations, numerical convergence, component discrepancy and calibration scope; failed ensemble runs retained | Predictive intervals with bounded useful width, bias and regime/source dependence; sensitivity screening before costly sampling. Arbitrary ±1% perturbations cannot become distributions |
| Q0 / independent custodian + team | Qualify input-only archived/pilot cases and observation schemas outside developer outcome access; freeze cohort, budgets, rights and exposure ledger | Complete eligibility manifest and sanitized inputs. Missing as-flown linkage/uncertainty blocks affected outputs, not silently repaired by outcome fitting |
| Q1 / coordinator + independent scorer | Accepted model/input/uncertainty hashes, preregistered scores and sealed prediction artifacts; only then release authorized holdout outcomes | Whole-cohort results, all exclusions/failures, source/vehicle stratification, decision consequences, reproducibility by a second team member. Tuning consumes that cohort for the revised model |

N1 freezes ordinary and event-integration tolerances separately; event probes
use 1e-6/1e-7 s at the tight integration setting. Reuse compatible baseline runs
for parity and count all actual calls. Constant-rate zero-torque analytic cases
use spherical inertia or principal-axis rotation; arbitrary asymmetric free
rotation is not constant-rate. Four exposed cases cannot prove a universal bound.

P0, N1, D1, E1 design, T1 schema and Q0 request preparation can run independently.
A1 follows P0; A2 follows A1+D1; M1/R1 can develop independently but integrate
through the agreed contracts. U1 requires the relevant component/input evidence;
Q1 requires all packets needed for the claimed decisions. Before code dispatch the coordinator assigns exclusive files: A1 owns evaluator/
loads integration; E1 owns environment/friction modules; T1 owns import/schema
adapters. Shared DTO/loads edits land sequentially through A1, with pinned merge
heads and affected checks. Parallel design does not authorize conflicting edits.
Primary release also
requires actual platform and team workflow acceptance, not just physics passes.

First implementation batch: P0+N1+D1 with a bounded E1/T1 design lane. Do not
launch all physical rewrites concurrently before the common contract is settled.
Second batch: A1+E1+T1, then review before A2/M1/R1. Start custodian/team acquisition
in parallel once contact/access is authorized; its latency may dominate the
calendar. These are successor assignments, not a claim they are already running.

## Exact acquisition and experiment procedure

**Aerodynamics:** D-4013 supplies ARCAS M0.6–1.2; D-4014 M1.5–4.63. Reference
moment stations differ (70%L vs 63.37%/66.36%L); do not directly merge Cm.
Choose zero cant and stated roll configurations, with a signed near-zero
incidence sweep for CN/Cm derivatives;
use zero incidence for CA0. Keep finite-incidence checks separate; if data do not
straddle zero, declare the derivative estimator and limitation rather than invent
points. Freeze these choices before extraction; record Reynolds,
transition trips, reference area/length, support/base convention and uncertainty.
Keep some conditions/configurations for predeclared method checking and treat
all already inspected public data as development. The M1.2–1.5 gap does not become
validated by interpolation. Interior measurements on other fin configurations
can test a mechanism, not automatically close ARCAS or collegiate coverage.

The [completed interior-Mach search](execution-2026-10-25/data-path-transonic.md)
verified an aft-fin CN/Cm measurement at M1.4 and a forward-fin measurement at
M1.313, including actual plots, geometry and normalization. These are concrete
additional development experiments; neither closes continuous same-geometry
coverage. If the decision remains sensitive there, qualify existing matching
records or commission a separately authorized configuration-specific experiment.

**Flight input pilot:** the pinned UND-ARC/RocketModels-2023 archive includes an
actual public LFS design object and NASA flight-file metadata. Give its pinned
tree/path allowlist to a custodian; do not browse flight reports for missing
inputs. NASA and IREC designs must not be paired merely because they share a
repository. Qualify one complete package first, then expand independent vehicle
and source coverage. RocketPaper inputs are useful development/comparator cases;
their already exposed published summaries cannot become new blind validation.

**Minimum package:** as-flown geometry/surface/buttons; measured loaded/dry
mass/CG and uncertainty; inertia when attitude is claimed; exact motor/case/lot,
curve provenance/time-zero/ambient convention; guide survey; UTC/site/datum and
launch P/T/profile/forecast issue time; recovery sections, CdA and trigger logic.
Custodian retains raw calibrated pressure/GNSS/IMU and clocks/filter/event
uncertainty. Independent rail video/photogates, airspeed/load sensors and recovery
records are required only for the outputs they can actually qualify. Barometric
altitude alone cannot qualify rail speed, CP, opening load or landing containment.

**Custody:** original immutable files and rights stay outside the developer
workspace. Strip stored simulation results, report outcomes, fit parameters and
notebook outputs from input packages. Freeze inclusion/exclusion rules and
observation processing without exposing values; commit predictions before
release. Public archives may support retrospective blinded validation if exposure
and as-flown provenance are established; reconstructed/reanalysis weather does
not recreate prospective preflight forecasting. Preserve every failed round.

**RASAero:** first obtain its supported executable/platform and lawful exports,
exact geometry/options, nozzle exit area and motor ambient-thrust convention.
Run matched-coefficient and matched-input comparisons separately. Its source
evidence combines tunnel/free-flight measurements and atmosphere inputs; wind
profiles alone do not explain its accuracy. Its published 3.47% is a signed mean
for mixed retrospective records, not a universal absolute-error promise. See
[the audited primary-source review](reference-methods-and-evidence.md).

## Effort, resources and real blockers

The first batch is bounded and locally actionable with existing toolchains and
public coefficient documents. Budget one implementation packet plus one review
cycle per major model change; do not quote a calendar completion date until the
first packet establishes measured throughput and pilot input completeness.
No specialized CFD/tunnel purchase is on the immediate critical path.

Use Sol medium for ordinary coding and inventories, Sol high for cross-file
diagnostics/reference normalization, and Astra high only for consequential
physics choices and independent review. This host has 2 CPU quota/8 GiB: at most
two compute jobs, around 6 GiB combined working allowance, research/review in
parallel. No broad Monte Carlo until sensitivity and uncertainty definitions
justify it. Record actual cost telemetry if available; do not invent savings.

External dependencies are a cooperating team/custodian or qualified archive,
as-flown measurements and outcome rights, actual Windows/Mac acceptance access,
and comparator runtime access where needed. No money, outreach, new holdout
access, publication or deployment is authorized by this plan. Missing data may
permit a narrower interim claim; it cannot be replaced by additional model
reasoning or an attractive simulator-to-simulator plot.

Stop primary-use qualification if decision-sensitive error cannot be bounded
within the frozen reserve, if intervals are too wide to choose a design, if
observations cannot resolve the proposed tolerance, or if the model leaves its
qualified envelope. Improve the deficient input/model/measurement, or release
an explicitly limited comparison tool while preserving the primary-use backlog.
Do not adjust the scoring rule after failure. A single pass/fail accuracy badge
must not hide unqualified stability, load or recovery outputs.

## Method references

- [NASA-STD-7009B](https://standards.nasa.gov/standard/nasa/nasa-std-7009)
  and [NASA-HDBK-7009](https://standards.nasa.gov/standard/NASA/NASA-HDBK-7009):
  intended-use credibility/acceptance framework, not a claim of NASA compliance.
- [NIST exact binomial intervals](https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/exacbici.htm):
  sample-design illustration; real clustering/strata require additional design.
- [NASA D-4013](https://ntrs.nasa.gov/api/citations/19670020050/downloads/19670020050.pdf),
  [D-4014](https://ntrs.nasa.gov/api/citations/19670020031/downloads/19670020031.pdf),
  [Barrowman](https://ntrs.nasa.gov/api/citations/20010047838/downloads/20010047838.pdf),
  [OpenRocket technical method](https://openrocket.sourceforge.net/techdoc.pdf),
  [NASA SP-8066](https://ntrs.nasa.gov/api/citations/19710021827/downloads/19710021827.pdf).

Supporting analyses record inspection depth, acquisition status and limitations;
a linked method is not a claim that its entire implementation was audited.

Focused [synthesis review](execution-2026-10-25/plan-review.md) requested the
near-zero incidence sweep, provisional source-method dependency and explicit
source-clock qualifier; these are incorporated above, along with its pre-freeze
statistical, numerical and ownership controls. That review excludes certification
of the reviewer's original model derivation and later alternative-route additions.
Each physical implementation still requires its own independent review.
