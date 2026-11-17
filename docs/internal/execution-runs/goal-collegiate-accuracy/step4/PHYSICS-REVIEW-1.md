# Step 4 physics review, round 1: REJECT

| | |
|---|---|
| Reviewer | OMP `deepseek/deepseek-flash` (V4.1 Flash), thinking max, full access. A different family from the K3 author (Claude Sonnet) and the orchestrator (Claude Opus). Owner-chosen on 2026-11-16 |
| Reviewed | `goal/collegiate-accuracy` @ `715ee54`, WASM `bc19590b` |
| Second opinion | The claude-sonnet-5-5 run failed on an API rate limit (429) and gave no verdict |

The reviewer's full text is in its T3 thread. Below is the orchestrator's summary, with the reproductions the orchestrator ran itself.

## Blocking findings (both reproduced by the orchestrator, `step4/SHA256SUMS.verify`)

1. **An oversized nozzle exit gives a non-physical apogee or crashes the engine.** In the power-on base-drag reduction, `mi = −f(M)·A_nozzle/ce` is never clamped (`calibrated/drag_subsonic.rs:346-356` and `drag_supersonic.rs:792-800`). The back-pressure term adds `A_e(p_SL − p)`. The only guard is 0–1 m.
   - **Orchestrator reproduction** on the candidate default (`out/verify/nozzle.probe.ts`):
     - byrum (0.076 m body) with a 0.5 m exit: 342,785,911,275,256 m;
     - calisp1 with a 0.5 m exit: `engine: internal failure … unreachable`, and the instance is unusable afterwards;
     - an exit equal to the body diameter: already +10–20 % (calisp1 1169 → 1410 m).
   - **Reviewer reproduction:** NASA SL with a 1.0 m exit (the UI maximum) gives 5,358.7 m.
2. **An ordinary wind breaks a default flight.** The drag ladder needs 5 rows with |α| ≤ 2° per station and phase, and it errors instead of falling back (`engine/models.rs:1299-1345`, `:1458-1470`).
   - **Orchestrator reproduction** on the candidate default (`out/verify/wind.probe.ts`, 23 flights × winds 0/3/6/9 m/s): full-metal-jacket 1 and 2 fail at 3, 6 and 9 m/s with "calibrated axial drag has no ascent rows for Mach station 0 in the powered phase". The app's default wind is 3.0 m/s. The other 21 flights run.

## Major findings

3. **Reference-area mismatch.** The calibrated Cd is referenced to the max body diameter, but the solver applies the mass-rollup `ref_diameter` (the last body tube). This happens at `engine/models.rs:896`, `mass.rs:644,670`, `from_vehicle.rs:423,456,870-876` and `six_dof.rs:1412`. A design whose nose or body diameters step gets its drag scaled by (ref/max)².
4. **The 5.6 % / 18-of-20 claim holds only when site temperature and nozzle exit are declared.** With blank inputs the result is 5.9 % / 16 with a −4 % bias. Neither the banner nor the landing page states the condition.
5. **The K4 "Typical error ±X %" line reads as a bound.** It is an in-sample MAE: 11 of 20 airframes fall inside it, the values come from 5–8 airframes per regime, and they apply regardless of geometry or wind.
6. **The landing sentence conflates two things.** It ties the refused-shape fallback to the legacy model's Mini DX3 blind test, but Mini DX3 is a supported shape. No refused shape has blind evidence.
7. **The nozzle back-pressure term is on by default** while assuming a sea-level static thrust curve and the motor's own exit area. Neither is verified, and the UI does not say so.

## Minor findings

8. The 25-station table under-resolves the transonic peak by 1.4–5.1 % in Cd at M 0.95.
9. The thrust correction is applied at t = 0 and during zero-thrust segments.
10. The ladder's row minimum and nearest-fill are fragile. The ladder is **not** the cause of the S1 space-shot low; the reviewer's probe found at most 0.67 % in Cd.
11. UNKNOWN is a conservative merged gate, not a physics defect.
12. Space shots: 2 of the 3 flights above M 2.5 come out about 12 % low, but dontdebatethis (M 3.11) is +2.9 %. The report must not call this a class bias.
13. The site-temperature column is a standard-day approximation, and the cohort temperatures are design inputs.
14. The "Flight model: Legacy (supported)" chip.
15. Dead nozzle code in `calibrated/atmosphere.rs:225-231`, and a wrong comment at `six_dof.rs:2036-2045`.

## Disposition

**Step 4 fails. The work returns to step 1.** No sealed set has been opened, and the blind test is not requested.

Fix lanes: **E1 (engine)** for findings 1, 2, 3, 9, 15 and possibly 8, and **A1 (app and wording)** for the input bound on finding 1 and findings 4–7 and 14. Wording goes to the owner. After both: re-run steps 2–3 and a physics re-review.
