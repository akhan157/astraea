# Astraea Round-19 Adversarial Audit (product-completion code)

**Disposition: CONDITIONAL GO — all reported HIGH/blocker/major findings fixed and verified; restricted-preview safety language retained pending flight-data closure.**
**Complete-product quality score: 8.2/10** (was 6.4/10 NO-GO at Round-17).

Scope: everything added by the product-completion program — 8 engines,
4 studios, shell wiring, interop2, emitter inventory. The Round-18 kernel
is untouched and not re-audited. Method: 5 DeepSeek evidence sweeps
(read-only, file:line findings with failing inputs); every HIGH/blocker/
major independently re-verified by the controller against source, several
with independent hand computation.

## Findings and verdicts

### Propulsion (BLOCKER + MAJOR — both fixed, fix independently verified)
- **P-BLOCKER (fixed):** `performance()` c* denominator was `γ·√expTerm`
  instead of `√(γ·expTerm)` — c*/Isp ~9.5% low, tests calibrated to the bug.
  Controller independently recomputed c* = 1489.1 (matches). Fixed + anchors
  re-derived (verified 22/22).
- **P-MAJOR (fixed):** Al2O3 sensible enthalpy added fusion+liquid below the
  2327 K melt (verified in source). Now piecewise; continuity spot-checked.
- MINORs fixed: condensed-phase γ, Pc overflow guard, burnRateCoeff doc,
  eng id-collision suffix.

### Evidence/recovery (3 MED — all fixed)
Header-swap silent misparse, NaN propagation, unvalidated calibration
fields — all confirmed in source, all fixed with new tests (27/27).

### Trajectory/formats (no HIGH; 5 MED hardening — fixed)
Formulas verified (boattail, ISA, ENU parity, eigen, OML, impulse scaling,
determinism, AbortSignal, mulberry32 bit-identical). NaN guards, sorted wind
tables, MC all-fail diagnostics, export validation added (71/71).

### UX coherence (3 HIGH — fixed)
Imported motors un-flyable, hardcoded C6, invisible mounts, phantom chute
events, stale MC, decorative sounding — fixed via shared motor selection,
bore prefilter, mount UI, staleness, sounding-driven wind, event gating.

### Emitter (no HIGH; M1/M2 hardening — fixed)
All 31 suites now byte-hash-cited; emitter count bound. Emitter passed=true
on clean tree.

## Remaining (ledger E1–E7 + flight-data loop)
No open correctness findings. Residual risk: physics models still validate
against published references, not flight data (E-loop open); browser-level
visual validation not performed in this environment (jsdom + build + serve).

Score 8.2/10: +2.4 for closed blockers/majors and coherence; −1.8 held back
for unflown empirical closure and unaudited-at-scale items (E1–E7).
