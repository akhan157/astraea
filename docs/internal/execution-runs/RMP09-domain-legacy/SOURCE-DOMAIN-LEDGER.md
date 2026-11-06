# RMP09 C06/C08 source, equation and domain ledger

Base `82c595df544dcdb883ca2fe81274bff7c4664a50`. Read-only source inventory with
line anchors valid at that snapshot. No production code, physics or threshold was
changed by this lane; only tests and these records were added.

## 1. Legacy assembly (`flight-signed-normal-plus-wind-drag-v1`)

Source: `crates/astraea-core/src/six_dof.rs::compute_flight_loads` (:1718-1894),
driver `simulate_driver` (:2110-2896), folding helpers `fold_prefix` (:3013-3029).

| Condition family | Legacy declaration | Anchor |
| --- | --- | --- |
| Terrain datum | Navigation position `z` is AGL only; one scalar `launch_altitude_asl` offsets the atmosphere. There is no terrain-elevation field, geoid/MSL conversion or terrain collision model; `z<=0` is touchdown at the pad datum. | driver `:2110`, `stage_mechanics` offset use in `:1718` |
| Atmosphere altitude | ASL branch: `>100 km` Unsupported, `>20 km` Extrapolated (ISA-1976 power law). | `:1789-1798` |
| Forward flow | Tail-first airframe flow (`rel_body.y<0` and `-y>=lat_speed`) Unsupported while aero force is not negligible; a live canopy exempts the branch. | `:1816-1826` |
| Incidence envelope | Free-flight airframe incidence `>30°` Unsupported, `>15°` Extrapolated; forced to `0` under canopy, on the rail, or below the aero-negligibility bound. | `:1800-1812` |
| Mach envelope | `>6` Unsupported, `>4` Extrapolated (full legacy assembly; no finite-angle law). | `:1806` |
| Canopy | Declared constant `Cd` on `pi/4 d^2`; `Mach>2` Unsupported, `Mach>1` Extrapolated; airframe normal force and static moment arm disabled while live (`recovery`). | `:1778-1787`, `:1846-1850` |
| Zero speed | `airspeed<=1e-6` skips normal-force direction; axial force uses the retained 1e-6 floor; rate couple is `∝ V` and `∝ q_inf`, so at `V=0` it is silently zero even for nonzero rates. No zero-speed rate model, no refusal, no division by `V`. Frozen legacy behavior, unchanged. | `:1826-1850` |
| Omitted physics | No inflation/opening-shock, no multibody/suspended sections, no terrain profile, no canopy opening dynamics. Nothing in this lane added such capability. | `:1244-1250`, `:1779` |
| Flag folding | `saw_unsupported`/`saw_extrapolated` are cumulative; committed probe prefix folded only for dense steps with `t0 < tau`, rail-exit read folded, macro read folded per step, final last-probe fold on the non-touchdown path. Terminal display read is explicitly NOT folded. | `:2362-2368`, `:2496-2499`, `:2669-2672`, `:2852-2865`, `:3013-3029` |
| Summary status | `UNKNOWN` if `saw_unsupported`; `UNKNOWN` if not terminated/nonfinite landing/not nominal/off-nominal/not enveloped; `PASS` only terminated + nominal + on-nominal + enveloped. | `:2852-2865` |

Consequence tested: a committed airframe-domain classification reached during
free-flight ascent is retained by the cumulative flags even though the later
canopy branch classifies its own stages as `Valid`.

## 2. Candidate composition (explicit only)

Source: `crates/astraea-core/src/flight_provider.rs::compose` (:802-1035),
`run_bounded_with_controls` (:1188-1284), `crates/astraea-core/src/flight_provider/profile.rs`.

| Condition family | Candidate declaration | Anchor |
| --- | --- | --- |
| Activation | Only a caller-built `PreparedCandidate` plus `run_bounded`/`query`/`curves`; identities `candidate-static-rate-composition/1.0.0` or `candidate-static-rate-profile-composition/1.0.0`. No dispatch/default/project activation. | `:36-47`, `:1161-1190` |
| Terrain datum | Candidate `z` remains AGL; atmosphere altitude is `launch_altitude_asl + z` (retained mode) or launch geometric MSL + `z` with an exact vertical-datum identity match (profile mode). Negative covered MSL allowed in profile mode; no geoid inference. | `profile.rs:62-73` |
| Altitude support | Retained ISA enforced at the instantaneous altitude `0..=20 km` ASL; profile mode defers to actual E1 tabulated coverage and rejects outside it. | `profile.rs:100-118`; covered by `profile_coverage_never_gets_a_zero_speed_rail_canopy_or_negligibility_waiver` |
| Airframe support | `Mach < 0.8` is enforced by geometry evaluation before the force bound. Forward flow and incidence `<=5°` apply above the versioned `1e-6`-of-weight static-aero bound, including rail states; at/below it the candidate reports `StaticLoadsBelowAeroNegligibility`, zero dimensional static aero loads and absent flow/coefficient observations. This declared numerical approximation is not validated incidence/flow support. Profile coverage and zero-speed nonzero-rate refusal still apply. | `aero_negligibility`, `compose`, `AERO_NEGLIGIBILITY_POLICY_ID` |
| Canopy | Declared constant canopy Cd, `Mach <= 1.0` inclusive on the computed stage Mach, checked before negligibility; airframe coefficients reported N/A without fallback. | `:53-55`, `:822-826`, `:875-890` |
| Zero speed | Exactly-zero airspeed with zero rates: supported zero dimensional loads, flow/coefficients absent with reasons. Exactly-zero airspeed with nonzero rate: `UnsupportedDomain` ("no separately identified zero-speed rate model"). | `:832-836`, `:900-930` |
| Failure mode | An unsupported evaluation aborts with a structured record (model, phase, speculative flag, time, state, reason); there is no legacy fallback or fabricated qualified prefix. The separately identified below-bound zero-load approximation is an explicit computational status, not an evaluated unsupported flow coefficient. | `run_bounded_with_controls`, `compose` |
| Omitted physics | No terrain-profile, multibody, inflation or opening-shock model; recovery remains a declared constant-Cd drag plus the inherited rate couple. | `LIMITATIONS` `:87-101` |

## 3. Cross-model policy notes (observed, not changed)

- The legacy canopy branch ignores airframe incidence at a live canopy (correct
  for its own branch) and classifies canopy Mach itself; the summary flags are
  cumulative, which is what keeps an earlier ascent excursion visible.
- Candidate sonic support is evaluated on the computed stage Mach: a state whose
  ground speed equals the local sound speed reports `mach == 1.0` and is
  supported; the next representable higher speed reports `>1.0` and is refused.
- Legacy silently returns a zero rate couple at `V=0` with nonzero rates because
  the retained damping term is `∝ V`; the candidate refuses that state instead of
  inventing support. Both behaviors are preserved, not unified.
