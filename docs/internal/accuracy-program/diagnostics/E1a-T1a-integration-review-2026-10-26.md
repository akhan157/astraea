# Explicit environment and supplied-table integration review

Accepted for opt-in diagnostics after independent coordinator review and native
verification. Base `f387132`; T1a author `54cf906` integrated as `e9f8dd0`, E1a
author `185e5b7` as `ffe2bd6`. Integration registers the environment command and
switches its example from the author's direct wrapper to actual `dispatch_json`.
Neither diagnostic changes existing flight, plots, project migration, calibration,
production atmosphere/friction/drag, frontend, or bundled WASM behavior.

The [environment method](../first-batch-2026-10-26/E1a/method.md) supplies an
immutable tabulated P/T/toward-ENU wind profile with explicit SI units, geometric
MSL altitude, source location/datum, issue/validity metadata, and interpolation/
extrapolation policies. Positive pressure/temperature and finite closure outputs
are computational checks. Log-pressure/linear-temperature/wind interpolation does
not establish hydrostatic consistency, launch weather fidelity, or forecast skill.
The dry ideal-air/constant-gamma/Sutherland closure explicitly identifies the
existing source constants and its assumptions. Humidity/composition are omitted.
The module computes ground-minus-wind, speed/Mach/q, local Re/m and per-surface
Re and roughness/length without inherited velocity/length/Re floors. Zero airspeed
returns zero flow quantities; nonzero-flow arithmetic underflow and nonfinite
results fail. Caller evidence classes never promote empirical status.

The [supplied-table method](T1a-supplied-static-table-diagnostic-2026-10-26.md)
requires complete canonical P0 body force and independent moment vectors at every
Mach/alpha node. It preserves arbitrary pure couples with zero force. Full source/
target datums and explicit reference normalizations use the reviewed core wrench
utilities; wind coefficients are a transform of the total force, never another
added drag. Bilinear weights/brackets are exposed, including exact nodes. Identity,
fixed beta0/rates0/roll/Re-per-meter/power-nozzle conditions and grid boundaries are
checked without fuzzy matching, extrapolation, fallback, or missing-data filling.
Reference diameter is metadata; area is not inferred from it.

Review caught the initial API-proposal velocity-axis typo before implementation:
beta0 means `(0,V*cos(alpha),V*sin(alpha))` in the +Y-forward body frame. It also
required finite-positive reference conversion factors so an underflowed S ratio
cannot silently erase the wrench, and required finite sample wind and underflow
guards in E1a. These guards are numerical policies, not empirical tolerances.
No existing core force/moment equation was changed. Independent review checked
the full moment translation sign, source/target S/L scaling, wind signs, grid
indexing, endpoint policies, raw-input retention, metadata/status separation and
invalid input paths.

Verification at the integrated source passes:

- **142 core tests:** 134 retained and eight environment tests, including analytic
  interpolation/closure, time/altitude bounds, wind-from cardinal signs, zero flow,
  local surface scaling, and extreme arithmetic.
- **55 engine tests:** prior 39, five environment wrapper tests now in the engine
  library, and 11 supplied-table tests. All example targets compile.
- Ordinary native builds for both examples, then **15 independent executable
  cases** through their real JSON dispatch routes. The checker independently
  evaluates the bilinear interpolation and dimensional moment cross product,
  changes references and an off-axis datum while preserving loads at CG, retains
  a pure couple with zero force, and rejects missing moments/conditions/units/
  datums/expired profiles and underflowing reference conversion.

The [native result](E1a-T1a-native-boundary-check-2026-10-26.json) also records a
synthetic cross-route case: E1a supplies density, speed, Mach and Re/m to T1a. An
isothermal constant-wind profile changes pressure fourfold, keeping speed and Mach
fixed while changing Re fourfold. T1a accepts the matched synthetic fixed-Re case
and rejects the changed-Re case at the same Mach. For this test only, the synthetic
table's fixed Re is explicitly assigned from the first environment evaluation.
Its angle is independently supplied; this is not an attitude or trajectory adapter,
source calibration, or physical validation of the synthetic coefficient values.

The E1a author initially encountered a missing ignored standalone core Cargo.lock
with `--locked`; offline resolution from the existing cache was used without any
manifest or committed engine-lock change. Core has no runtime dependencies. T1a
corrected two test expectations (JSON integer/float structural equality and a
force expectation omitting S=2), then strengthened a fixture with a bilinear cross
term. Passing and failed-attempt evidence is retained. Rustfmt is unavailable;
no installation was attempted. Diff whitespace, Python syntax, new JSON and local
method links pass. No repeated N1, frontend/browser or updater study was needed.

Reproduce from the checkout after sourcing `/workspace/astraea-plan/env.sh`:

```sh
CARGO_BUILD_JOBS=1 cargo build --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --example environment_diagnostic --example supplied_aero_diagnostic
python3 scripts/diagnostics/check-environment-table-boundary.py crates/astraea-engine/target/debug/examples/environment_diagnostic crates/astraea-engine/tests/fixtures/environment-synthetic-request.json crates/astraea-engine/target/debug/examples/supplied_aero_diagnostic crates/astraea-engine/tests/fixtures/supplied-aero-diagnostic-request.json
```

Source/lock/binary/evidence hashes, logs, and full actual-dispatch responses are
retained at `/workspace/astraea-plan/evidence/environment-tables-integration-20261026`;
author evidence remains in `environment-20261026` and `supplied-aero-20261026`.
Two bounded Sol/high agents authored independent files; the coordinator reviewed
and integrated them. Source metadata are caller identifiers, not geometry/source
hashes or qualified cache identities. Parsed JSON retains values, not original
text formatting or duplicate-key history.

These are unqualified diagnostic APIs. T1a accepts canonical complete tables,
not arbitrary RASAero/OpenRocket/vendor CSV. In particular an export missing
independent moments is insufficient here. Software grid coverage, including
bilinear interpolation across transonic points, does not establish measured
coverage or accuracy. E1a does not yet feed trajectory or friction; T1a has no
Re/roll/beta/power interpolation or rates. Source adapters and coefficient source
qualification, a reviewed local-state friction provider, shared flight/plot
integration, model identity/migration/calibration invalidation, and external
as-flown/team/platform evidence remain open. No source geometry was silently
simplified, new flight outcome inspected, push, publication or deployment made.
