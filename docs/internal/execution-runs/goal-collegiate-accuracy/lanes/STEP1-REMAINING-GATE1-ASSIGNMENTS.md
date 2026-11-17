# Step 1, remaining items: research Gate 1 assignments (2026-11-15)

GOAL.md Revision 3, step 1, lists items beyond K3–K5. Each one gets its **own lane**. Each lane's first turn is a **research-only Gate 1**: no source or test edits, read-only measurement only, and scratch output under `out/<lane>/` or `astraea-evidence/goal-collegiate-accuracy/<lane>/`.

Gate 1 decides one of three dispositions:
- **implement**: a separate turn after approval;
- **stop as "unproven"**: no measured data supports a change. GOAL.md says that a gap with no measured data stops at Gate 1 as an "unproven" label, not a tuned law;
- **external**: the exact input that would unblock it is named.

## Common pin and rules

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit (after T1 `63fec45`) |
| Author | codex `gpt-6.1-terra`, medium effort |
| Candidate WASM | `/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm`, sha256 `bc19590b…`. The engine has not changed since step 0 |
| Cohort | `/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json`, sha256 `3bd28077…`. Reuse the K4 probe pattern (`docs/internal/execution-runs/K4-expected-error-line/cohort.probe.ts`) |

- Never open `/home/ak/astraea-evidence/R6-public-cohort/`, any book library, or `docs/flight-validation/round2-results.md`.
- No tuning to the cohort beyond what its frozen rules allow. No threshold changes.
- An engine change moves P1–P3, K4's band values, W1's text and the templates. Any implementation must re-measure all of those, and a template move is owner stop (c) again.
- Do not promote a validity gate or label from software checks. A run may move from UNKNOWN to valid only with evidence.
- No push or network. Run `free -h` first and use two jobs. The author cannot self-accept.

## S1: space-shot drag (engine)

**Why.** qu8k (M 3.4) is −12.2 % and proteus6 (M 2.8) is −12.2 % on the candidate. Both run low, and the supersonic regime carries the largest MAE.

**Gate 1 must answer:**
1. Is there an identifiable **derivation defect** at M > 2.5? Cite file:line in the built-up drag method, and the reference it should follow. Or are there only two data points to fit?
2. What independent, non-cohort reference data covers M 2.5–3.5 for these shapes, already in the repo or the evidence folder? No downloads.
3. The proposed change, if any, and its expected effect on every regime. **P2 at T = 0 binds:** proteus6 is in the primary supersonic regime, so no regime may get worse.
4. The falsifier.

With no defect and no independent data, the lane **stops as "unproven"**, and the report labels space-shot apogee as about 12 % low.

## S2: refused shapes (measure first)

**Why.** The built-up model refuses elliptical and freeform fins, extra transitions, and a tube after the boattail or fin can. Refused designs fly legacy drag.

**Gate 1 must answer:**
1. **Tests-only measurement:** does any cohort airframe fly refused on the candidate? List all 23 with the drag outcome.
2. Which typical collegiate shapes are refused? Use the repo's templates, example projects and fixtures; no new data. Count them and give the refusal reason for each.
3. For any refused shape: is there **flown data** to qualify an extension? If not, it stops as "unproven" and the refusal note stays as it is.
4. The falsifier.

## S3: the UNKNOWN validity label

**Why.** Before K3, 19 of 23 runs carried UNKNOWN (a load evaluation outside the classified domain). On the Flight screen, "Validity unknown" sits beside the new "Typical error" line.

**Gate 1 must answer:**
1. **Tests-only count on the candidate:** how many of the 23 cohort runs are UNKNOWN, and which evaluation causes each (file:line, engine or app)?
2. What the label means for a user, and whether it is accurate.
3. Options:
   - (a) wording that explains it, with no gate change;
   - (b) classifying a domain, which needs evidence; name it;
   - (c) leave it.

   Any run that moves from UNKNOWN to valid must be backed by evidence; renaming is not enough.
4. If the classification lives in the engine, say so. A change there means a WASM rebuild.

## S4: non-apogee outputs (tests-only)

**Why.** The IREC and NASA SL rules use rail exit speed, stability margin (for example 7.5 % or 10 % of length, or calibers), and descent rates. The benchmark covers apogee only.

**Gate 1 must answer:**
1. For each output (rail exit speed, stability margin, max Mach, time to apogee, descent rate under drogue and main, landing drift): is there **measured data** in the cohort manifest or the development evidence? List the sources.
2. For each output with data: propose a tests-only comparison table, without running it, and a pre-fixed reporting rule.
3. For outputs with no data: a "no evidence" row in the Release Readiness Report.
4. Cite the sources the rules use, from repo documents only, with no new searches.

## Dispositions recorded without a lane

- **"Uncertainty with model error":** K4's in-sample band is what ships. P8 is 11/20, against the 80 % rule, report-only. There is no further lane, because without out-of-sample data any wider band would be tuning.
- **"Team validation":** K5 was dropped under its frozen rule.
