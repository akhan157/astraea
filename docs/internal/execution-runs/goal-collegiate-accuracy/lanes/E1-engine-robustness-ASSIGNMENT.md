# Lane assignment: E1, built-up drag robustness (engine)

Status: **drafted 2026-11-16.** Gate 1 comes first.

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit (after `ad65840`) |
| Why | Step-4 physics review round 1 REJECT: [`step4/PHYSICS-REVIEW-1.md`](../step4/PHYSICS-REVIEW-1.md). Two blocking defects in the new default, both reproduced by the orchestrator |
| Reviewer | A different family from the author. No self-acceptance |
| Engine rule | The engine changes in this lane, so the WASM must be rebuilt **by the orchestrator from the goal-worktree path** (Amendment 1). Every number downstream is then re-measured: P1–P4, the K4 band module, the W1 text figures, templates, and steps 2–3 |

## Defects to fix

1. **Oversized nozzle exit (blocking).**
   - The power-on base-drag reduction `mi = −f(M)·A_nozzle/ce` is unclamped at `crates/astraea-core/src/calibrated/drag_subsonic.rs:346-356` and `drag_supersonic.rs:792-800`, so Cd can go negative.
   - An exit as large as the body gives a non-physical apogee: 3.4e14 m on byrum with a 0.5 m exit. On calisp1 it traps the engine (`unreachable`) and leaves the instance unusable.
   - Required:
     - a **physical bound**: the nozzle exit must not exceed the base or aft body diameter at the design level. Refuse clearly, either as a legacy fallback with a reason or as an input refusal, and propose which in Gate 1.
     - power-on Cd must stay ≥ 0, or the base term ≥ 0;
     - **no trap**: every input must fail with an error message, never `unreachable`. Find the trap's cause and fix it.
     - regression tests at 0.05 m, the body diameter, 0.5 m and 1.0 m on a 0.076 m airframe, plus the calisp1 trap case.
2. **The drag ladder fails under wind (blocking).**
   - `crates/astraea-engine/src/models.rs:1299-1345` and `:1458-1470` need 5 rows with |α| ≤ 2° per station and phase, and they error instead of falling back.
   - On the candidate default, full-metal-jacket 1 and 2 fail at 3, 6 and 9 m/s. The app's default wind is 3 m/s.
   - Required: a flight that can be flown must never hard-fail on ladder construction. Propose one of these in Gate 1 and justify it physically:
     - a cross-phase nearest fill;
     - a relaxed |α| gate for low-q rows;
     - a fixed-step ladder pass;
     - as the last resort, the legacy fallback with a stated reason.
   - Regression test: a wind sweep from 0 to 10 m/s over all 23 cohort designs. Zero errors.
3. **Reference-area mismatch (major).** The calibrated Cd is referenced to `max_diameter` (`from_vehicle.rs:870-876`, `drag_*.rs` `ce`), but the solver applies the mass-rollup `ref_diameter` (`engine/models.rs:896`, `mass.rs:644,670`, `six_dof.rs:1412`).
   - Make them consistent: rescale the Cd table to the solver's reference area at the hand-off.
   - Show on which cohort designs the two differ. If any cohort number moves, P1–P3 must be re-checked, and **a regime that gets worse is a FAIL**, not a tuning opportunity.
4. **Thrust term at zero thrust (minor).** The back-pressure term at `six_dof.rs:2412-2418` is applied at t = 0 and during zero-thrust segments. Apply it only while the motor thrust is above 0.
5. **Cleanup (minor).** Remove the dead duplicate at `calibrated/atmosphere.rs:225-231` or point it at the real term. Fix the wrong comment at `six_dof.rs:2036-2045`; 60 kN is not reached "at the pad".

**Out of scope:**
- the transonic station count (finding 8), unless Gate 1 shows it is cheap; it would re-baseline everything;
- all wording, which goes to lane A1;
- tuning to the cohort.

## Gate 1 (send before edits)

For each defect, report:
- the mechanism, with file:line;
- the chosen fix and why it is physically right;
- **which cohort or template numbers can move, and by how much**, measured with a scratch build if needed;
- the falsifier.

## Acceptance

- `cargo test` core and engine pass, plus new regression tests that fail on the current code.
- **No cohort, template or development-vehicle number moves**, except where defect 3 or 4 changes it. Every such move is listed with its value and re-checked against P1–P3.
- The WASM is rebuilt by the orchestrator, and the new hash is recorded.

## Rules

- No sealed data. Never open `R6-public-cohort/`, any book library, or `docs/flight-validation/round2-results.md`.
- No threshold or tolerance changes. No push or network. Use two jobs.
- The author cannot self-accept.
