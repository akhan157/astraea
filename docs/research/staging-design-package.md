# Astraea Staging Design Package — Phase 0 (Research)

**Document version:** 0.2.0-draft
**Status:** RESEARCH-ONLY — no source edits; this worktree holds documentation.
**Date:** 2026-09-11
**Change log:** 0.2.0 adds §6 — general-purpose staging: build-specific defaults
vs. required inputs, flight-log calibration recipe via the shipped evidence
loop, confidence labelling onto the manifest validity fields, honesty
statements for zero/one-flight use, and the rocket-agnostic scope statement.
**Lane:** astraea-staging-research
**Inputs:** ledger E4 (docs/superset-exception-ledger.md), forum intel P6
(docs/forum-intel-report.md §5), master spec §9.1 `FD-SEP-001`, normative
physical contract (staging mass-identity), Round-11/14–17/19 audits (VV-005
staging readiness).

**Goal of this package:** de-risk a staged/clustered/airstart capability
before any kernel change: (1) document what model fidelity the literature
actually supports for separation dynamics, staging interference aero,
ignition-timing variance, and clustered-motor ballistics; (2) propose how
staging enters the existing adaptive 6-DOF kernel as a model contract;
(3) track the open master-level contract decisions with recommended
defaults; (4) rate effort/risk per work item.

**Naming note (research correction):** the task brief referenced "HARP
reports". HARP (High Altitude Research Program) was the 1960s US/Canada
**gun-launched projectile** program — not staged rockets. The canonical
historical two-stage separation programs are **Bumper** (RTV-G-4, 1947–1950,
V-2 + WAC Corporal; Army Ordnance / General Electric Hermes, with NACA/NASA
archival coverage) and later NASA staging research. Where separation-dynamics
flight data is needed, Bumper/Hermes documents are the correct primary
source; HARP is cited only to avoid the naming collision.

---

## 1. Literature Study

### 1.1 Separation-event dynamics

| Source | Type | What it establishes |
|---|---|---|
| Bumper (RTV-G-4) flight history, White Sands 1948–1949 — NASA history article; Wikipedia; Astronautix; White Sands Missile Range Museum | Flight-test record | First high-speed two-stage separation: V-2 booster throttled near burnout, electrical signal fired WAC Corporal ignition; sliding guide rails inside a modified V-2 nose + compressed-air expulsion separated the stages; WAC used spin rockets for stability after release. Bumper-1 (1948-05-13, dummy upper stage) validated the separation mechanism; Bumper-5 (1949-02-24) achieved ~400 km all-up. Separations occurred at ~3,600 mph (~M4.7 at 32 km) — far outside Astraea's validated M∈[0,4] envelope, so this is qualitative physical reasoning evidence, **not** a numeric validation dataset for subsonic APCP staging. |
| NASA AIAA 2003-4227 (NTRS 20030066311), *Stage Separation Wind Tunnel Tests of a Generic Two-Stage-to-Orbit Launch Vehicle* (Bordelon, Frost, Reed) | Wind-tunnel test (M 2.74–4.96, MSFC ARF, manual separation fixture) | Proximity aerodynamics dominated by bow-shock interactions; **proximity axial force increased ~3% for both bodies** vs isolated; booster statically unstable at several separation positions; normal-force slope nearly unchanged. Regime partly outside Astraea envelope (M≤4) → useful only as an engineering-magnitude anchor, flagged EXTRAPOLATED. |
| NASA TN D-5379, Decker (1969), *Aerodynamic Interference Effects Caused by Parallel-Staged Simple Aerodynamic Configuration at Mach Numbers of 3 and 6* | Wind-tunnel report | Force/moment shifts on both bodies as function of longitudinal/normal separation distance; shock impingement creates pitching excursions and re-contact tendency. Parallel-staged (strap-on) geometry, not tandem amateur staging — again regime/mach anchor only. |
| NASA AIAA 2005-3247 (NTRS 20050212103), *Simulation and Analyses of Stage Separation Two-Stage Reusable Launch Vehicles* (Pamadi et al., ConSep tool) | Simulation methodology + Monte Carlo | Proximity + isolated aero databases from Langley wind-tunnel tests drive a multi-body separation simulator; Monte Carlo over mass/inertia/flight-path/altitude at staging to gauge sensitivity to aero-coefficient uncertainty. Validates the *practice* of perturbation analysis around the staging instant. |
| Apogee *Peak of Flight* / Newsletter 543 (Amateur rocketry; drag separation) | Practitioner literature | Drag separation mechanism: after booster burnout the whole stack coasts; the booster (bigger fins, blunt interstage base) decelerates faster, "tugging" apart the coupler; base-drag spike appears on both newly exposed faces; staging must occur in a low-dynamic-pressure window — too early (high q) jams the coupler, too late (near apogee) drag can't part the stages (needs active ejection: black-powder charges, pneumatic pushers, springs). |

**Fidelity summary — separation dynamics.** Full multi-body rigid-dynamics
with contact (booster/sustainer post-sep motion, recontact) exists in
professional practice (ConSep + ADAMS; NASA WT data) but **no amateur-grade
open simulator implements it**: OpenRocket and RASAero II drop the booster
as an instant mass/geometry discontinuity; RocketPy has no multi-body
separation at all (see §1.4–1.6). The published quantitative anchors that
survive for a subsonic APCP tool are (a) the physical separation mechanism
reasoning (drag differential + ejection impulse), (b) the ~3% proximity
axial-force penalty, (c) the recontact flag concept already specified in
Astraea master spec §9.1 `FD-SEP-001`.

### 1.2 Staging interference aerodynamics (base drag, fin wake)

- **Base drag rise:** after separation, two new blunt faces appear (booster
  fore end, sustainer aft end). Astraea already models base drag with
  `computeBaseDrag` (`src/aero/transonicAero.ts`: subsonic
  `0.12+0.13·M²`, transonic peak 0.38, supersonic `0.38/M^1.2`, plume
  reduction ×0.38 during burn, boattail factor). The staging delta is
  therefore *reachable*: apply the power-off base term to the newly exposed
  stage faces. RASAero II applies exactly this pattern — per-stage power-on /
  power-off `CD` with nozzle-exit-area effects and base drag for large exits.
- **Interference during the window:** AIAA 2003-4227 (~+3% axial on both
  bodies in proximity), TN D-5379 (parallel-staged force/moment shifts).
  For tandem amateur staging the flow physics is: sustainer base in the
  booster's wake region during the first fraction of a second, then clean.
  No public analytic model gives a tandem-stage interference coefficient
  table for M<1; the defensible engineering choice is a **gap-dependent
  multiplier** (e.g., `k_int = 1 + c·f(gap/(5·D))` with c≈0.03–0.10,
  ramping to 1 by gap ≈ 5·D, the same horizon `FD-SEP-001` uses for the
  recontact window) **flagged UNKNOWN** per the validity contract rather
  than asserted as truth.
- **Fin-wake interference:** booster fin wakes impinging on the sustainer
  in flight — literature is qualitatively covered (RASAero manual tip:
  diameter-step between stages trips the booster boundary layer to fully
  turbulent → **All Turbulent Flow** recommendation for conservative
  altitude; community practice per Apogee literature). There is **no
  published quantitative subsonic fin-wake interference model** suitable for
  an engineering tool; phase-1 proposal: treat as EXCLUDED scope with a
  conservative skin-friction trip option (mirroring RASAero's All-Turbulent
  switch) rather than a fake precision model.

### 1.3 Ignition-timing variance (airstart + cluster chains)

- OpenRocket `MotorClusterState` (`core/.../simulation/MotorClusterState.java`)
  models a cluster as `motorCount × thrust` of one curve at **one**
  ignition time; per-motor ignition documents the *cluster configuration*,
  not timing stagger. RocketPy `RingClusterMotor` makes the same choice
  (single `Motor` subclass, thrust scaled ×N, inertia summed per-motor by
  angular position — no per-motor ignition-time distribution).
- Community/practitioner data on *actual* cluster ignition timing:
  - Spaceport Rocketry clustering guide + Estes clustering FAQ: motors
    must light within ~50–100 ms of each other for stable liftoff; >200 ms
    skew = significant impulse-before-liftoff imbalance.
  - Igniter reliability (RockShoppe igniter continuity tests, TRF
    "cluster ignition reliability" thread): single-igniter reliability
    est. 70–98% by class; cluster success ≈ P_i^n (binomial); current
    starvation in parallel wiring stretches variance; high-performance
    igniters claim Δt < 20 ms.
  - OpenRocket techdoc §4.2.6 Table 4.2: motor ignition can be triggered
    by launch, motor burnout, ejection charge, plus arbitrary delays;
    airstart by event chain. `AirStart` simulation-extension example shows
    the listener-based airstart pattern.
- **Conclusion:** a phase-1 kernel can model clustered-motor ignition as
  per-motor ignition times drawn from a settable σ (default suggested
  σ=0.05 s black powder, 0.01 s electronic/altimeter chain, clipped ≥0),
  seeded for determinism — a strict superset of the OR/RocketPy
  single-time model, still cheap, and validated by the community timing
  bounds above.

### 1.4 OpenRocket staged-simulation internals (public repo + docs)

Primary sources read directly:
- `core/src/main/java/info/openrocket/core/simulation/FlightEvent.java` —
  `Type` enum includes `IGNITION`, `BURNOUT`, `EJECTION_CHARGE`,
  `STAGE_SEPARATION`, event `source` = `MotorMount` / `AxialStage`,
  `data` = `MotorClusterState`; events are comparable/time-ordered with
  stage-number + type tie-breaks.
- `core/src/main/java/info/openrocket/core/simulation/MotorClusterState.java` —
  per-motor FSM `ARMED→IGNITED→THRUSTING→DELAYING→SPENT`; `getThrust =
  motorCount × motor.getThrust(motorTime)`; `testForIgnition` hooks
  `IgnitionEvent` (event-driven ignitions).
- `core/src/main/java/info/openrocket/core/simulation/BasicEventSimulationEngine.java` —
  separation check keyed to `StageSeparationConfiguration.getSeparationEvent()`,
  emits `STAGE_SEPARATION` at `event.time + separationDelay`; handler
  clones `SimulationStatus` into a **booster branch** (`FlightDataBranch`
  per stage), `clearStagesBelow()` on the sustainer branch,
  `clearStagesAbove()` on the booster branch, warns `EARLY_SEPARATION`
  (separation before launch-rod clear) and `SEPARATION_ORDER`
  (≠1 active stage below). No interference aero: the sustainer simply
  re-derives mass/CG/aero from the remaining stages at the event.
- Techdoc (`openrocket.sourceforge.net/techdoc.pdf`, v13.05): §2.3 —
  clustering = motors burning concurrently (thrust sum), staging = motors
  burning consecutively (zero-delay booster motor's ejection charge ignites
  the sustainer, or accelerometer/timer for high power); §4.2.6 Table 4.2
  event→action matrix with delays; §4.2.5 — above recovery deployment the
  sim drops to a 3-DOF ballistic/parachute drag model; RK4 with step
  reduction on angular acceleration.
- OpenRocket wiki: simulation listeners / extensions
  (`wiki.openrocket.info/Simulation_Listeners`, `AirStart` example).

**Fidelity model extracted (state of the art, open tools):**
single rigid body at all times; staging = instant mass/CG/geometry
re-init at a localized event (+delay); booster optionally continues in its
own branch under the same integrator; airstart = event-triggered ignition
(burnout/ejection/launch/time, +delay); cluster = count×thrust at one
ignition time; recovery = 3-DOF switch after deployment; **no interference
aero, no recontact, no per-motor ignition stagger**.

### 1.5 RocketPy staged/flight subsystems

Primary source: `docs.rocketpy.org/en/develop/user/flight.html`.
- Multi-stage is **user-driven flight chaining**, not a kernel staging
  model: run stage-1 `Flight` to burnout (`max_time`), build a new
  `Rocket` without the booster, continue with `Flight(rail_length=0,
  initial_solution=flight_1)`; `initial_solution` accepts another Flight or
  a 14-element state vector (Euler parameters). No momentum-preserving
  separation impulse, no two-body window, no interference aero.
- `RailButton` reaction/bending-moment modeling exists (Issue #893).
- Cluster: `RingClusterMotor` (thrust×N, per-motor parallel-axis inertia,
  one timeline) — identical simplification to OpenRocket.
- Parachutes trigger on arbitrary functions of (z, vz) — a trigger model
  pattern Astraea's FSM already generalizes via root-gated events.

### 1.6 RASAero II staging material (primary: Users Manual 1.0.2.0)

- Structural: sustainer + up to two booster stages; **nested upper stage**
  (sustainer motor case slides into booster front, modeled via a "very
  slight boattail" so aero sees the nested length) and non-nested stage.
  Per-stage geometry, fins, boattails, motor (RASP), lift-off weight, CG,
  nozzle exit diameter.
- Flight-sim inputs (p. 103): **booster separation delay** (coast-together
  time after booster burnout before separation) and **sustainer ignition
  delay** (coast after separation before sustainer ignition) — the exact
  two-knob delay-staging model OpenRocket also implements.
- **Boosted Dart**: sustainer flown with a "Dart (NoThrust)" motor and
  0 nozzle exit for power-off-only booster-dart analysis.
- Stability screening: marginal stability (1.0 caliber subsonic, 2.0
  transonic/supersonic, α<5°) and hard-stop "Unstable Rocket" warnings —
  evaluated **per stage** (CG/CP plotted vs time).
- Two-stage tip (p. 115): diameter step from sustainer to booster trips
  the booster boundary layer → run **All Turbulent Flow** for conservative
  altitude predictions; Mach-3+ vehicles also use rough-surface settings.
- Dynamics: 2-DOF (no wind) / 3-DOF (with wind, weathercocking) — **no
  6-DOF**; aerodynamic coefficients per time step by Mach/α/Re, power-on
  vs power-off.

### 1.7 What model fidelity exists — summary map

| Capability | OpenRocket | RASAero II | RocketPy | Published data (non-CFD) | Phase-1 proposable fidelity |
|---|---|---|---|---|---|
| Separation event | Instant mass/geo re-init, delay, booster branch | Instant; delay knobs | User-chained flights | Bumper flight log; mechanism theory | Root-localized event + restart; optional two-body window |
| Momentum/conservation at sep | Not modeled | Not modeled | Not modeled | Rigid-body theory (Astraea §9.1) | **Own contract** FD-SEP-001 |
| Interference aero | None | None (turbulence trip option) | None | WT M2.7–6 (+3% axial; instability zones) | Gap-multiplier, UNKNOWN-flagged |
| Base drag rise | Via re-derivation | Per-stage power-off CD | Via stage2 Rocket CD | Hoerner/NASA base-pressure canon | Reuse `computeBaseDrag` power-off |
| Fin-wake interference | None | None | None | Qualitative only | **Out of scope** (documented) |
| Airstart timing | Event+delay chains | Separation + ignition delays | Not a kernel feature | OpenRocket techdoc Table 4.2 | Event+delay chains, per-motor σ |
| Cluster ballistics | count×thrust, one time | Yes (multi-motor) | RingClusterMotor, one time | Community Δt bounds; igniter reliability | Per-motor σ superset |
| Recontact | None | None | None | WT instability-zone data | Flag + relative-distance check |

---

## 2. Model Contract Proposal

### 2.1 Principles (binding for the proposal)

1. **No kernel rewrites.** Staging is a *driver-level and loads-level*
   extension: the adaptive DP5(4) integrator, dense output, root
   localization, and `LoadsAt` interface already support variable
   mass/inertia (`FlightLoadsDetail.inertiaDotB`) and event-restart — the
   exact machinery staging needs.
2. **Events are roots, not chords.** Existing one-shot gated FSM
   (`detectEvents` + event-restart driver, `src/dynamics/events.ts`,
   `src/sim/event-restart.test.ts` policy) extends with new event types and
   prerequisites; no new integrator path.
3. **Normative invariants hold.** Parent mass-property identity at staging
   (normative physical contract §2: parallel-axis per-axis), FD-SEP-001
   momentum conservation where the two-body window is active.
4. **Honest validity.** Anything outside published-fidelity anchors is
   `UNKNOWN` / `EXCLUDED` in the run manifest, per contract §7 §8 — never
   silently asserted.
5. **Clean cutover discipline**: staging ship = production implementation,
   not test-local algebra (audits VV-005 history).

### 2.2 State additions

- **Vehicle model** (`src/core/types.ts`): `RocketVehicle` gains optional
  `stages: StageVehicle[] | null`. A `StageVehicle` is the existing vehicle
  shape (components, motor references) plus: `ignition: IgnitionTrigger`
  (LAUNCH | EVENT_AFTER(trigger, delay) | TIME(t, σ)), `separation:
  SeparationConfig | null` (trigger, delay, ejection impulse `J_sep`,
  interstage diameter, friction-fit flag). `stages: null` = today's
  single-stage semantics — zero regression surface.
- **Mass/inertia** (`src/core/mass.ts`): stage-partitioned rollout
  `partitionStageMass(vehicle)` returning per-stage `{mass, cgBody,
  inertiaBody, dryMass}`. The existing `aggregateVehicleMass` remains the
  parent identity; staging must reproduce it to machine precision (parallel
  axis per normative contract). Per-stage CG in body frame
  (origin at parent CG for the joint state) is what feeds separation
  kinematics.
- **Kernel state**: `RigidState` unchanged. New `MultiBodyState` wrapper =
  `{ parent: RigidState, bodies?: { id: 'sustainer'|'booster', state: RigidState, attached: boolean }[] }` used
  only during the clearance window; pre-window there is exactly one body.

### 2.3 Event model

New `AstraeaEvent` values (extend `src/dynamics/events.ts` union):

| Event | Prerequisites (gates) | Payload / semantics |
|---|---|---|
| `STAGE_SEP` | booster motor BURNOUT (or ejection charge, per config), on-rail cleared | localized root of the configured separation trigger + delay; applies separation kinematics FD-SEP-001 (or instant re-init in single-body mode); opens two-body window |
| `SUSTAINER_IGNITE` | `STAGE_SEP` (or booster BURNOUT for direct airstart), + ignition delay | per-motor ignition chain: each cluster member's own root at `t_trigger + d_i + δ_i`, `δ_i ~ N(0, σ_ign)` seeded/deterministic, clipped ≥ 0 |
| `BOOSTER_APOGEE` / `BOOSTER_DEPLOY` / `BOOSTER_TOUCHDOWN` | booster branch active | booster's own recovery/ground events (dual recovery) |
| `RECONTACT_WARN` | two-body window | `d_clearance(t) ≤ 0` within `[t_sep, t_sep + T_clear]`, `T_clear` until gap ≥ 5·D (FD-SEP-001); emits flag, sim continues per policy |

FSM extensions: `EventState` gains `hasSeparated`, per-body event queues;
event-restart driver resolves earliest root, applies ONE transition,
re-detects (existing tested pattern: `event-restart.test.ts`
"resolves rail → burnout → apogee in chronological order via root re-feed").
Tie policy: `STAGE_SEP` before `SUSTAINER_IGNITE` at equal time (ignition
is gated on separation, mirroring the apogee-before-main dependency rule).

### 2.4 Aero changes (separation window)

- **Base drag rise:** at `STAGE_SEP`, both new faces (sustainer aft,
  booster fore) enter the loads assembly as power-off base-drag areas via
  existing `computeBaseDrag` (boattail/plume factors already handled).
- **Interference multiplier** on both bodies' axial force during window:
  `k_int(gap) = 1 + c_int · g(gap/(5D))`, `g` smooth 1→0 over the window,
  `c_int` default 0.05 (anchored by the ~3% WT proximity datum, inflated
  toward the subsonic tandem case, always `UNKNOWN`-flagged). Radial
  separation/relative-attitude effects: out of scope, documented.
- **Stage-specific aero rebuild:** per-stage `prepareVehicle` from the
  stage's own component tree (already the single-stage path); booster keeps
  its own geometry for its branch (fins, interstage face).
- **Skin-friction trip option** (RASAero All-Turbulent parity): manifest
  switch `stagingTurbulenceTrip: boolean`.

### 2.5 Ignition model (clusters + airstarts)

Per-motor thrust summation replaces count×thrust: motor timeline i has
`t_ign,i = triggerRoot + delay + δ_i(σ)`, `δ_i` seeded per run key; mass
depletion per-motor. Defaults: `σ = 0.05 s` (black powder cluster),
`0.01 s` (electronic chain), configurable; deterministic via master seed
(MC parity with `runMonteCarloChunk`). Single-motor sustainer = σ=0, one
event — exactly today's behavior plus the new gate.

### 2.6 Validation gates (future phases validate against)

| Gate | Reference / dataset | Acceptance (proposal) |
|---|---|---|
| G1 Conservation invariants | FD-SEP-001 analytic; normative contract §2 | `‖ΔP‖/‖P₀‖ ≤ 1e-6`, `‖ΔH₀‖/‖H₀‖ ≤ 1e-6` over separation, parent identity to machine precision |
| G2 Two-body kinematics | Rigid-body closed-form: separation with zero external force | sustainer/booster states match analytic relative velocity/gap to integrator tolerance |
| G3 Single-body parity | OpenRocket + RASAero II + RocketPy same vehicle | `Δ apogee ≤ 3%` (cross-sim parity suite), documented per-tool config deltas |
| G4 Regime anchors | NASA WT data (AIAA 2003-4227, TN D-5379) | Interference multiplier reproduces ~+3% axial at reference gap; mark EXTRAPOLATED outside M∈[0,4] |
| G5 Cluster ignition | Community Δt bounds (Spaceport/Estes data), seeded MC | Σ with σ=0 matches count×thrust; σ>0 widens dispersion monotonically; no NaN/failed members |
| G6 Flight logs (future sponsor) | 2-stage HPR/competition altimeter logs (e.g., NASA SL / EuRoC public team reports, Tripoli logs) | model-in-the-loop Δ apogee within stated band once corpus exists; no sponsor yet → gate deferred (ledger E4 re-visit) |
| G7 Event localization | Existing suite (≤1e-5 s roots) extended to STAGE_SEP/IGNITE chains | same tolerance on staged flights |

### 2.7 Explicit OUT of scope for phase-1 coding

- Multi-body separation **after** the clearance window for the sustainer
  (booster runs its own branch; sustainer is single-body from `t_sep +
  T_clear`).
- Recontact **physics** beyond the distance-root flag (no contact
  forces, no jamming/collision load).
- Fin-wake interference *model* (documented exclusion + turbulence-trip
  switch only).
- Interference coefficient tables M>0.8 with claimed accuracy (EXTRA-
  POLATED flag or single conservative multiplier).
- Hypersonic staging, orbital/launch-vehicle staging semantics, booster
  guidance.
- Terrain, rail tip-off staging interplay, and landing-tip — remain in
  ledger E4's terrain/tip-off row; only the staging/clustering part of E4
  is addressed here.
- `.ork`/`.rkt` multi-stage file import/export and multi-stage UI assembly
  (separate interop/UX lanes; simulation kernel contract ships first).
- Monte-Carlo σ calibration against real staged flights (needs sponsor
  data — G6).
- Cluster count cap: phase-1 supports N≤8 motors per stage (parametric
  positions), documented UI/param limit.

### 2.8 Manifest, validity, telemetry

`SixDofRunManifest` adds `staging: 'single-stage' | 'staged-single-body' |
'staged-two-body-window'`, `stagingFidelity: string[]` (interference model
flag, ignition σ, turbulence trip), `unsupportedScope` gains the excluded
items of §2.7. Booster branch events/telemetry tagged `body: 'sustainer' |
'booster'`. Nonterminal telemetry stays presentation-grade; canonical
records remain terminal state + quaternions (per existing notes).

---

## 3. Open Master-Level Contract Decisions (with recommended defaults)

Format mirrors `astraea-frontend/docs/master-contract-decisions.md`.

| # | Decision | Recommended default | Rationale |
| :-- | :-- | :-- | :-- |
| Q1 | Separation model | **Two-body window** (FD-SEP-001): bodies integrate concurrently only until gap ≥ 5·D, then booster branches; single-body mode as manifest-selectable fallback. | It is the already-spec'd contract and gives recontact + conservation guarantees the competition/jury audits demand; the window is short so cost is ~2× for a fraction of a second. |
| Q2 | Booster post-separation fate | **Full booster branch** to recovery + touchdown (dual recovery events). | Round-17 audit demands staged-vehicle dual recovery otherwise excluded; matches OR's branch design; telemetry-only booster is a bootstrap cut if needed. |
| Q3 | Interference aero | **Gap-multiplier k_int** (c≈0.05, UNKNOWN-flagged) + base-drag rise via existing `computeBaseDrag`. | Only defensible fidelity from WT anchors; honesty flag per contract; no fake tables. |
| Q4 | Fin-wake interference | **Excluded**, with `stagingTurbulenceTrip` (All-Turbulent parity switch). | No published quantitative model; RASAero precedent for the conservative option. |
| Q5 | Cluster ignition | **Per-motor σ model** (default σ 0.05 s BP / 0.01 s electronic, seeded; σ=0 ≡ OR/RocketPy count×thrust). | Superset of incumbents, cheap, community-timing bounds (50–100 ms) give the calibration anchor. |
| Q6 | Ignition triggering | **Event+delay chains** (launch / burnout / ejection / separation / apogee / absolute time), extending the existing root-gated FSM. | OpenRocket Table 4.2 semantics; zero new machinery; covers 0-delay "flame-through" staging naturally. |
| Q7 | Staging timing semantics | Trigger + **separation delay** (booster coast) + **sustainer ignition delay** — RASAero/OR parity knobs, not fixed times. | Community workflow standard; two-knob model covers drag separation and active ejection. |
| Q8 | Mass model | **Stage-partitioned components** with parent mass-identity invariant (normative contract) enforced by test. | Required by FD-SEP-001 kinematics; whole-vehicle override remains for recovery of single-stage behavior. |
| Q9 | Base drag | **New faces exposed power-off** at STAGE_SEP root. | Physically correct; reuses shipped model; negligible code. |
| Q10 | Sim architecture | **One FSM, per-body event queues, branches** (OR pattern) — not N standalone Flight runs (RocketPy style). | Keeps single root-localized timeline + event ties; matches existing event-restart driver. |
| Q11 | Validity/scope | Interference window **UNKNOWN-flagged**; manifest declares staging fidelity level + exclusions. | Contract §7; prevents silent over-claiming; already the pattern via `unsupportedScope`. |
| Q12 | Phase-1 validation priority | G1–G3, G5, G7 analytic/parity suite first; G6 flight-data corpus **deferred to sponsor** (ledger E4 re-visit condition unchanged). | No flight-data sponsor yet; analytic + cross-sim parity is the de-risk step this phase funds. |
| Q13 | Cluster cap | N ≤ 8 motors/stage phase-1, σ ≥ 0 enforced. | UI/parametric sanity; beyond 4 motors community practice demands electronic ignition (which σ=0.01 models). |

---

## 4. Effort / Risk Table

| # | Work item | Effort | Risk | Mitigation |
| :-- | :-- | :-- | :-- | :-- |
| W1 | Vehicle model: optional `stages` tree + per-stage motor/ignition/separation config | M | Low | `stages:null` default = zero regression; schema test |
| W2 | Stage-partitioned mass/inertia + parent identity invariant | M | Med (parallel-axis sign errors) | Invariant test to machine precision; reuse `aggregateVehicleMass` as parent oracle |
| W3 | `STAGE_SEP` + ignition chain + `BOOSTER_*` events in FSM/driver | M | Med (gate ordering) | Extend existing root-feed/tie tests; gate table mirrors event-restart.test.ts patterns |
| W4 | Two-body clearance window integration | M–H | **High** (numerical coupling, step control) | Window is short; independent bodies share wind env; G2 closed-form test; optional single-body mode ships first if W4 slips |
| W5 | Interference aero + base-drag rise | L–M | Med (data honesty) | UNKNOWN flag; c_int anchored to WT ~3%; no accuracy claims |
| W6 | Per-motor ignition σ + seeded MC wiring | S | Low | σ=0 parity test vs count×thrust; determinism across runs |
| W7 | Booster branch sim + dual recovery | M | Med | Branch shares integrator/atmosphere; events per branch tagged |
| W8 | Cross-sim parity suite (OR/RASAero/RocketPy) | M | Med (tool config deltas) | Document config per tool; 3% tolerance; parity harness external to kernel tests |
| W9 | Manifest/telemetry/validity plumbing | S | Low | Extends existing manifest pattern |
| W10 | (Later) `.ork` multi-stage interop + staging UI | M–H | Med | Out of phase-1 scope; kernel contract is the dependency |

**Overall phase-1 risk posture:** the high-risk item is W4 (two-body
window). The plan de-risks it by making single-body staging (instant
re-init, booster branch) the fallback that ships first, W4 layered behind
the G1/G2 analytic gates. No physics claim in the package exceeds
published/primary-source fidelity; everything else is UNKNOWN-flagged or
excluded.

---

## 5. References

### Primary sources read for this package
1. NASA NTRS 20030066311 — *Stage Separation Wind Tunnel Tests of a Generic
   Two-Stage-to-Orbit Launch Vehicle* (AIAA 2003-4227; Bordelon, Frost,
   Reed). https://ntrs.nasa.gov/citations/20030066311
2. NASA TN D-5379 — Decker, *Aerodynamic Interference Effects Caused by
   Parallel-Staged Simple Aerodynamic Configuration at Mach Numbers of 3
   and 6* (1969). https://ntrs.nasa.gov/citations/20080000856
3. NASA NTRS 20050212103 — *Simulation and Analyses of Stage Separation
   Two-Stage Reusable Launch Vehicles* (AIAA 2005-3247; Pamadi et al.).
   https://ntrs.nasa.gov/citations/20050212103
4. OpenRocket source (master): `core/src/main/java/info/openrocket/core/simulation/`
   `FlightEvent.java`, `MotorClusterState.java`,
   `BasicEventSimulationEngine.java`.
   https://github.com/openrocket/openrocket
5. OpenRocket Technical Documentation (v13.05) §2.3, §4.2.5, §4.2.6
   (Table 4.2). https://openrocket.sourceforge.net/techdoc.pdf
6. OpenRocket wiki — Simulation Listeners / extensions (incl. `AirStart`).
   http://wiki.openrocket.info/Simulation_Listeners
7. RocketPy Flight Class Usage (develop): `initial_solution` chaining,
   rail_length=0, 14-element state vector.
   https://docs.rocketpy.org/en/develop/user/flight.html
8. RocketPy `RingClusterMotor` source.
   https://github.com/RocketPy-Team/RocketPy/blob/master/rocketpy/motors/ring_cluster_motor.py
9. RASAero II Users Manual v1.0.2.0 (Rogers Aeroscience): nested upper
   stage pp. 39–44; FlightDataEntry separation/ignition delays p. 103;
   Boosted Dart pp. 112–113; two-stage All-Turbulent tip pp. 115–116;
   stability warnings pp. 114–115.
   https://www.rasaero.com/dloads/RASAero%20II%20Users%20Manual.pdf
10. Bumper (RTV-G-4) flight history — NASA history article "75 years ago:
    first launch of a two-stage rocket";
    https://www.nasa.gov/history/75-years-ago-first-launch-of-a-two-stage-rocket/
    (with Project Hermes references); en.wikipedia.org/wiki/RTV-G-4_Bumper;
    astronautix.com/b/bumper-wac.html
11. Spaceport Rocketry — *Motor Clustering* (ignition simultaneity
    thresholds, current starvation).
    http://www.spaceportrocketry.org/Motor%20Clustering.html
12. Estes — engine clustering FAQ. https://help.estesrockets.com/article/61-what-is-engine-clustering
13. RockShoppe — *Igniter Continuity Tests*.
    https://www.rocketshoppe.com/info/Igniter_Continuity_Tests.pdf
14. Apogee Peak of Flight / Newsletter 543 (drag separation, base drag,
    staging q-window; mirrored copy).
    http://ftp.demec.ufpr.br/foguete/bibliografia/Apogee_altimetros_Newsletter543%20em%202021-03-16.pdf
15. Astraea primary docs (this worktree): `superset-exception-ledger.md`
    (E4), `astraea-master-product-spec.md` (§9.1 FD-SEP-001),
    `astraea-normative-physical-contract.md` (§2 staging mass identity,
    §6 aero convention, §7 validity, §8 envelope), sibling-worktree
    `forum-intel-report.md` (§2 T5, §5 P6).

### Naming note
HARP = gun-launched projectiles (Project HARP Wikipedia), not staged
rockets; Bumper/Hermes carry the staged-separation flight record
(§1.1).

---

## 6. General-Purpose Staging: Defaults, Overrides, Calibration, Honesty

**Purpose.** §2 proposes the staging model contract; §6 defines how an
*arbitrary* team parameterizes it: which inputs the user must supply,
which values the tool defaults and why, how a team's own flight log feeds
the shipped evidence loop (master spec Mode 5 `calibrateCd` + overlay),
and how every staging-derived output is confidence-labelled so the app
never implies unearned precision. §6 adds no new physics claims; every
substantive statement cites §§1–5 of this package, the master spec
(§1.1, §3.1, §6.3, §7, §8, §9.1, Mode 5), or the normative physical
contract (§2, §7, §8) — all reference list item 15.

### 6.1 Required vs. defaulted build-specific parameters

The vehicle model (§2.2) carries per-stage `ignition: IgnitionTrigger`
(LAUNCH | EVENT_AFTER(trigger, delay) | TIME(t, σ)) and `separation:
SeparationConfig | null` (trigger, delay, ejection impulse `J_sep`,
interstage diameter, friction-fit flag). Six parameters are build-specific.
Classification: **USER-MUST-SUPPLY** = a hardware fact the tool cannot
guess, where the default would silently misrepresent physics; **SAFE-TO-
DEFAULT** = a conservative default exists in the direction of least hidden
error, is UNKNOWN-flagged, and is overridable. Rule: every defaulted value
is written into `stagingFidelity[]` (§2.8) as an explicit `key:value` so
the manifest always shows uncalibrated inputs; no default is ever asserted
as accurate (§2.1.4).

| # | Parameter | Class | Conservative default | Provenance | User action |
| :-- | :-- | :-- | :-- | :-- | :-- |
| P1 | Retention friction force (coupler fit / shear pins) | USER-MUST-SUPPLY if nonzero | **0 N** — `friction-fit=false`, pure drag separation | Drag-separation mechanism, Apogee P-o-F 543 (§1.1: booster "tugging" apart the coupler; jam if q too high); `friction-fit` flag §2.2; positive retention sizing path = master spec Mode 5 black-powder sizing with shear-pin pressure targets | Set any positive value when the coupler is friction-fit or shear-pinned; its impulse budget must overcome it. Under-claiming retention over-predicts separation success; the sim is fail-safe on the gate chain because SUSTAINER_IGNITE is preconditioned on STAGE_SEP (§2.3) |
| P2 | Separation charge impulse `J_sep` | USER-MUST-SUPPLY when active ejection | **0 N·s** — drag separation | Apogee P-o-F 543 (canonical low-q drag separation; too-late needs active ejection); Bumper compressed-air expulsion — qualitative physical reasoning (§1.1); black-powder sizing `m_BP = P_target·V/(R·T)` from master spec Mode 5 | Supply impulse only for active-ejection builds (springs, pneumatic, BP); J enters the FD-SEP-001 momentum equations as `J_i^N/m_i` (§9.1(1)) |
| P3 | Interstage diameter | USER-MUST-SUPPLY (geometry) | **= sustainer airframe D** (flush joint, no step) | FD-SEP-001 clearance horizon is 5·D_airframe (§9.1(3)); RASAero nested stage models the step as a "very slight boattail" (§1.6); diameter-step trips boundary layer → All-Turbulent tip (§1.6) | Flush default is the least geometric assumption; a real step changes base-drag/flow behaviour only when the user supplies it (and should flip `stagingTurbulenceTrip`, Q4) |
| P4 | Ignition delay (sustainer after separation) | SAFE-TO-DEFAULT | **0 s** — zero-delay "flame-through" | OpenRocket techdoc §2.3: canonical staging = booster ejection charge ignites sustainer at zero delay (accelerometer/timer for high power); RASAero p.103 sustainer-ignition-delay knob (§1.6); §3 Q6/Q7 event-chain semantics | Matches the incumbent tools' canonical staging semantics; nonzero values = RASAero/OR two-knob workflow (separation delay + ignition delay) |
| P5 | Ignition timing σ | SAFE-TO-DEFAULT (by igniter class) | **0.05 s** black-powder, **0.01 s** electronic/altimeter chain (clipped ≥ 0) | §1.3/§2.5/Q5: community timing bounds 50–100 ms (Spaceport/Estes), igniter-reliability data, high-performance igniters claim Δt < 20 ms | σ is dispersion around the ignition root, seeded/deterministic per run (§2.5); σ = 0 reproduces OpenRocket/RocketPy count×thrust exactly (Q5) |
| P6 | Upper-stage motor igniter type | USER-MUST-SUPPLY (hardware decision) | **Electronic / altimeter chain** (⇒ σ = 0.01 s) | Q13: beyond 4 motors community practice demands electronic ignition (σ = 0.01 models it); OpenRocket techdoc §4.2.6 event-chain airstart; §1.3 high-performance igniters Δt < 20 ms | Type selects the σ default (P5); electronic-chain is the community-practice in-flight airstart; black-powder zero-delay flame-through is the alternative canonical path (OpenRocket techdoc §2.3) |

No default is "safe" in the sense of accurate — safe means *conservative,
labelled, and overridable*: the app shows `stagingFidelity` flags
(e.g. `separation-impulse:0-drag`, `interstage-diameter:flush`,
`ignition-sigma:0.01-electronic`) rather than hiding that the values are
uncalibrated.

### 6.2 Calibration from a team's own flight log — inverse-problem recipe

The shipped evidence loop (master spec Mode 5, `astraea-design-doc.md` §3
"Closed-Loop Verification Engine"): flight-log ingestion (AltOS `.eeprom`/
CSV, FlightSketch, StratoLogger, generic CSVs — Mode 5-3), synchronized
sim-vs-actual overlay with Δh_apogee, Δv_burnout, descent-rate deltas
(Mode 5-4), and `calibrateCd` — "solves the inverse flight dynamics
problem: utilizes measured deceleration during unpowered coasting flight
to calculate the ... true real-world drag coefficient" (Mode 5-5). For a
staged vehicle the loop identifies exactly one category of parameter per
usable coast segment; everything else stays defaulted and labelled.

**What the log must contain.**

1. Time-tagged above-pad altitude across the ascent, and in particular
   *distinct unpowered coast windows*: **B** = [booster burnout,
   separation] (booster stack flying on booster-vehicle C_D) and **S** =
   [sustainer burnout, apogee) (sustainer-vehicle C_D). `calibrateCd`
   requires an unpowered coast segment by construction (Mode 5-5).
2. Enough samples in each window to resolve a deceleration trend — the
   barometric sensor bandwidth/noise floor sets the identifiability floor
   below.
3. Launch-context evidence: motor identity + thrust curve and stage masses
   at each window start (to separate gravity and known mass from drag),
   plus calm conditions or an independent wind record — the 1-D altitude
   inversion cannot separate wind from drag.
4. Raw-log integrity: ingestion must not modify the raw evidence (master
   spec Mode 5; evidence-ledger revision semantics).

**The inverse problem.** On an unpowered coast along the vertical,
$m \dot{v} = -\tfrac{1}{2}\rho v^2 S C_D - m g$. Given $h_{\log}(t)$ →
$v$, $\dot v$ numerically, each sample yields
$C_{D,\mathrm{obs}}(t) = 2m(\dot v + g)/(\rho v^2 S)$; the solver fits one
*lumped* effective multiplier $\kappa^* = C_{D,\mathrm{calibrated}} /
C_{D,\mathrm{model}}$ minimizing the overlay residual over the chosen
segment(s) (Mode 5-5 over Mode 5-4 deltas). $\kappa^*$ is written back to
the vehicle specification and reused by subsequent simulations (Mode 5-5).

**Which parameter it identifies.** Exactly one scalar per usable coast
segment: an effective drag multiplier for the booster-vehicle (window B)
and/or the sustainer-vehicle (window S). That is the complete set of
staging-build parameters the shipped loop can solve from a log today.

**Expected identifiability limits.**

- **Not $J_{\mathrm{sep}}$ or retention friction.** Their observable
  signature is a $\Delta v \approx J_{\mathrm{sep}}/m$ step (FD-SEP-001:
  $\mathbf{v}^+ = \mathbf{v}^- + \mathbf{J}_i^N/m_i$) resolving over a
  fraction of a second against a multi-second coast deceleration;
  barometric-log bandwidth/noise cannot separate the step from the trend
  [model arithmetic from §9.1(1), not a measurement — no cited source
  quantifies sensor feasibility].
- **Not ignition σ.** One flight is one draw from the σ distribution; σ
  requires a multi-flight ensemble, and even then apogee dispersion
  conflates ignition stagger with wind and mass scatter. The only
  quantitative anchors remain the community Δt bounds (Q5: 50–100 ms;
  high-performance igniters < 20 ms).
- **Not the interference multiplier $c_{\mathrm{int}}$.** The window is
  sub-second (§6.5.2) and its axial effect is ~% class; a 1-D altitude log
  integrates over it. Remains UNKNOWN-flagged (§1.2, Q3).
- **$\kappa^*$ is lumped, not physical.** It absorbs wind error,
  atmosphere-model error, un-modeled aero, and mass error. Mode 5-5's
  "true real-world drag coefficient" is an *effective* coefficient over
  the observed segment; the tool labels it `calibrated-cd` and does not
  decompose it.
- **One flight ≠ staging-model validation.** Calibration closes only the
  drag channel(s) observed; $J_{\mathrm{sep}}$, retention, σ, and
  interference remain defaults. Gate G6 (model-in-the-loop Δ-apogee
  against a staged-flight corpus) is deferred for lack of sponsor data
  (ledger E4; §2.6 G6).

### 6.3 Confidence labelling — outputs mapped to manifest validity

Labels **HIGH / MEDIUM / APPROXIMATE / UNVALIDATED**, mapped onto the
existing manifest fields (§2.8: `staging`, `stagingFidelity[]`,
`unsupportedScope`) and the validity statuses VALID / EXTRAPOLATED /
UNKNOWN / UNSUPPORTED (normative contract §7; master spec §6.3), so the
app's precision claims equal the model's. This is the staging-space
application of the audit-driven validity-gating pattern (VV-005 history,
rounds 14–17 audits, reference item 15).

| Output | Confidence | Basis | Manifest mapping | Validity status |
| :-- | :-- | :-- | :-- | :-- |
| Stage mass/CG/inertia partition; parent mass identity | HIGH | Normative contract §2 (parallel-axis identity); gate G1 | `stagingFidelity` += `mass-identity:invariant` | VALID (only while invariant holds; else FAIL) |
| Momentum/energy conservation across separation | HIGH | FD-SEP-001 §9.1(2); gate G1 (≤ 1e-6) | staging model flag | VALID |
| Staging/ignition event times (root localization) | HIGH | Gate G7 (≤ 1e-5 s); existing event-restart policy (§2.3) | staging model flag | VALID |
| Calibrated coast/apogee channels after κ*-fit (same vehicle, similar conditions) | MEDIUM — tool design claim | Master spec Mode 5-5: "< 3% error" on subsequent simulations; **not yet demonstrated on staged flight logs** — G6 deferred, no sponsor (ledger E4) | `stagingFidelity` += `calibrated-cd:coast:yes` | VALID within calibrate applicability; the < 3% is a design target, not flight-evidence |
| Uncalibrated single-stage apogee/velocity; base-drag rise on new faces; booster-branch ballistics | MEDIUM | Screened empirical aero — normative §8 ("do not constitute structural or safety certification"); `computeBaseDrag` is a screened empirical model (§1.2); cross-sim parity ±3% (G3/W8) | `stagingFidelity` += `base-drag-poweroff:on` | VALID (envelope M∈[0,4], α ≤ 15°); EXTRAPOLATED outside |
| Interference multiplier trajectory effect | APPROXIMATE | Only anchor: ~+3% axial WT datum, different regime/geometry (AIAA 2003-4227); band c_int ∈ [0.03, 0.10] is engineering envelope (§1.2, Q3) | `stagingFidelity` += `interference-multiplier:0.05` | **UNKNOWN** — never presented as precision (§2.1.4, Q11) |
| Ignition-σ dispersion of apogee/events; turbulence-trip effect | APPROXIMATE | Community Δt bounds only (Q5); RASAero All-Turbulent parity with no quantitative model (§1.2, Q4) | `stagingFidelity` += `ignition-sigma:0.05-bp\|0.01-elec`, `turbulence-trip:on\|off` | UNKNOWN / EXTRAPOLATED |
| Fin-wake interference; recontact physics beyond the distance flag | UNVALIDATED | Excluded — no published quantitative model (§1.2, §2.7, Q4) | `unsupportedScope` += `fin-wake-interference`, `recontact-physics` | UNSUPPORTED |
| Interference tables M>0.8; multi-body beyond the 5·D window; hypersonic/orbital staging; booster guidance | UNVALIDATED | §2.7 exclusions; outside validated envelope (normative §8) | `unsupportedScope` += the §2.7 items | UNSUPPORTED / EXTRAPOLATED |

Run-level rule (binding, §2.1.4 + transactional-validity pattern from the
rounds 14–17 audits): final validity = minimum over all committed
segments; out-of-domain staging terms never yield PASS (normative §7);
safety-critical outputs stay gated on PASS. A run passing through an
APPROXIMATE window reports UNKNOWN on those segments with the responsible
`stagingFidelity` flag attached — the app labels, it never silently
averages.

### 6.4 Defaults-only (zero flights) vs. one-flight calibrated — accuracy expectations

| State | What is set | What the tool outputs | Honest accuracy expectation | Manifest state |
| :-- | :-- | :-- | :-- | :-- |
| ZERO flight data | P1–P6 at defaults (§6.1); no calibration | Full staged sim: event times, window dynamics, apogee, booster branch, with confidence labels | **No accuracy claim is made.** Uncalibrated predictions sit in the class of the 15–25% competition altitude scatter that motivates the evidence loop (master spec §1.1 failure mode 2); Astraea's own uncalibrated predictions carry no better claim. Staging-specific terms are worse-known: the interference window is UNKNOWN-flagged; $J_{\mathrm{sep}}$, retention, σ at defaults are evidence-free. Output = screening estimate, presented as such. | `staging` = staged-sim mode; `stagingFidelity` lists every default explicitly; `unsupportedScope` per §2.7; UNKNOWN on APPROXIMATE segments |
| ONE flight | κ* calibrated per coast segment the log covers (booster-vehicle and/or sustainer-vehicle) | Overlay (Δh_apogee, Δv_burnout, descent-rate) + updated predictions on calibrated channels | **Drag-only improvement, per the tool's own design claim:** "< 3% error" on subsequent simulations (Mode 5-5) — applying only to the channels the log observed, for similar launch conditions, and as a design target **not yet demonstrated against staged logs** (G6 deferred, ledger E4). Everything else ($J_{\mathrm{sep}}$, retention, σ, interference) remains defaulted and UNKNOWN-labelled even after the flight. One flight is one σ sample — no ignition-dispersion claim of any kind. | `stagingFidelity` += `calibrated-cd:coast:yes` (per segment); overlay attached as evidence revision (Mode 5 / UI spec 4.5.5) |

Shared honesty statement: the tool never converts "has a flight log" into
"validated staging model". Calibration closes exactly the lumped drag
channel; the staging-specific unknowns persist until community-scale
staged-flight data exists (G6, ledger E4 re-visit condition unchanged).

### 6.5 Rocket-agnostic scope and the separation-window interference uncertainty

**6.5.1 Rocket-agnostic, not team-specific.** The model contract (§2) is
vehicle-shaped: FD-SEP-001 momentum kinematics, event+delay chains,
per-motor σ, gap multiplier, and base-drag reuse are functions of (m, ρ,
I, D, C_D, $J_{\mathrm{sep}}$, time constants) — no team identity and no
vehicle constant is compiled anywhere (§2.2: `stages:null` = today's
single-stage semantics, zero regression). Every build-specific value
(P1–P6 plus stage geometry, masses, motors, recovery) lives in the team's
own `.astraea.json` vehicle spec (master spec §3.1); the same model path
serves any tandem two-stage HPR — nested upper stage or non-nested
(RASAero, §1.6), drag separation or active ejection. The §6.1 defaults are
"safe" in the sense of *generic-conservative for any vehicle*, never tuned
to a specific team's rocket; seeded determinism (§2.5) means identical
inputs yield identical outputs for any user. Excluded topology: parallel/
strap-on staging stays outside the validated envelope — its only
quantitative data (TN D-5379, parallel-staged force/moment shifts at M 3
and 6) is a regime anchor, not an in-envelope model (§1.1, §2.7).

**6.5.2 Separation-window interference uncertainty, stated at current
knowledge.**

- **Measured anchor:** ~+3% axial-force increase on both bodies in
  proximity, wind-tunnel tests at M 2.74–4.96 on a generic TSTO vehicle
  (AIAA 2003-4227, §1.1). One datum; different regime and geometry.
- **Transfer:** EXTRAPOLATED to the subsonic tandem case — no published
  subsonic tandem separation-interference dataset exists (§1.2).
  TN D-5379 (parallel-staged, M 3/6) shows force/moment shifts and
  instability zones but yields no tandem coefficient table (§1.1).
- **Engineering envelope:** $k_{\mathrm{int}}(\mathrm{gap}) = 1 +
  c_{\mathrm{int}} \cdot g(\mathrm{gap}/(5D))$, $c_{\mathrm{int}} \in
  [0.03, 0.10]$ (default 0.05), ramping to 1 by gap ≈ 5·D (§1.2, §2.4,
  Q3). The band is an engineering judgement anchored at the 3% datum and
  inflated toward the subsonic tandem case — it is **not a measurement**,
  and remains UNKNOWN-flagged.
- **Window duration:** the multiplier is active from STAGE_SEP until gap
  ≥ 5·D, the FD-SEP-001 clearance horizon (§1.2, Q1). Duration is model
  arithmetic from FD-SEP-001 kinematics: gap rate set by
  $J_{\mathrm{sep}}/m$ plus the drag differential; for typical amateur
  D ≈ 0.1–0.2 m and relative Δv ≈ 1–2 m/s, 5·D ≈ 0.5–1.0 m ⇒
  $T_{\mathrm{clear}}$ ≈ 0.3–1 s [derived from §2.3/FD-SEP-001 equations;
  no empirical claim].
- **Consequence for output:** because only axial force is perturbed and
  only during this sub-second window, apogee impact is bounded but its
  numeric value is **not known** — no cited source quantifies it. The
  honest output is the UNKNOWN label plus an integrated sensitivity band
  from the two-body window simulation (Q3, G4), never a point prediction
  presented as precision. Conservatism direction: default 0.05 sits inside
  the [0.03, 0.10] band; teams may sensitize over the band with the
  existing scenario/ensemble machinery (master spec §7) — that is the
  supported way to explore this uncertainty, not a route to a new accuracy
  claim.