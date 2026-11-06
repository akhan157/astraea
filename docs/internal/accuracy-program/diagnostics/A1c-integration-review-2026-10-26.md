# SB1 diagnostic boundary: integration review

The coordinator independently reviewed the diagnostic implementation against
P0 and the accepted A1a/A1b library APIs. This packet makes the existing static
coefficient evaluator inspectable through one explicit JSON command. It does
not activate a new flight or plot provider, migrate saved projects, transfer
calibrations, or establish a validated operating envelope.

The input requires explicit adapter declarations, quadrature, interpretations,
source identity, prescribed CA0 and its identity, body flow/rates, CG, full
moment datum, environment identity, power/nozzle condition and CP policy.
The boundary checks unknown vehicle/component/point keys before the existing
permissive DTO deserializer can discard them. Known fields, including mass
metadata unused in this static geometry calculation, remain in the parsed
input record. Parsed JSON is retained; original textual bytes and duplicate-key
history are not preserved. Caller identifiers are not cryptographic hashes.

The reviewed route calls the single core `evaluate_static` implementation;
there is no second coefficient law, automatic legacy-drag lookup, unmodeled
rate correction or fallback. Force/moment references and signs are explicit.
Static datum and CG coefficient wrenches are separate; dimensional loads are
labeled static. Undefined zero-speed flow coefficients are null with a reason,
while dimensional static loads are zero. Rate loads and total dynamic loads
remain null even when the supplied rates are zero. Derivative CP remains a
separate zero-incidence diagnostic with retained C/J and the named cancellation
policy; an interval containing zero suppresses the ratio, without deleting loads.

`environmentIdentity` records caller provenance. Supplied density and Mach do
not establish a physically consistent atmosphere, viscosity, local Reynolds
number or launch-weather fidelity. That remains E1 work. Prescribed scalar CA0
is neither a complete coefficient-table importer nor qualification of a source
export. T1 coverage/axes/power/source guards remain open. Source-geometry
eligibility remains subject to the A1b decision; ARCAS lip/anchors/ogive cannot
be silently removed for a claimed native-model comparison.

The native `sb1_diagnostic` example accepts the full command argument JSON from
a file and exits nonzero for rejected evaluations. It provides a reproducible
inspection path without a GUI or production WASM rebuild. Its synthetic fixture
is implementation evidence only. The independent Python boundary checker calls
that executable, checks a mixed-incidence wrench with off-axis datum and CG by
an independently assembled cross product, translates the datum and checks
invariant loads, and checks unknown fields, absent declarations, Mach/incidence/
forward-flow limits, zero speed with nonzero rates and CP uncertainty semantics.

Accepted for the diagnostic scope after review. Author commit `2495b76` was
integrated as `f439f4a`; the coordinator added the native example and independent
boundary checker. The integrated offline `cargo test --all-targets` run passes
**39 engine tests** (31 existing, 8 new), and compiles all example targets.
The ordinary native example build passes, and the independent executable checker
passes **11 cases**. The retained [check result](A1c-native-boundary-check-2026-10-26.json)
and [synthetic response](A1c-synthetic-response-2026-10-26.json) are reviewable
implementation evidence. No new trajectories or observed outcomes were run by
the independent checker; existing parity tests retain their synthetic fixtures.
Core math and legacy engine commands are unchanged from `d612ce5`. Their existing
core verification is retained; no repeat of the completed N1 study or broad
frontend/browser/native-updater studies was needed. No frontend or WASM asset
was rebuilt. Rustfmt is unavailable in the installed toolchain; diff whitespace
checks and Python syntax checks pass. The author corrected one initial test-only
ambiguous float type; the failed compile log remains with the passing log.

Reproduce from the checkout after sourcing `/workspace/astraea-plan/env.sh`:

```sh
CARGO_BUILD_JOBS=1 cargo run --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --example sb1_diagnostic -- crates/astraea-engine/tests/fixtures/sb1-diagnostic-request.json
python3 scripts/diagnostics/check-sb1-diagnostic.py crates/astraea-engine/target/debug/examples/sb1_diagnostic crates/astraea-engine/tests/fixtures/sb1-diagnostic-request.json
```

Logs, source/binary/evidence hashes and the original response are retained under
`/workspace/astraea-plan/evidence/sb1-diagnostics-20261026`. This does not claim
that the bundled production WASM currently exposes this command; it will enter a
future build only when explicitly rebuilt. Next work remains provider identity/
migration and shared flight/plot integration with unchanged legacy defaults,
E1/T1 interfaces, and matched source geometry/data qualification. No push,
publication, deployment, external contact or protected outcome access occurred.
