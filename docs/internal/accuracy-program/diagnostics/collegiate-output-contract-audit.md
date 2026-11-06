# Collegiate output contract audit — 2026-10-24

**Three output contracts need explicit requirements before they can support a collegiate 1.0 decision: effective rail travel, powered-flight stability history, and peak-load resolution.** The current source establishes definitions and omissions, not the size of a physical prediction error. No threshold, model or competition profile is changed by this audit.

Source baseline: product/physics `1745adb7265b642c6a7ecfd12e1418b51f159bcb`; inspected diagnostics HEAD `01c55128b9f7d3894afac019840548f0dcdc1710` adds calibration semantics/docs only. Research read from the standard worktree at `e421a79c7246735572ab43b288b865c7f10f89cd`, specifically `collegiate-mission-and-decision-matrix.md`, `collegiate-accuracy-spec-proposed.md`, `reference-methods-and-evidence.md` and `sources-and-exposure.json` under `docs/internal/accuracy-program/`. That research is proposed requirements, not an adopted product promise.

## Governing references and scope

The source versions below are inherited from the research ledger, accessed 2026-10-24; no PDFs were fetched or independently rehashed for this source audit. Clauses control over these summaries. They are vehicle requirements, not numerical accuracy tolerances or universal flight authorization criteria.

| Official reference | Relevant requirement identified by research | Pinned SHA-256 |
|---|---|---|
| [IREC DTEG 2027 REV P1](https://www.esrarocket.org/s/2027-IREC-DTEG-REV-P1.pdf), effective 2026-10-15 | §5.3: 25 m/s at first rotational freedom; §10.2–10.3: minimum length-based stability through burnout, with different subsonic/supersonic conditions and maximum margins; §8.2: structural integrity and flutter calculation | `76d4edba987cae10a959aa930e537d411b8819673a89b0ff4a97c5b95d007728` |
| [NASA 2027 Student Launch handbook](https://www.nasa.gov/wp-content/uploads/2026/08/g-739882-2027-sli-handbook-508-aug5.pdf), USLI vehicle clauses | §2.14: 52 ft/s departure requirement; §2.11: 2.0 static margin on pad. These differ from IREC; later school-division rules are separate | `91c2c045278f49bc8b4475c34ef1f397c24281cbcdc7bc92609f55bb38e79822` |

The initial proposed mission is single-stage commercial-solid, passive stability and dual-event recovery. These references do not qualify staging, SRAD propulsion, active control, or every collegiate mission. Actual geometry, mass/CG, motor, weather, Mach/AoA envelope and decision reserve remain necessary.

## 1. Rail departure: configured travel, without guide geometry

**Confirmed semantics.** The UI field is “Rail length” (`src/console/stages/Flight.tsx:192`). `src/console/design.ts:102` maps workspace `railLengthM` to `railLength`; `src/console/data/adapter.ts:53` forwards it unchanged. `FlightOptionsDto` (`crates/astraea-engine/src/models.rs:98`) exposes this scalar and rail angles, without front/rear button positions or initial guide-to-rail-end offsets.

The core starts position and velocity at zero (`crates/astraea-core/src/six_dof.rs:1706`) and defines departure by `root.r.dot(rail) >= rail_length` (`:866`). Thus the operative quantity is displacement along the rail from the initial reference position. At the localized release it records ground-speed magnitude `serve_root.v.norm()` as `rail_exit_velocity` and emits “Launch Rail Departure” (`:1987`). Motion is constrained along the rail with attitude/rates locked before release (`:2174`). The output is not airspeed: air-relative incidence is computed separately at release (`:1991`).

The DTO exposes `isRailExitSafe = certified && rail_exit_velocity >= 15.0` (`crates/astraea-engine/src/models.rs:798`); the adapter labels a 15 m/s pass/fail gate (`src/console/data/adapter.ts:30,322`). “Certified” here is the existing engine-domain/validity condition, not competition certification. The native manifest explicitly declares rail friction and tip-off unsupported (`crates/astraea-engine/src/models.rs:747,772`).

**Gap and consequence.** A physical rail length alone does not identify travel to first rotational freedom for a vehicle with guides/buttons. Entering effective travel manually might align the scalar event, but the schema does not distinguish that interpretation, record its measurements, or model the intermediate partially constrained phase. The existing 15 m/s gate cannot establish the cited IREC or NASA rule. This is a confirmed event/input-contract gap; it does not establish how many m/s any particular vehicle is wrong, or imply that release localization itself is defective.

**Bounded next decision.** Define which geometric datum and guide event `railLength` represents, how physical rail length and measured guide positions yield that travel, and whether the first-freedom event is a reported approximation or needs a separate constraint phase. Closure needs surveyed geometry and qualified early-flight timing/speed evidence. Do not replace 15 with a competition number before event equivalence is decided.

## 2. Stability: geometry-only calibers are not a through-burnout history

**Confirmed reporting semantics.** The native `stability` command takes only a vehicle (`src/tauri/bridge.ts:290`; `crates/astraea-engine/src/commands.rs:249`). Its Barrowman assembly uses component mass rollup CG and computes `(CP − CG) / referenceDiameter`, with native flags at ≥1 and >3 calibers (`crates/astraea-core/src/aero.rs:1224,1400`). The live adapter exposes CP/CG in meters and margin in `cal`, with total length and reference diameter (`src/console/data/adapter.ts:165–177`). Its gate is 1–3 calibers (`:33,186`); Verify refreshes that live margin rather than assessing a powered history (`src/console/stages/Verify.tsx:21`). The call does not receive the selected motor or a burn-state trajectory, so it does not establish pad all-up or burnout CG.

A unit conversion is available once compatible datums and geometry are declared:

`marginPercentLength = 100 × marginCalibers × referenceDiameter / totalLength`.

No single caliber threshold equals a fixed percentage across different slenderness ratios. Research identifies IREC minima of 7.5% length for subsonic flight or 10% if supersonic anywhere, through burnout, with maxima of 18% at launch and 25% in flight. The NASA on-pad requirement is separate. Those values are cited rule context, not proposed replacements for the generic gate.

**Flight physics is a separate path.** `prepare_flight_vehicle` carries dry rollup CG and separate body/fin CP/CNα (`crates/astraea-engine/src/models.rs:461,564`). Loads add time-dependent motor mass at its modeled centroid, update combined CG/inertia (`crates/astraea-core/src/six_dof.rs:1296–1335`), obtain a Mach-dependent normal slope/CP (`:1223,1370`) and use `CP − combinedCG` for the static moment arm (`:1445`). The flight therefore does include mass-depletion and Mach effects; absence of a UI history does not prove those effects are absent from the solver. Bounded flight telemetry has no CP/CG/static-margin channel (`crates/astraea-core/src/telemetry.rs:32`; `src/console/data/contract.ts`).

There is also a concrete consistency question: the separate aero-curve API computes CP with fin-planform/transonic corrections plus a documented unvalidated supersonic forward-shift heuristic (`crates/astraea-core/src/aero.rs:1951–1990`), while flight uses its own body/fin slope-weighted CP and supersonic fin-slope degradation (`six_dof.rs:1223`). Aero-curve margins use the fixed component rollup CG (`aero.rs:2268`). Neither a Mach plot nor the live margin can be assumed to equal the production flight moment-arm history.

**Gap and bounded scientific question.** Which CP/CNα definition is intended to govern reported powered-flight stability and the solver's normal moment, and what matched-condition evidence supports it across the intended Mach/AoA range? This specific unresolved question should be resolved before exposing a single authoritative through-burnout minimum. Source inspection establishes differing paths; it does not quantify their disagreement for a collegiate vehicle or justify choosing one by desired trajectory outcome. Required evidence includes measured launch/burnout CG, motor depletion provenance and qualified CP/CNα versus Mach/AoA. Static margin alone does not verify dynamic stability or weathercocking.

## 3. Max-Q: correctly labeled sampled output, with unbounded missed-peak error

**Confirmed semantics.** Loads compute `q = 0.5 × density × airspeed²` from ISA atmosphere and wind-relative velocity (`crates/astraea-core/src/six_dof.rs:1291,1337–1343`). Display telemetry ordinarily records every fifth macro step, additionally every macro step before departure and after apogee (`:2197–2205`); default macro step is 0.01 s (`:1659`). The often quoted 0.05 s cadence is therefore nominal, not a general resolution guarantee. Nonterminal q is rounded to integer Pa (`:2228`); terminal telemetry is separately full precision (`:2265`).

`simulate_flight` enables that recorder (`crates/astraea-engine/src/commands.rs:70`). The DTO then decimates to at most 5,000 points (`models.rs:853`; `crates/astraea-core/src/telemetry.rs:18,103`). It preserves first/terminal samples and nearest samples to native event times, then spends the remaining budget on uniform index stride. It does not explicitly preserve a q extremum. Adapter `toFlightRun` selects the greatest q among the resulting samples and adds a derived event (`src/console/data/adapter.ts:276–281`). Max-Q is not a native localized event, so its later derived event does not cause the decimator to preserve it.

The contract expressly says “Peak among the bounded native display samples, not a continuous-time maximum” (`src/console/data/contract.ts:62`). Both event and result labels say “Sampled Max-Q” (`src/console/data/adapter.ts:220,307`; `src/console/stages/Flight.tsx:100`). That qualification is already correct. Flutter history also identifies native display samples (`src/console/stages/Aero.tsx:96`).

**Gap and consequence.** Sampling, rounding and decimation can miss a sharper peak; no continuous-time peak magnitude/time error bound follows from these contracts. Integer rounding also means the displayed maximum is not rigorously a lower bound on the true continuous peak. No new run here establishes the size or significance of either effect. Solver adaptive integration and localized flight events do not automatically qualify maxima computed afterward from display telemetry. Max-Q alone is not a structural-load envelope: incidence, normal force, geometry, materials and joints matter.

**Bounded next decision.** Keep the sampled name unless a separate native extremum contract is implemented and verified. Decide whether the initial 1.0 promise is exploratory q history or peak-load sizing; the latter needs explicit time/magnitude resolution and matched-condition verification, separately from coefficient/atmosphere error. No cited source supplies a universal allowable percent error. Choose an error budget only from the actual vehicle decision reserve and measurement uncertainty.

## Verification and disposition

This audit used read-only source/research inspection, not new scientific diagnosis runs. No simulations, tests, builds, raw-data/holdout inspection or external actions were performed. Two exploratory searches included nonexistent guessed source filenames and returned exit 2; actual paths were subsequently located and inspected. No absence claim relies on those missing files. Only this Markdown document is changed by the audit commit.

Rail event provenance and reported powered stability are requirements gaps; sampled Max-Q is an honestly named limited-resolution output. None establishes a numerical correction or empirical collegiate accuracy. Next work should resolve the specific output definitions and CP-path consistency question, then qualify them with controlled and measured evidence. Existing domain limits and unsupported physics remain in force; competition review and flight authorization remain outside these generic gates.
