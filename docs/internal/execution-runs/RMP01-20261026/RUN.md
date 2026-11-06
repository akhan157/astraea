# RUN RMP01-20261026 — WIP recovery choice and dispatch state

## Observed state at dispatch (read-only preflight)

| Item | Observed |
| --- | --- |
| Branch / head | `execute-rmp01-package-c80e7d3` at `c80e7d3` = remote `delivery/integration-20261024` head |
| Dirty state | clean (`git status --porcelain` empty) |
| Package validator | `pass` (exit 0, 18 packets, 117 acceptance checks, 0 cycles) |
| Worktrees | 8; none other than this one on the dispatch branch; no active engineering agent |
| Old automation | not running; not re-enabled |
| Toolchain | rustc/cargo 1.99.1 (via `~/.cargo/bin`), node 26.11.1, pnpm 12.14.0, python 3.14.8 |
| Offline cache | serde/serde_json present; core and engine build offline |
| Host | 11 GiB available RAM, swap ~0; one Cargo job allocated |

Legacy preservation baseline captured **before** any edit, from the untouched
base with the longstanding synthetic Estes Alpha/C6 telemetry-parity request
(`wind0` case): 1 969 393 bytes, SHA256
`f37d195fc903e3599603706a9e3f6b95b152d7a79b4639a31f50fa4f64972249`. This matches
the hash recorded by the E1b/A1d-1 review independently, so the migration base
still reproduces the accepted legacy behavior.

## WIP recovery decision

WIP-RECOVERY offers (A) reuse reviewed hunks of
`wip/candidate-flight.patch` or (B) implement cleanly from the accepted design
while retaining the patch/branch as provenance. **Decision: (B) clean
implementation, reusing only the reviewed visibility intent.**

Reasons, from inspecting the patch against the current source:

1. The patch's only real content is `pub(crate)` visibility for
   `atmosphere_at`/`wind_vector_at`/motor helpers/`DriverLoads`/`LoadContext`/
   `LoadPhase` plus a `simulate_driver(horizon)` wrapper. It declares
   `pub mod flight_provider;` but contains no provider, query, curve, result or
   test — nothing to reuse beyond the visibility direction.
2. Its horizon control is incorrect: `t = min(t + dt, horizon)` followed by
   `if t >= horizon { break; }` exits **before** integrating the final bracket
   `[horizon-dt, horizon]`, so the final committed state/time disagree (the exact
   trap called out by RMP01/WIP-RECOVERY).
3. It returns `SimulationResult` with legacy `PASS`/landing fields for a bounded
   prefix, which `RMP01-C10` forbids.
4. It declares a final `LoadContext` with `LoadPhase::TouchdownSample` regardless
   of termination, and exposes driver internals by `pub(crate)` fields without a
   narrow bridge function.

`git apply --check` was therefore not used to apply anything; the patch and the
`engineering/candidate-flight-20261026` branch remain untouched provenance. The
visibility direction it proposed is re-derived in this lane together with the
missing provider, with a narrow `pub(crate)` bridge function instead of raw
field access where practical.

## First bounded assignment

Implement RMP01 subcommits 1–5 as recorded in `ASSIGNMENT.md`. The first
end-to-end increment is the engine-native DTO -> SB1 adapter -> prepared
candidate object -> bounded synthetic ascent with query and curve samples.

## First implementation increment and independent review

Source commits after the lease record (all on `execute-rmp01-package-c80e7d3`):

| Commit | Content |
| --- | --- |
| `0ae1d8e` | shared mechanical/flow carrier, canopy law and rate-couple extraction (legacy output byte-identical) |
| `f5ea5c5` | candidate-only exact-horizon bridge and final committed-state capture |
| `7f37a1f` | core `flight_provider` prepared object, query, curves, bounded result/error schema, tests |
| `aa4d9fd` | engine-native DTO helper, example, bounded fixture, boundary tests |
| (this increment) | review-driven fixes: aero-negligibility policy, attitude/altitude/motor validation, parachute completeness, INTERFACES policy note |

An independent read-only review was requested after `aa4d9fd` (Codex CLI,
read-only sandbox, default model, no edits/tests by the reviewer; full output in
the external evidence directory as `independent-review-codex.txt`). Disposition:
**ACCEPT WITH REQUIRED FIXES**. Findings and resolutions:

1. *Blocking — the earlier fixed 1e-2 m/s flow-direction floor admitted reverse
   flow below it.* Resolved by deleting the speed floor and replacing it with a
   versioned, per-state **aero-negligibility** approximation
   (`candidate-aero-negligibility/1.0.0`): zero dimensional aero loads only when
   the maximum possible static force (or declared canopy drag) is at most `1e-6`
   of the instantaneous weight, with an explicit error bound and no flow
   observation; every state above the bound is fully support-checked. The
   categorical "no waiver" claim was replaced by the precise scope, the policy
   was added to `INTERFACES.md`, and the engine support-policy report states it.
   Curve points report the bound per point; they retain static coefficients for
   their explicit caller direction.
2. *Blocking — legacy motor validation does not reject nonfinite masses or a
   zero-impulse curve.* Resolved with candidate-specific validation (finite and
   physical dry/total/propellant masses, max thrust, finite positive integrated
   impulse) before the shared primitive; tests cover NaN masses and an all-zero
   curve. Legacy validation is unchanged.
3. *Blocking — non-unit quaternions could produce a nonorthogonal frame.*
   Resolved with the shared `near-unit-quaternion/1.0.0` policy (`| |q|-1 | <=
   1e-6`, normalized once, otherwise refused) used by query, curves and
   trajectory composition; a test covers a normalized near-unit input and a
   clearly non-unit input.
4. *Should-fix — the atmosphere domain was checked only at launch.* Resolved by
   enforcing instantaneous altitude `0..20 km ASL` in composition and curves,
   with query/curve tests above the limit and below ground and a supported
   19 km case.
5. *Should-fix — an incomplete declared parachute could silently become absent.*
   Resolved in the engine helper: a declared chute must carry finite positive
   diameter and finite nonnegative Cd, otherwise preparation errors with the
   component ID; a fixture mutation covers the refusal.

The reviewer did not run builds or tests; the coordinator re-ran the suites and
the byte-identical legacy snapshot after the fixes.

### Re-review outcomes

- Pass 2 (focused): findings 2–5 resolved; finding 1 not accepted because the
  canopy path still inherited the legacy 1e-6 m/s force floor, the negligible
  branch bypassed the canopy Mach support check, and a stationary canopy reported
  the negligibility status instead of the zero-speed status. Three new findings,
  all fixed in `f69a311`: the shared axial-force helper now takes an explicit
  caller speed floor (legacy 1e-6, candidate 0.0), canopy Mach support is
  enforced before the negligibility branch, and exactly-zero canopy status takes
  precedence. A regression test covers all three.
- Pass 3 (focused): **ACCEPT**, all three resolved, no new findings.

Final state: source `f69a311`; core 170 tests, engine 65 tests, legacy snapshot
byte-identical (`f37d195…`), native report `a8b08cc…`. Packet RMP01 is accepted
for its bounded native scope; physical/empirical qualification remains open.

## Tracker, package and snapshot bookkeeping

- `docs/internal/execution-package/acceptance-register.json`: the 14 RMP01
  checks are recorded `pass` with source SHA `f69a311`, the run evidence path and
  `reviewDisposition: approved`; all other packets remain `not_run`.
- `packet-index.json` and the roadmap tracker record RMP01 as the accepted
  bounded native increment with the pinned dispatch base; `STATE.md` adds the
  accepted row and states that physical/empirical/qualification claims remain
  open.
- `INTERFACES.md` records the versioned numerical policies added during review
  (aero-negligibility, near-unit attitude, instantaneous atmosphere support,
  candidate motor validation). The frozen frames/signs/result semantics were not
  changed.
- Manifest `packageFilesSha256` refreshed for the current package files per
  `MANIFEST-MAINTENANCE.md`. Default validator: `pass`, 18 packets, 117 checks,
  14 recorded pass, 136 local links, 0 dependency cycles, 41 package hashes.
- `validate-package.py --snapshot` now reports an **expected** historical
  difference for exactly the three authorized source files:
  `crates/astraea-core/src/lib.rs` (module registration),
  `crates/astraea-core/src/six_dof.rs` (seam/extraction/horizon bridge) and
  `crates/astraea-engine/src/lib.rs` (native-only module registration).
  `acceptedSourceSha256` was deliberately **not** reset: that historical
  snapshot is a migration baseline, and refreshing it is a separate
  owner/package decision.
