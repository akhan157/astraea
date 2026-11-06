# RMP08-C04 — regime-transition audit (bounded candidate scope)

Status: **documentation/source audit only.** No new test and no production code
change were made for this check. This is not a transonic qualification.

## Requirement

RMP08 packet C04: “Any blend is source-justified and bounded; unsupported gaps
remain unsupported; no smoothing across absent transonic evidence.”

## Candidate implementation

- The frozen contract says the initial candidate is evaluated only for
  `0 <= Mach < 0.8`, forward flow and `incidence <= 5 degrees`; an unsupported
  state returns a reason and no SB1 coefficients, with “no automatic
  blend/fallback to the legacy law” (`P0-contract.md:121`).
- `flight_provider.rs` imports only `aero_coefficients` (`:23`) and its module
  header declares “no fallback/blending” (deliberate absences, `:19–21`). It
  never imports `aero.rs`.
- `aero_coefficients::validate_mach` refuses `!(0.0..0.8)` with
  `UnsupportedDomain` (`:269–272`). `evaluate_static` refuses reverse flow or
  `incidence_rad > MAX_INCIDENCE_RAD` (5°, `:12`, `:378`).
- Existing behavioural tests already pin the consumer-visible boundary:
  `candidate_support_limits_fail_at_every_applicable_stage`
  (`flight_provider.rs:1786`) checks 0.799 supported, 0.8/0.9/1.2 refused,
  5° supported / 5.0001° refused, reverse/lateral flow refused, and a real run
  with an unsupported initial crosswind stopping with a structured record.
  `aero_coefficients` tests (`:566–570`) check 0.799999999 supported and
  0.8/1.0 refused. No duplicate test was added.

## Legacy transonic blends (disclosed, not candidate-qualified)

`aero.rs` contains smoothing/transition terms used only by the frozen legacy
assembly:

| Function | Anchor | Disclosed provenance |
| --- | --- | --- |
| `transonic_fin_lift_slope_ratio` | `aero.rs:1582` | PG subsonic / Ackeret supersonic branches; feeds legacy CP migration |
| `compute_nosecone_wave_drag` | `aero.rs:1610` | 0.8/0.9 cubic spline and shape factors; comment says no primary source was located — “Unvalidated” |
| `compute_base_drag` | `aero.rs:1809` | C1 transonic spline, 0.38 peak; comment calls every coefficient a “project-authored fit… Unvalidated” |
| `compute_mach_dependent_cp` | `aero.rs:1950` | 0.45-caliber aft shift; comment says unvalidated in sign and magnitude against the ARCAS record |

Those paths are reached from the legacy `compute_flight_loads`/`aero`
preparation, whose preservation is accepted under RMP09-C08. They are not
routed into the candidate. They remain legitimately unqualified and are not
made supported by this audit.

## Disposition

- **Candidate scope:** no blend exists; the unsupported gap is refused rather
  than smoothed. A bounded C04 statement for the candidate is defensible.
- **Whole-model scope:** the legacy transonic drag/CP blends remain unvalidated
  and are disclosed above. C04 does not qualify them and does not close
  transonic accuracy.
- No register status is proposed here; the coordinator owns acceptance.

## Falsifier

Any of the following would invalidate this audit:

1. a candidate `Supported` result at `Mach >= 0.8` or `incidence > 5°`;
2. a call from `flight_provider` or `aero_coefficients` into an `aero.rs`
   transonic/CP function;
3. a source claim that actually bounds the legacy 0.8/0.9 or 0.45-caliber fits;
4. a clamp/blend mutation that keeps the existing boundary tests green (they
   assert refusal, so such a mutation must fail them).
