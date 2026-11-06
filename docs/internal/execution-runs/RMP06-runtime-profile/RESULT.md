# RMP06 runtime profile + report-band fixes — author result

Status: implementation complete for C1–C5 at `02a8a83` on branch
`rmp06-runtime-profile` (base `24fc8dc`). **Not self-accepted**; awaiting the
coordinator's review and the sequential app migration. No `src/**`,
`scripts/**`, manifest, lock, execution-package or coordination-doc edit was
made; the app was not built and no browser was run.

## Commits

| Commit | Scope |
| --- | --- |
| `1fa2630` | C1 reference-Mach identity sampling in `flight_provider::curves` |
| `8f07b6c` | C2 `curves_with_applicability`, grid-before-applicability, report 3.0.0 union |
| `ac05caa` | C3 collection cap, report subset, `trajectory.retention`, research control |
| `d1fb283` | C4 profile envelope dispatch on native and wasm32, cfg removal, metadata |
| `02a8a83` | declared `resource_limit` classification for the collection cap |
| (this commit) | C5 lane records |

## What changed

**Reference-Mach identity sampling.** A requested Mach bit-equal to the measured
reference Mach is the reference flow state, so that curve point is evaluated from
the reference stage's own `rel_body`/`airspeed`/`q_inf`/`mach` and its own E1
observation instead of the `(rel/V)*(M*a)` reconstruction. Predicate is exact
`to_bits()` equality; every other point keeps the reconstruction unchanged. The
comparison predicate (`wrenches_bitwise_equal`) and `wrench_near` are untouched;
no epsilon was added.

**Curve applicability.** `curves_with_applicability` returns
`Computed(points)` or `NotApplicable { reason_id, reason, reference_time_s,
drogue_deployed, main_deployed }`. Order: time/state finiteness → attitude
normalization → **grid validation** (≤1024 samples, finite, ≥0, <0.8) →
canopy-live N/A → `prepared.stage` errors propagate → zero-airspeed N/A →
per-point evaluation errors propagate. `curves()` still returns `Err` for both
N/A states with the accepted message text, so no accepted caller changes meaning.

**Report 3.0.0** (`astraea-native-candidate-report/3.0.0`,
`astraea-native-profile-candidate-report/3.0.0`): `curves.status`/`policyId`/
`notApplicable` with `points: null`, and
`equivalence.curveComparison { status, matchesReferenceSample, reasonId }`
(`null`, never `false`, when not applicable). The not-applicable case adds a
`limitations` entry naming the reason, so it cannot be read as "computed and
empty". `astraea-bounded-candidate-result/1.0.0` is unchanged.

**Retention.** `candidate-committed-sample-collection-cap/1.0.0` refuses the run
when a further macro sample would exceed 50 000, with the policy ID and limit in
the message and `resource_limit: true` (no evaluation record, no phase label).
The report carries at most 5 000 samples under the accepted app policy
`candidate-archive-display-samples/1.0.0` (mandatory first/final, observed-prefix
peak and event-bracket context, then an evenly spaced fill; refusal if the
mandatory context alone exceeds the cap) and declares
`trajectory.retention { policyId, mode, sampleCount, retainedSampleCount,
collectionCapId, collectionCap }`. Prefix peaks remain exact over every committed
sample. Full-sample research capture exists only as the native-only
`candidate-native-sample-retention/1.0.0` control (`declaredFull`, hard ceiling
250 000), refused by dispatch in every JSON shape including a nested candidate
object.

**Profile envelope dispatch.** `simulate_candidate` accepts exactly one
`request`: untagged runtime request (absent `schemaId`) or
`native-E1-profile-candidate-request/1.0.0`. Any other tag is refused with the
accepted set; a malformed envelope is refused as an envelope and never re-read as
untagged. The wasm32 gates on `profile_candidate` and
`environment_diagnostic::parse_profile_with_input` are removed, so the production
worker runs the same typed E1 evaluation. The envelope string keeps its
historical "native" wording because it is inside the hashed content-identity
preimage.

## Checks that actually ran

| Check | Command (abbreviated) | Result |
| --- | --- | --- |
| Core suite | `cargo test --offline -p astraea-core --lib` | 227 passed, 0 failed |
| Engine suite | `cargo test --offline -p astraea-engine --all-targets` | 110 passed / 23 targets, 0 failed |
| Legacy preservation | `legacy_flight_snapshot RMP12-candidate-controls/LEGACY-INPUT.json` | `1c1e0f41…` before **and** after, two runs each |
| Untagged diff vs `24fc8dc` | `enumerate_diff.py` | exactly the six declared rows + (fixture-dependent) reference-Mach point; 0 undeclared; samples and `contentIdentity` identical |
| Determinism | each probe twice | byte-identical for plain, incidence16, profile, profile-wind, legacy |
| Production WASM | `cargo build --release --locked --target wasm32-unknown-unknown` (same flags as `build-engine.mjs`) | 1 876 901 bytes, sha256 `0007768851f2e18da753ec5ec24af11022fdbb6d65f6cab23130f98ddd6705a3`, crate-local target dir, no copy into `src/engine` |
| Native/wasm parity | throwaway Node host over the documented ABI | 5/5 error replies byte-identical; success replies differ only in platform-libm last bits (0 non-numeric differences; max relative 3.26e-11) |

The app asset `src/engine/astraea_engine.wasm` was left untouched
(`13da44d5…`, 1 827 128 bytes).

## Failing-before evidence (24fc8dc, verbatim)

Curve mismatch at a nonzero-incidence reference (base fixture at horizon 1.6 s):
`curveMatchesReferenceSample=false`, `queryMatchesReferenceSample=true`, reference
Mach `0.06754335170208796`, alpha `-0.26670266147452665` deg, datum bit indices
`[2,3]` and CG `[2]` differ. After C1: both `true`, zero differing bits, only the
reference-Mach point changed, every other point byte-identical.

Curve seam at 24fc8dc: a canopy-live or zero-airspeed reference returned
`UnsupportedDomain` from `curves()`, and the wrapper's `curves(...)?` turned that
into a failed command; the grid was **not** validated first (canopy-live +
`Mach 0.9` returned the canopy refusal). After C2 the grid refusal wins and the
not-applicable states are data. Both texts are reproduced in `EVIDENCE.json`.

## Deviations from the review's suggested fixtures (evidence-backed)

1. **No wind-bearing *candidate* fixture.** Nonzero retained wind is refused at
   `t=0` by the candidate forward-flow support check
   (`… at t=0 s (committed-macro-sample; speculative=false)`), so the reviewer's
   suggested wind fixture cannot exist on the non-profile path. The failing-before
   case uses the same fixture at a 1.6 s horizon, which is a genuine
   nonzero-incidence (alpha ≈ −0.27°, beta exactly 0 by planar symmetry) supported
   state — non-vacuous and generic. Item-j's wind-bearing requirement is met on
   the profile path, where the E1 profile supplies a cross wind aloft with zero
   wind at the launch altitude (`profile-candidate-request-wind.json`: incidence
   0.2732°, beta −0.0320°).
2. **A flown canopy-live reference is unreachable.** Four fixture variants
   (rail 1 m / 3 m, larger fins, steps 1e-3 and 5e-4) all refuse at the apogee
   transition, which matches the accepted RMP01 finding that a candidate
   touchdown trajectory is unreachable under SB1 forward-flow support. The
   not-applicable report path is therefore proven at the exact production seam
   with a real committed sample whose flags are set, plus a real
   exactly-zero-airspeed first committed sample.
3. **Native/wasm byte parity holds for error replies and all non-numeric
   content, not for success-reply floats.** Untouched legacy code also differs
   between native and wasm on this host (burnout altitude and near-zero
   telemetry), so this is a pre-existing platform-libm property, inside the
   standing 1e-9 native/WASM precision. Exact parity was not manufactured by
   rounding anything.
4. **`equivalence.note` kept its accepted text.** An experimental rewording was
   reverted so the untagged diff contains exactly the six declared rows.

## Residuals

- **Legacy display telemetry** (`six_dof.rs` `record_telemetry`) is unbounded
  internally (one point per macro step before rail exit and after apogee; bounded
  only by the 5 M macro cap, then decimated for the wire). The candidate path sets
  `record_telemetry=false`, so `simulate_candidate` cannot reach it. Not fixed
  here because that would change accepted legacy output; reopening trigger: a
  separately reviewed legacy reporting migration.
- **Moment-arm history** keeps its declared 5 000 cap with a typed refusal and is
  legacy-only; unchanged.
- **`serde_json` without `float_roundtrip`**: re-parsing a 17-digit decimal can
  move one ULP, so whole-report text round trips are not an equality proof.
  Native/wasm comparisons use serialized strings; internal comparisons use values.
- **App migration pending** (coordinator): `src/application/candidateResult.ts`
  (schema ids, `curves` union, `curveComparison`, `retention`, sample-count
  source), `src/console/store.ts:633`, `src/formats/projectJson.ts:55,1128`,
  `src/formats/projectStorage.ts`, archive `2.0.0` writer with the `1.0.0`
  reader retained, `src/console/stages/Candidate.tsx:386,388-390` and
  `Build.tsx:116-117`, fixtures/tests. Project schema stays `1.12.0`.

## Evidence

`EVIDENCE.json` in this directory carries the exact commands, hashes, contract
ids, failing-before texts and per-amendment dispositions. Raw probe outputs,
parity replies and the throwaway harnesses live outside the repository at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp06-runtime-profile/` (not
committed). Throwaway fixture scans were removed after capture; the two
throwaway Rust probe crates were removed as well.
