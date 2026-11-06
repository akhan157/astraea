# RMP10b — recorded recovery interval and valid landing comparisons

Exact base59700ee85c4c832784b37f6e8ddca4a351390584, existing
execute-rmp01-package-c80e7d3 / furry-fish. Author/coordinator current Sol/high;
serial independent supplied-source MiMo/medium review after regression-first fix.
No other task owner/process; RMP10a source/compute lease released. .pi untracked.

## Current source finding and accepted routine UI contract

Recovery.tsx computes `(touchdown?.t ?? 0) - (apogee_drogue?.t ?? 0)` under
“Descent time”. Core six_dof.rs ApogeeDrogue branch explicitly distinguishes
physical peak (summary apogee_time, stashed peak) and recovery activation marker.
These are not interchangeable. Missing events currently fabricate0/negative
intervals. Flight.tsx hides non-nominal landing values but unconditionally renders
landing numeric deltas, including against a previous non-nominal run. Those
comparisons can look like valid improvements from unavailable landing quantities.

Coordinator routine correction, NOT a changed physical observation/event policy:
- Label interval “Apogee → touchdown”, computed from recorded summary apogeeTime
  and unique non-derived recorded touchdown event time, not deployment marker.
- Require recorded nominal touchdown, no explicit timeout, finite nonnegative
  chronological times and touchdown time exactly equal recorded flightTime.
  Both current native fields come from same touchdown_tau; no new tolerance.
- Missing/duplicate/derived touchdown or invalid/inconsistent clocks -> explicit
  unavailable reason, never fallback/interpolation/rerun. Real recorded zero is
  permitted when both timestamps legitimately agree, not inferred from absence.
- Landing speed/energy values unavailable on non-nominal/explicit timeout; their
  deltas only when BOTH current and previous report nominal touchdown. Other
  existing rows/deltas untouched. No new “better” direction or threshold.

No persistence/schema/input/key/model/WASM/physics/root/event/default changes.
No relabeling whole-vehicle energy as per-section or measured/qualified output.
Existing event velocity bases differ (main abs vertical, other native magnitudes,
sampled Max-Q airspeed); this lane does not change/reinterpret those records.

## Exact lease and verification

Own src/console/stages/{Recovery.tsx,Flight.tsx}, new
src/console/data/recoveryResults.ts/test.ts and
src/console/stages/recoveryResults.test.tsx, this records directory and current
coordination TASKS only. Read-only all core/engine/bridge/schema/stores/existing
RMP10a artifacts; no raw flight outcomes, new numerical study or RMP12 rerun.
Source/test broader changes require explicit extension before editing.

1. Tests demonstrating delayed activation interval bug, missing touchdown and
   non-nominal previous/current landing delta bugs before production edits.
2. Small pure recorded-data availability/interval helper + readout/compare fix.
3. Focused and affected Console tests, tsc, Vite-only build (unchanged b32e7b7c…
   WASM, not new engine acceptance), independent source/evidence review.
4. Local source/records and partial package/tracker checkpoints; no PASS inflation.

Resource check available11GiB; max2 test workers/one heavy task/serial reviewer.
External logs /home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-recovery-readouts/.
No broad browser/empirical scripts. Synthetic/manufactured tests are software
regressions, not new physical/numerical qualification. If browser check needed,
prospectively scope actual worker calls and fresh evidence directory first.
Focused review rework retains this same five-file lease: shared structured
landingAvailability reason, optional clock-carrier guards, exact post-fix label
assertion, explicit test-snapshot chronology/build-log supply. No new public DTO
or physical policy. Other-consumer duplicate-formula audit stays explicitly open.
RMP10-C04/C06/C07 progress only, parent partial; scientific/provider/guide/section/
structural/decision/platform/team/release obligations unchanged. No push/contact/
publication/paid provisioning/protected outcome access or automation restart.

## Accepted bounded software increment

First review REQUEST_CHANGES, rework rereview ACCEPT, no material findings.
Post-ACCEPT coordinator applied its nonblocking tooltip copy/test-isolation
recommendations (no main helper change); final79tests/10files, tsc5clean and
Vite3pass. Inventories1/2 retained, final3 reflects those small deltas. No native/
WASM/browser/numerical study calls. Local source add2c706ba8a09f0db613f38dd79d26069ea5af2 committed.
Source/compute lease released; no active task process. Records-only package
validator checkpoint; no broad consumer audit closure. New source work requires
fresh exact-base lease, not reuse of this assignment.
