# RMP19 1b — independent review

Reviewer: coordinator (this session). Author: research session. Two review
rounds; no author self-acceptance.

## Round 1 — slice 1a (provider + adapter)

Reviewed `e4678a4` against `main`: scope confined to `astraea-core`, no flight
engine change, no vendor data. Accepted with required changes:

- user-facing refusals must not name the vendor format (five strings);
- the 1-ulp residual must be produced by the test, not only stated;
- README must state the app nose mapping, the ordered-chain adapter rule and the
  three assumptions (smooth surface, no turbulent forcing, no nozzle exit).

Round 2 (`f448985`/`a1abf12`) fixed the wording and documented the assumptions.
The residual was already computed and printed by the test; verified.

## Round 2 — engine, bridge and beta UI (1b)

Reviewed `5d68fb6` and `faab9b5`, then `d76c300`. Verified independently:

- `tsc` clean; focused panel/wording tests 6/6; Rust parity/adapter/engine tests
  pass (1/6/58) in a fresh run; production-CSP browser journey re-run in a
  separate evidence directory and passed.
- Scope: no `simulate_flight` data path, no `prepare_flight_vehicle`/`six_dof`
  change, no default change, no formats, no register edits.
- Refusal happens before any case, archive, analysis record or engine call, for
  both flight and Monte Carlo.
- Legacy invariance when no selection is present; persistence through
  save/reopen.

Rejected wording (fixed in `d76c300`): the Aero subtitle, the panel paragraph and
the confidence sentence still described the legacy Barrowman/Hoerner model when
the built-up model supplied the numbers. Also required: disable the beta toggle
under the candidate flight model, and state the `airfoil` limitation under the
control. All three are in `d76c300` and verified.

## Verdict

**RMP19-C01–C07 pass** on the evidence in this directory. **C08 (engine corpus
native re-run), C09 (provenance page) and C10 (flight path 1c) are not run**;
**C11 (default-on) is blocked** on C08, held-out flights and the owner decision.
Merged as `1246fda` with the beta off by default.


## Post-acceptance finding (2026-10-31)

`terms.transonic` is validated but never used: `aero_provider.rs` always
evaluates the method's own transonic blend. The 1b UI text ("the transonic term
is the legacy one") is therefore false and the recorded identity would
misdescribe the model, deviating from the frozen hybrid decision. **C02 and C03
are reopened.** The beta surface must be disabled (or the composition
implemented) before anything else; 1c is not approved until the composition
lands. C01/C04/C05/C06/C07 are unaffected; C08 was verified independently
(40/40 designs, 36,936 rows, worst 1.5535e-6) and will be recorded when its
test is merged with the corrective commit.


## Corrective round (f7dd01f)

Accepted: the engine refuses `terms.transonic='legacy'` before evaluating, the
beta control is disabled with an explicit note, the wording no longer claims a
legacy term, and the pre-correction screenshots are retained under
`raw/pre-correction/`. C08 was verified independently (40/40 designs, 36,936
rows, worst 1.5535456002007316e-6) and recorded as pass. C02/C03 stay reopened
until the composition lands and the UI returns. 1c remains unapproved.


## Composition round (885a083)

Accepted. Mechanism is the approved total-CD blend (the only honest option with
no separable term), band 0.80-1.20 with C1 weights, both totals at the same
reference atmosphere, breakdown withheld in the band, version/term pairs
(`1.0.0`+`buildup`, `1.1.0`+`legacy`), defective 1b projects load but never
execute with an explicit choice, and the beta UI re-enabled with a truthful
hybrid label. Coordinator verified: engine 63/63, focused TS 68/68, fresh-build
production-CSP journey (hybrid panel, refusal, persistence, legacy run), seam
table consistent. C02/C03 re-recorded as pass; the override limitation inside
the band stays disclosed. C09 next; 1c after.


## Provenance round (c53b9b0)

Accepted. The dialog is self-contained, opens from the panel, the status row and
the `#aero-model-provenance` hash, traps focus, closes with Escape/Close and
clears the hash. It carries the global disclaimer, the composition wording, the
four term classes, the six unvalidated legacy constants, the method-only C08
qualifier, the limits and plain-text citations; no vendor strings, no links, no
validation or 1.0 language. Coordinator verified tsc, 16 focused tests, a fresh
production-CSP build (panel and hash opens, close, hash cleared) and the
rendered content. C09 recorded as pass.


## 1c candidate (915392c) — gate failed, not merged

The flight path was implemented and measured against the pre-registered 0.5 %
gate. It fails: 24 of 27 single-stage metrics exceed the gate, worst kinsel
apogee 29.29 %. The attribution test shows the missing site/nozzle inputs do
not explain the residual (best mixed apogee 3.74 %, most combinations worse),
and the legacy baseline is itself 17.90 % mean apogee, so neither model is a
0.5 % reference. No tuning; the staged dumps are not applicable to the
single-stage solver. **Decision: hold the lane; C10 stays not run; the beta
remains panels-only.** Further work is an owner-level decision (a justified
acceptance criterion or model research), not a tolerance change here.


## Owner decision (2026-11-01)

The flight path stays **held**; experimental enablement is declined. The
owner authorized the bounded matched-state diagnostic (aero at the engine's own
trajectory states) to determine whether the residual is aero or solver. No
tuning, no gate change, no product change until that evidence exists.


## Matched-state diagnostic (2026-11-01)

Accepted. The engine dumps carry CD/CL/CP/CG/thrust/weight/drag per step. At
the engine's own states, the method is 8.3-40.8 % low (per-flight mean) with the app's current
inputs; with the design inputs the engine used (surface finish, turbulent
flag, fin airfoil section/bevels/LE radius, rail guide/lug/shoe) it matches
to **0.001-0.456 %** per-flight mean CD (pooled 0.123 %; CP per-flight mean
0-2.26 %, per-row max 6.81 %). Mass/CG/thrust were not measured: the test's
burn vectors are empty (n=0), so the report's 0.000 % is withdrawn. The hybrid
remains 0.09-6.86 % (legacy override in band), and engine-CD replay through
our 6-DOF is 0.1-7.9 % on 8/9 flights, so the end-to-end gate is not expected
to pass even after the input fix. **Diagnosis: input plumbing, not
coefficients.** The fix is a separate product slice (typed inputs, import/UI,
airfoil mapping) and stays deferred; the flight path remains held.

Independent review (MatchedStateReview, 2026-11-02): ACCEPT-WITH-CORRECTIONS.
Corrected inputs come from each corpus `design.json` (no fitting, no engine CD
read back); the diagnostic code is test-only. Corrections applied: base range,
pooled mean, mass/CG/thrust claim withdrawn, CP qualified, 1c maxV count 8/9
(was 5/9). Because mass/CG/thrust are unverified, the 0.1-7.9 % replay residual
is a 6-DOF/table difference, not attributed to the solver alone. The raw
`REPORT.md` is kept byte-identical; see `ERRATA.md` beside it.
