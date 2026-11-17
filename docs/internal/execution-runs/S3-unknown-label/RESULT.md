# S3 Gate 1 — UNKNOWN validity label

Status: research complete; wording direction approved; author cannot self-accept. No validity gate or app change.

Candidate WASM SHA-256 `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`; cohort manifest SHA-256 `3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5`. Fresh tests-only K4-pattern probe ran 23 candidate-default flights (plus K4 comparison arms); `./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/K4-expected-error-line/s3-temporary.config.ts`: 1 test passed, 48.33 s. Temporary probe was a copy of K4 with output redirected; configuration used two workers. Full output: `/home/ak/astraea-evidence/goal-collegiate-accuracy/S3/cand.json`. 19 UNKNOWN, 4 PASS.

The result has no per-evaluation list, reason, or domain flag. `offNominalExcursion` is the only combined excursion flag; `enveloped`, `touchdownNominal`, `terminationReason`, and `unsupportedHandling` are also reported. All UNKNOWN rows have `offNominalExcursion: true`, `enveloped: true`, `touchdownNominal: true`, `terminationReason: "touchdown"`, and `unsupportedHandling: "continue-and-mark-UNKNOWN"`. The specific triggering evaluation cannot be given verbatim from these results. PASS rows have `offNominalExcursion: false`.

| Run | Validity | Trigger detail exposed |
|---|---|---|
| qu8k | UNKNOWN | Not exposed; offNominalExcursion: true |
| proteus6 | UNKNOWN | Not exposed; offNominalExcursion: true |
| dontdebatethisn5800mindia | UNKNOWN | Not exposed; offNominalExcursion: true |
| kinsel-p4935-a-601-rocket | UNKNOWN | Not exposed; offNominalExcursion: true |
| full-metal-jacket1 | UNKNOWN | Not exposed; offNominalExcursion: true |
| full-metal-jacket2 | UNKNOWN | Not exposed; offNominalExcursion: true |
| l500roc | UNKNOWN | Not exposed; offNominalExcursion: true |
| torrent | PASS | None reported |
| rabia | PASS | None reported |
| rabia-shortfincan | PASS | None reported |
| blister | PASS | None reported |
| raven | UNKNOWN | Not exposed; offNominalExcursion: true |
| iondrive | UNKNOWN | Not exposed; offNominalExcursion: true |
| cancerdescending | UNKNOWN | Not exposed; offNominalExcursion: true |
| byrum | UNKNOWN | Not exposed; offNominalExcursion: true |
| calisp4 | UNKNOWN | Not exposed; offNominalExcursion: true |
| calisp5 | UNKNOWN | Not exposed; offNominalExcursion: true |
| ezi65-1 | UNKNOWN | Not exposed; offNominalExcursion: true |
| calisp1 | UNKNOWN | Not exposed; offNominalExcursion: true |
| gibb | UNKNOWN | Not exposed; offNominalExcursion: true |
| calisp2 | UNKNOWN | Not exposed; offNominalExcursion: true |
| calisp3 | UNKNOWN | Not exposed; offNominalExcursion: true |
| thunder-lightning | UNKNOWN | Not exposed; offNominalExcursion: true |

In `crates/astraea-core/src/six_dof.rs:2458`, domain evaluations are collapsed to a worst `StageValidity` at lines 2493 and 2499, losing the individual reason. Accepted integration stages are reduced again at line 668, then folded into booleans at lines 3093–3105 and 3782–3792. Lines 3599–3608 reduce these to the summary. `crates/astraea-engine/src/models.rs:1100` and `:1231` expose the summary and combined flag, not individual causes. The display telemetry is bounded/decimated and does not contain evaluation validity; it cannot establish which committed evaluation triggered a row. [INFERENCE] No defensible per-run attribution to canopy Mach or tail-first flow can be made from this output.

The label means the engine did not establish validity for the complete run under its current rules; it does not mean that the predicted flight is necessarily wrong. The engine also uses UNKNOWN for non-nominal touchdown and envelope conditions, so wording must cover those cases as well as the 19 observed excursions.

Approved direction: a tooltip on the existing “Validity unknown” chip, with no extra persistent UI or gate change. Exact one-line text: **“The engine could not establish validity for the whole flight under its current conditions.”** This avoids claiming a specific unobserved cause. Leaving the chip as-is is an option but explains less. Classifying an additional domain requires independent measured evidence for that domain and the quantities affected; software checks alone do not qualify it. An engine classification or detail-exposure change is a later decision and requires a WASM rebuild. No run is promoted to valid by this proposal.

Falsifier for wording: any UNKNOWN path in the engine for which the engine did establish validity for the whole flight under its current conditions. No app implementation or UI verification was performed.

## Orchestrator disposition (2026-11-15)

**Probe output.** `astraea-evidence/goal-collegiate-accuracy/S3/cand.json`, sha256 `be7d0ef2…`, byte-identical to the K4 probe output.

**Counts on the candidate.**
- 19 of 23 flights are UNKNOWN, 4 PASS.
- The 4 PASS flights are torrent, rabia ×2 and blister.
- Over the 20 primary airframes, 17 are UNKNOWN.

**Cause cannot be attributed.** The engine merges canopy Mach, altitude and the flight envelope (`domain_worst`, `six_dof.rs:2493`), plus the tail-first-flow and non-finite checks, into one `offNominalExcursion` result. So no run's UNKNOWN can be traced to a specific evaluation without an engine change.

**Decision: no change in this release.**
- The proposed tooltip ("could not establish validity for the whole flight under its current conditions") restates the label and adds nothing a user can act on. The minimal-UI rule weighs against adding it.
- Exposing per-evaluation reasons needs an engine change and a WASM rebuild late in the cycle. It does not touch accuracy.
- No validity gate is changed or promoted.

**For the Release Readiness Report.**
- State that most cohort runs, 17 of 20 airframes, carry "Validity unknown".
- State that the label means the engine could not classify every evaluation as in-domain. It does not mean the apogee is wrong: the UNKNOWN airframes are inside the 5.6 % MAE result.
- Future work: expose the per-evaluation reason in the engine result, so the label can name its cause.
