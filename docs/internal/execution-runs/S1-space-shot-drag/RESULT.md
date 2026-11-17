# S1: space-shot drag. Gate 1 outcome: STOP AS UNPROVEN

**Lane.** Author codex `gpt-6.1-terra`, medium effort, research only. Checkout `/home/ak/.t3/worktrees/astraeat3/t3-0a0d7456-869251f12600331f` at `64313c8`. Decided by the orchestrator on 2026-11-15.

**Finding.** On the candidate, qu8k (M 3.4) and proteus6 (M 2.8) both predict about 12.2 % low. Two flight outcomes cannot show which drag component or input caused the error.

**Derivation.** No specific defect above M 2.5 was found. The built-up high-Mach path is in `crates/astraea-core/src/calibrated/drag_supersonic.rs:498`, with interpolation knots cited at `:146`.

**Independent data.** The RMP08 ARCAS record says its supersonic drag lacks comparable base-corrected data. Its CNα/CP data do not validate axial drag. The author found no independent, non-cohort axial-drag data for M 2.5–3.5. This is a bounded search, not proof that none exists.

**Disposition.** No change; the effect is zero in every regime. Under GOAL.md (a gap with no measured data stops at Gate 1 as an "unproven" label, not a tuned law), the Release Readiness Report states: "Space-shot apogee (M > 2.5) predicted about 12 % low on 2 published flights; cause unproven."

**What would unblock it.**
- a traceable derivation defect; or
- independently measured, applicable M 2.5–3.5 axial-drag data.

Any later fix must pass P1–P3, including P2 at T = 0, and re-measure the K4 band and the templates.

No probe ran and no files were edited.
